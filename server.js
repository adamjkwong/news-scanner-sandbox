import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Server memory cache (15 min TTL)
const summaryCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCachedSummary(url, industry, model) {
  const key = `${url}_${industry}_${model}`;
  if (summaryCache.has(key)) {
    const entry = summaryCache.get(key);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.value;
    }
    summaryCache.delete(key);
  }
  return null;
}

function setCachedSummary(url, industry, model, summary) {
  const key = `${url}_${industry}_${model}`;
  summaryCache.set(key, { value: summary, timestamp: Date.now() });
}

// Rate limiter middleware (Max 10 runs per minute per IP)
const rateLimitStore = new Map();
const rateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const timestamps = rateLimitStore.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  
  if (timestamps.length > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute before retrying.' });
  }
  next();
};

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com http://localhost:11434; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
  next();
});

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

// Fetch and extract text from a custom URL
async function fetchAndExtractText(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();

    // SSRF Prevention: Block direct localhost and private networks
    if (host === 'localhost' || 
        host === '127.0.0.1' || 
        host === '::1' || 
        host.startsWith('192.168.') || 
        host.startsWith('10.') || 
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
      throw new Error('Access to local/private network hosts is restricted.');
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NewsScannerSandbox/1.0; (+https://github.com/adamjkwong/news-scanner-sandbox; compliance-check)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Scanned Article';

    // Strip scripts, styles, and tags
    let textContent = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit text size sent to LLM to prevent token overflows (approx 6000 chars)
    let excerpt = textContent.substring(0, 6000);

    // Detect if content is just a generic cookie/bot warning or too sparse to be useful
    const lowerExcerpt = excerpt.toLowerCase();
    const isUseless = excerpt.length < 250 || 
                      lowerExcerpt.includes('enable javascript') || 
                      lowerExcerpt.includes('cloudflare') || 
                      lowerExcerpt.includes('access denied') ||
                      lowerExcerpt.includes('robot check') ||
                      lowerExcerpt.includes('captcha') ||
                      lowerExcerpt.includes('cookie settings') ||
                      lowerExcerpt.includes('agree to our cookies');

    if (isUseless) {
      console.warn(`Scraped page content for ${url} is sparse or a bot check. Discarding text context.`);
      excerpt = '';
    }

    return { title, excerpt };
  } catch (error) {
    console.error(`Error scraping URL "${url}":`, error.message);
    throw new Error(`Failed to read the target URL: ${error.message}`);
  }
}

// Construct highly analytical, specific industry prompts
function buildPrompt(title, url, text, industry) {
  return `You are a principal industry analyst. Provide a highly strategic, professional, and concrete 2-sentence business impact analysis of the following article for the target industry: "${industry}".

Article Title: ${title}
Article Link: ${url || 'N/A'}
${text ? `Article Text excerpt: ${text.substring(0, 3000)}` : ''}

Rules:
1. Return exactly 2 sentences. No headers, lists, markdown bold (*), or introductory text.
2. Sentence 1: Analyze the core technical innovation, news event, or discovery, and connect it directly to the target industry's current landscape.
3. Sentence 2: Explain the direct, actionable business opportunity, threat, cost impact, or future trend for companies/professionals in that industry.
4. DO NOT use generic fillers like "this matters because it affects efficiency" or "healthcare companies can use this." Be specific. Use concrete concepts (e.g. data sovereignty, ZFS pool overheads, vendor lock-in, HIPAA auditing, diagnostic pipelines, edge network latency, capital expenditures, zero-trust architectures).
5. Ensure both sentences are detailed, complex, and analytically complete. Do not write short, sparse, or superficial sentences.`;
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
        generationConfig: { maxOutputTokens: 250, temperature: 0.2 }
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
      max_tokens: 250,
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
      max_tokens: 250,
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
  if (data.error) throw new Error(data.error);
  const text = data.response;
  if (!text) throw new Error('Empty response from local Gemma 4');
  return text.trim();
}

// Dispatch summary generation based on selected model
async function generateSummary(title, url, text, industry, model, keys) {
  // Check memory cache first to ensure efficient execution
  if (url) {
    const cachedSummary = getCachedSummary(url, industry, model);
    if (cachedSummary) {
      console.log(`[Cache Hit] Serving summary from memory: ${url}`);
      return cachedSummary;
    }
  }

  const prompt = buildPrompt(title, url, text, industry);
  try {
    let summary;
    switch (model) {
      case 'gemini':
        if (!keys.gemini) throw new Error('Gemini API key is required');
        summary = await generateGeminiSummary(prompt, keys.gemini);
        break;
      case 'openai':
        if (!keys.openai) throw new Error('OpenAI API key is required');
        summary = await generateOpenAISummary(prompt, keys.openai);
        break;
      case 'claude':
        if (!keys.claude) throw new Error('Anthropic API key is required');
        summary = await generateAnthropicSummary(prompt, keys.claude);
        break;
      case 'gemma':
        summary = await generateGemmaSummary(prompt);
        break;
      default:
        throw new Error(`Unsupported model type: ${model}`);
    }

    // Cache the successful summary
    if (url && summary) {
      setCachedSummary(url, industry, model, summary);
    }
    return summary;
  } catch (error) {
    console.error(`Error generating ${model} summary for "${title}":`, error.message);
    throw error;
  }
}

// API endpoint to fetch and summarize (Streaming Response)
app.post('/api/summarize', rateLimiter, async (req, res) => {
  const { industry, model = 'gemini', targetType = 'hn', targetUrl = '', delay = 2500 } = req.body;
  console.log(`[API Request] model=${model}, targetType=${targetType}, targetUrl="${targetUrl}", industry="${industry}", delay=${delay}`);
  
  // Extract keys from request headers or environment variables
  const keys = {
    gemini: req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY,
    openai: req.headers['x-openai-key'] || process.env.OPENAI_API_KEY,
    claude: req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY
  };

  // Configure response headers for Server-Sent Events (SSE) stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (message) => {
    res.write(`data: ${JSON.stringify({ type: 'status', message })}\n\n`);
  };

  const sendError = (message) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  };

  const sendResult = (stories) => {
    res.write(`data: ${JSON.stringify({ type: 'result', stories })}\n\n`);
    res.end();
  };

  if (!industry) {
    return sendError('Industry is required');
  }

  // Validate API keys for cloud models
  if (model === 'gemini' && (!keys.gemini || keys.gemini.trim() === '')) {
    return sendError('API_KEY_REQUIRED_GEMINI');
  }
  if (model === 'openai' && (!keys.openai || keys.openai.trim() === '')) {
    return sendError('API_KEY_REQUIRED_OPENAI');
  }
  if (model === 'claude' && (!keys.claude || keys.claude.trim() === '')) {
    return sendError('API_KEY_REQUIRED_CLAUDE');
  }

  try {
    if (targetType === 'url') {
      // SCAN CUSTOM URL
      sendProgress(`Connecting to custom URL: ${targetUrl}...`);
      const { title, excerpt } = await fetchAndExtractText(targetUrl);

      sendProgress(`Scraped page content successfully. Analyzing text...`);
      sendProgress(`Summarizing article: "${title.substring(0, 50)}..."`);
      
      const summary = await generateSummary(title, targetUrl, excerpt, industry, model, keys);

      const story = {
        id: 'custom-url',
        title,
        url: targetUrl,
        score: 'N/A',
        author: 'custom source',
        hnUrl: '#',
        summary
      };

      sendProgress('Scan completed successfully.');
      return sendResult([story]);

    } else {
      // SCAN HACKER NEWS FEED
      sendProgress('Connecting to Hacker News API...');
      const topStoriesRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      if (!topStoriesRes.ok) {
        throw new Error(`Failed to fetch top stories from HN API: HTTP ${topStoriesRes.status}`);
      }
      const storyIds = await topStoriesRes.json();
      const top5Ids = storyIds.slice(0, 5);

      sendProgress('Pulling top 5 headlines...');
      const storiesPromises = top5Ids.map(id => fetchHNStory(id));
      const rawStories = await Promise.all(storiesPromises);
      const validStories = rawStories.filter(story => story !== null);

      const summarizedStories = [];
      let index = 1;

      for (const story of validStories) {
        const title = story.title || 'Untitled';
        const url = story.url || '';
        let articleText = story.text || '';
        const score = story.score || 0;
        const author = story.by || 'unknown';
        const id = story.id;

        if (url && !articleText) {
          try {
            sendProgress(`Scraping content ${index} of 5: "${title.substring(0, 30)}..."`);
            const scraped = await fetchAndExtractText(url);
            articleText = scraped.excerpt;
          } catch (e) {
            console.warn(`Could not scrape content for ${url}:`, e.message);
          }
        }

        if (index > 1) {
          sendProgress(`Rate limit cooldown, waiting a moment...`);
          await sleep(delay);
        }

        sendProgress(`Summarizing article ${index} of 5: "${title.substring(0, 45)}..."`);
        const summary = await generateSummary(title, url, articleText, industry, model, keys);

        summarizedStories.push({
          id,
          title,
          url,
          score,
          author,
          hnUrl: `https://news.ycombinator.com/item?id=${id}`,
          summary
        });
        
        res.write(`data: ${JSON.stringify({ type: 'partial_result', stories: summarizedStories })}\n\n`);
        index++;
      }

      sendProgress('Scan completed successfully.');
      return sendResult(summarizedStories);
    }
  } catch (error) {
    console.error('Error in /api/summarize:', error);
    sendError(error.message);
  }
});

// Fallback to index.html for single page app experience
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
