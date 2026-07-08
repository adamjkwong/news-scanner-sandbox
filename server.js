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

// Prompt constructor
function buildPrompt(title, url, text, industry) {
  return `You are an expert industry analyst. Analyze this Hacker News article for the target industry: "${industry}".
Article Title: ${title}
Article Link: ${url || 'N/A'}
${text ? `Article Snippet/Text: ${text.substring(0, 1000)}` : ''}

Provide a 2-sentence summary explaining "Why this matters for the ${industry} industry".
Rules:
1. Must be exactly two sentences.
2. Directly explain the implications, threats, or opportunities for the specified industry.
3. Be professional, direct, and insightful.
4. Do not include any intro, outro, headers, markdown lists, or meta-commentary. Just return the two sentences.`;
}

// Generate summary using Gemini API
async function generateGeminiSummary(prompt, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.2 }
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini API');
  return text.trim();
}

// Generate summary using OpenAI API
async function generateOpenAISummary(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI API');
  return text.trim();
}

// Generate summary using Anthropic (Claude) API
async function generateAnthropicSummary(prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Anthropic API');
  return text.trim();
}

// Generate summary using local Gemma 4 (Ollama)
async function generateGemmaSummary(prompt) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4:e4b',
      prompt: prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama service returned HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log("Ollama Response Data:", data);
  if (data.error) {
    throw new Error(data.error);
  }
  const text = data.response;
  if (!text) throw new Error('Empty response from local Gemma 4');
  return text.trim();
}

// Dispatch summary generation based on selected model
async function generateSummary(title, url, text, industry, model, keys) {
  const prompt = buildPrompt(title, url, text, industry);
  try {
    switch (model) {
      case 'gemini':
        if (!keys.gemini) throw new Error('Gemini API key is required');
        return await generateGeminiSummary(prompt, keys.gemini);
      case 'openai':
        if (!keys.openai) throw new Error('OpenAI API key is required');
        return await generateOpenAISummary(prompt, keys.openai);
      case 'claude':
        if (!keys.claude) throw new Error('Anthropic API key is required');
        return await generateAnthropicSummary(prompt, keys.claude);
      case 'gemma':
        return await generateGemmaSummary(prompt);
      default:
        throw new Error(`Unsupported model type: ${model}`);
    }
  } catch (error) {
    console.error(`Error generating ${model} summary for "${title}":`, error.message);
    return `Could not generate summary: ${error.message}`;
  }
}

// API endpoint to fetch top 5 stories and summarize them
app.post('/api/summarize', async (req, res) => {
  const { industry, model = 'gemini' } = req.body;
  
  // Extract keys from request headers or environment variables
  const keys = {
    gemini: req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY,
    openai: req.headers['x-openai-key'] || process.env.OPENAI_API_KEY,
    claude: req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY
  };

  if (!industry) {
    return res.status(400).json({ error: 'Industry is required' });
  }

  // Validate API keys for cloud models
  if (model === 'gemini' && (!keys.gemini || keys.gemini.trim() === '')) {
    return res.status(401).json({ error: 'API_KEY_REQUIRED', message: 'Gemini API Key is required. Please check configuration.' });
  }
  if (model === 'openai' && (!keys.openai || keys.openai.trim() === '')) {
    return res.status(401).json({ error: 'API_KEY_REQUIRED', message: 'OpenAI API Key is required. Please check configuration.' });
  }
  if (model === 'claude' && (!keys.claude || keys.claude.trim() === '')) {
    return res.status(401).json({ error: 'API_KEY_REQUIRED', message: 'Anthropic API Key is required. Please check configuration.' });
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

    // 3. Generate summaries sequentially
    const summarizedStories = [];
    for (const story of validStories) {
      const title = story.title || 'Untitled';
      const url = story.url || '';
      const text = story.text || '';
      const score = story.score || 0;
      const author = story.by || 'unknown';
      const id = story.id;

      const summary = await generateSummary(title, url, text, industry, model, keys);

      summarizedStories.push({
        id,
        title,
        url,
        score,
        author,
        hnUrl: `https://news.ycombinator.com/item?id=${id}`,
        summary
      });
    }

    res.json({
      industry,
      model,
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
