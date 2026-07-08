# Hacker News Industry Summarizer

A local web application that fetches the top 5 stories from Hacker News and uses Gemini to summarize them for your specified industry in exactly two sentences.

## Features
- Fetches real-time Hacker News top stories.
- Summarizes stories targeting specific industries using **Gemini 2.5 Flash** (highly cost-effective and stays well within the free tier).
- Pre-populated toggle chips (Tech, Healthcare, Finance, Education, Cybersecurity) and free-text custom industry input.
- Premium UI with Glassmorphism, smooth animations, light/dark mode support, and accessibility.

## Getting Started

### Prerequisites
- Node.js installed on your machine.

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. (Optional) Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your-gemini-api-key-here
   PORT=3000
   ```
   *Note: If no API key is provided in `.env`, the UI will display a settings panel prompting you to enter it. The key will be stored securely in your browser's local storage.*

### Run the App
Start the development server:
```bash
npm run dev
```

Or start the production server:
```bash
npm start
```

Navigate to `http://localhost:3000` in your web browser.
