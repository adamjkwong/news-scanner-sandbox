import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch details of a single Hacker News story
async function fetchHNStory(id) {
  try {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    if (!res.ok) throw new Error(`HN API error for item ${id}`);
    return await res.json();
  } catch (error) {
    console.error(`Error fetching HN item ${id}:`, error);
    return null;
  }
}

// Generate summary using Gemini API
async function generateSummary(title, url, text, industry, apiKey) {
  const prompt = `You are an expert industry analyst. Analyze this Hacker News article for the target industry: "${industry}".
Article Title: ${title}
Article Link: ${url || 'N/A'}
${text ? `Article Snippet/Text: ${text.substring(0, 1000)}` : ''}

Provide a 2-sentence summary explaining "Why this matters for the ${industry} industry".
Rules:
1. Must be exactly two sentences.
2. Directly explain the implications, threats, or opportunities for the specified industry.
3. Be professional, direct, and insightful.
4. Do not include any intro, outro, headers, markdown lists, or meta-commentary. Just return the two sentences.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error('Empty response from Gemini API');
    }

    return generatedText.trim();
  } catch (error) {
    console.error(`Error generating Gemini summary for "${title}":`, error.message);
    return `Could not generate summary: ${error.message}`;
  }
}

// API endpoint to fetch top 5 stories and summarize them
app.post('/api/summarize', async (req, res) => {
  const { industry } = req.body;
  
  // Try getting API key from header or env
  const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;

  if (!industry) {
    return res.status(400).json({ error: 'Industry is required' });
  }

  if (!apiKey || apiKey.trim() === '') {
    return res.status(401).json({ error: 'API_KEY_REQUIRED', message: 'Gemini API Key is required. Please set it in settings or the server environment.' });
  }

  try {
    // 1. Fetch top story IDs
    const topStoriesRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!topStoriesRes.ok) {
      throw new Error(`Failed to fetch top stories: HTTP ${topStoriesRes.status}`);
    }
    const storyIds = await topStoriesRes.json();
    
    // Slice first 5 story IDs
    const top5Ids = storyIds.slice(0, 5);

    // 2. Fetch details for all 5 stories concurrently
    const storiesPromises = top5Ids.map(id => fetchHNStory(id));
    const rawStories = await Promise.all(storiesPromises);

    // Filter out null values
    const validStories = rawStories.filter(story => story !== null);

    // 3. Generate summaries concurrently
    const summarizedStories = await Promise.all(
      validStories.map(async (story) => {
        const title = story.title || 'Untitled';
        const url = story.url || '';
        const text = story.text || '';
        const score = story.score || 0;
        const author = story.by || 'unknown';
        const id = story.id;

        const summary = await generateSummary(title, url, text, industry, apiKey);

        return {
          id,
          title,
          url,
          score,
          author,
          hnUrl: `https://news.ycombinator.com/item?id=${id}`,
          summary
        };
      })
    );

    res.json({
      industry,
      stories: summarizedStories
    });
  } catch (error) {
    console.error('Error in /api/summarize:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// Fallback to index.html for single page app experience
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
