# Changelog - News Scanner Sandbox

All notable changes to the News Scanner Sandbox project are documented in this file.

---

## [1.4.0] - 2026-07-08
### Added
- **Stop & Pause state**: Clicking the Stop button aborts active streams, pauses the centisecond timer, and retains loaded cards.
- **Ollama Chat Migration**: Migrated local Gemma summarization to Ollama's `/api/chat` endpoint with `num_predict: 800` to fix reasoning cutoffs.
- **Strict prompt constraints**: Refined `buildPrompt` to prevent abbreviations and ensure complete sentences.

## [1.3.0] - 2026-07-08
### Added
- **15-Minute Server Cache**: Implemented in-memory caching mapping `url + industry + model` to resolve repeated scans in 0ms.
- **SSRF Blockers**: Added private network IP blocking filters on outgoing scraper requests.
- **XSS Protections**: Enforced client-side character entity escaping on dynamic card text.
- **Security Response Headers**: Express headers middleware setting CSP rules, frame options, and mime-sniff blockers.
- **API Rate Limiter**: Middleware limiting IP requests to 10 runs per minute.
- **GDPR Footers**: UI compliance footer clarifying client-side key storage and copyright disclaimers.

## [1.2.0] - 2026-07-08
### Added
- **Hover Pre-fetching**: Initiates scans silently on mouse hover of "Begin", presenting results instantly on click.
- **SSE Streaming Card Rendering**: Stories render one-by-one as partial results stream from backend.
- **Centisecond Timer**: Centisecond accuracy timer display for scan runs.
- **Stop Actions (AbortController)**: Abort controller handlers integrated to cancel active connections.

## [1.1.0] - 2026-07-08
### Added
- **Google Gemma Local Model**: Option block to route queries through Ollama.
- **API Key Storage Settings**: Settings popup modal storing key configurations in browser `localStorage`.
- **Theme toggle**: Muted Oat/Navy color palette aligned with Databricks dark/light mode toggle.
