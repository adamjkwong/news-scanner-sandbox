# Summarize Information (News Scanner Sandbox)

An advanced real-time news scanner and strategic summarizer sandbox. It pulls target feeds (e.g., Hacker News headlines or custom web articles) and leverages state-of-the-art LLMs (Gemini, local Gemma, OpenAI, Claude) to extract strategic implications, threats, and opportunities for specific business industries.

---

## ⚡ Key Features

- **🧙‍♂️ Silent Hover Pre-Fetching**: Begins scan fetching in the background as soon as the user hovers (`mouseenter`) over the **Begin** button, resolving results in 0ms if hovered long enough before clicking.
- **⚡ SSE Streaming & Dynamic Skeletons**: Streams completed article summaries to the client incrementally so they render one-by-one, displaying loading skeleton cards for pending results.
- **🛑 Stop / Abort Controller**: A glowing red actions button to cancel active stream requests, stop elapsed timer counters, and freeze visual loading states while retaining loaded cards on the screen.
- **⏱️ Centisecond Timer**: Tracks scan latency in real time showing elapsed seconds and centiseconds.
- **🦙 Multi-Model LLM Matrix**:
  - **Gemini 2.5 Flash**: Default cloud model utilizing cost-effective free-tier parameters.
  - **Google / Gemma (Local Ollama Chat)**: High-performance, offline LLM (`gemma4:e4b`) run locally on your laptop via Ollama `/api/chat` with options control.
  - **OpenAI & Claude**: Standard API connectors integrated for scaling.
- **🚀 15-Minute Server-Side Cache**: Memory caches successful summaries. Repeated scans within 15 minutes bypass network scraping and LLM invocations, resolving instantly.

---

## 🔒 Security & Legal Architecture

This project is hardened against web security threats and built with data privacy compliance in mind:
- **🛡️ SSRF Prevention**: The server parses and filters outgoing scraper requests, strictly blocking local network hosts and private IP spaces (e.g., `localhost`, `127.0.0.1`, `10.x.x.x`, `192.168.x.x`).
- **🛡️ XSS Prevention**: All title, author, and summary strings are passed through a client-side HTML entity escaping utility prior to dashboard injection.
- **🛡️ Custom Security Headers & CSP**: Express injects `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict `Content-Security-Policy` mapping only to approved local endpoints and Google/Ollama hosts.
- **⚖️ GDPR/CCPA Key Storage**: API keys are saved exclusively in the client browser's local storage and transmitted safely via encrypted headers. No keys are ever written, logged, or retained on the backend server.
- **⚖️ Fair Use & Crawler Compliance**: Declares a friendly crawler header (`NewsScannerSandbox/1.0`) on external scraper calls, and notes copyright statements in the footer.
- **🛑 Rate Limiting**: Throttles `/api/summarize` requests to a maximum of 10 runs per minute per IP address.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) installed (v18+ recommended).
- (Optional) [Ollama](https://ollama.com/) running locally with the `gemma4:e4b` model installed:
  ```bash
  ollama run gemma4:e4b
  ```

### Installation
1. Install project dependencies:
   ```bash
   npm install
   ```

2. (Optional) Configure environment variables in a root `.env` file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```
   *Note: If no API key is in the env, click the settings gear icon in the UI to store your key locally in the browser.*

### Running the App
Start the development server:
```bash
npm run dev
```

Navigate to `http://localhost:3000` in your web browser.
