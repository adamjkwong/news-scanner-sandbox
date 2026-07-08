document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = themeToggle.querySelector('.sun-icon');
  const moonIcon = themeToggle.querySelector('.moon-icon');
  
  const settingsButton = document.getElementById('settings-button');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettings = document.getElementById('close-settings');
  const settingsForm = document.getElementById('settings-form');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeyAlert = document.getElementById('api-key-alert');

  const summarizerForm = document.getElementById('summarizer-form');
  const chipContainer = document.getElementById('industry-chips');
  const chips = document.querySelectorAll('.chip');
  const customIndustryInput = document.getElementById('custom-industry-input');
  const submitBtn = document.getElementById('submit-btn');

  const resultsHeading = document.getElementById('results-heading');
  const currentIndustryDisplay = document.getElementById('current-industry-display');
  const loadingState = document.getElementById('loading-state');
  const storiesContainer = document.getElementById('stories-container');

  // App State
  let activeIndustry = 'Tech';
  let geminiApiKey = localStorage.getItem('hn_summarizer_gemini_key') || '';

  // Initialize
  initTheme();
  initSettings();
  setupEventListeners();

  // Theme Logic
  function initTheme() {
    const savedTheme = localStorage.getItem('color-scheme') || 'light dark';
    document.querySelector('meta[name="color-scheme"]').content = savedTheme;
    updateThemeIcons(savedTheme);
  }

  function updateThemeIcons(theme) {
    // If dark mode resolves (either system is dark or pinned dark)
    const isDark = theme === 'dark' || (theme === 'light dark' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }

  function toggleTheme() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const current = meta.content;
    let nextTheme = 'light';

    if (current === 'light') {
      nextTheme = 'dark';
    } else if (current === 'dark') {
      nextTheme = 'light dark';
    } else {
      // If currently light dark, toggle to dark if system is light, else light
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      nextTheme = systemIsDark ? 'light' : 'dark';
    }

    meta.content = nextTheme;
    localStorage.setItem('color-scheme', nextTheme);
    updateThemeIcons(nextTheme);
  }

  // Settings Modal Logic
  function initSettings() {
    if (geminiApiKey) {
      apiKeyInput.value = geminiApiKey;
      apiKeyAlert.style.display = 'none';
    } else {
      // Check if server is pre-configured with a key via ping or test endpoint
      checkServerApiKey();
    }
  }

  async function checkServerApiKey() {
    // If API key is empty in localStorage, show warning alert until we verify otherwise
    apiKeyAlert.style.display = 'flex';
  }

  function openModal() {
    settingsModal.classList.add('open');
    settingsModal.setAttribute('aria-hidden', 'false');
    apiKeyInput.focus();
  }

  function closeModal() {
    settingsModal.classList.remove('open');
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Watch system color scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = localStorage.getItem('color-scheme') || 'light dark';
      if (current === 'light dark') {
        updateThemeIcons(current);
      }
    });

    // Modal Control
    settingsButton.addEventListener('click', openModal);
    closeSettings.addEventListener('click', closeModal);
    settingsModal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    
    // Save Settings
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      geminiApiKey = apiKeyInput.value.trim();
      localStorage.setItem('hn_summarizer_gemini_key', geminiApiKey);
      if (geminiApiKey) {
        apiKeyAlert.style.display = 'none';
      } else {
        apiKeyAlert.style.display = 'flex';
      }
      closeModal();
    });

    // Handle ESC key for modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsModal.classList.contains('open')) {
        closeModal();
      }
    });

    // Industry selection chips
    chipContainer.addEventListener('click', (e) => {
      const targetChip = e.target.closest('.chip');
      if (!targetChip) return;

      // Remove active from all chips
      chips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });

      // Set active
      targetChip.classList.add('active');
      targetChip.setAttribute('aria-checked', 'true');
      activeIndustry = targetChip.dataset.value;

      // Clear custom input since chip is clicked
      customIndustryInput.value = '';
    });

    // If typing in custom input, deselect active chips
    customIndustryInput.addEventListener('input', () => {
      if (customIndustryInput.value.trim() !== '') {
        chips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
        activeIndustry = '';
      } else {
        // Fallback to first chip (Tech) if empty
        const defaultChip = document.getElementById('chip-tech');
        defaultChip.classList.add('active');
        defaultChip.setAttribute('aria-checked', 'true');
        activeIndustry = defaultChip.dataset.value;
      }
    });

    // Form Submission
    summarizerForm.addEventListener('submit', handleFormSubmit);
  }

  // Handle data fetching and summarizing
  async function handleFormSubmit(e) {
    e.preventDefault();

    // Determine final industry value
    const customValue = customIndustryInput.value.trim();
    const finalIndustry = customValue || activeIndustry;

    if (!finalIndustry) {
      alert('Please select or specify a target industry.');
      return;
    }

    // Set UI to loading state
    submitBtn.disabled = true;
    loadingState.style.display = 'flex';
    storiesContainer.innerHTML = '';
    resultsHeading.style.display = 'none';

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': geminiApiKey // Pass custom key if set locally
        },
        body: JSON.stringify({ industry: finalIndustry })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'API_KEY_REQUIRED') {
          apiKeyAlert.style.display = 'flex';
          openModal();
          throw new Error('Gemini API Key is required. Please set it in the settings panel.');
        }
        throw new Error(data.message || `API error: ${response.status}`);
      }

      // Render Results
      currentIndustryDisplay.textContent = finalIndustry;
      resultsHeading.style.display = 'block';
      renderStories(data.stories);

    } catch (error) {
      console.error('Fetch error:', error);
      renderErrorState(error.message);
    } finally {
      submitBtn.disabled = false;
      loadingState.style.display = 'none';
    }
  }

  // Render story list
  function renderStories(stories) {
    if (!stories || stories.length === 0) {
      storiesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No stories found</h3>
          <p>Could not fetch any stories from Hacker News at this moment.</p>
        </div>
      `;
      return;
    }

    const html = stories.map((story, index) => {
      const linkTarget = story.url ? `href="${story.url}" target="_blank" rel="noopener"` : '';
      const externalIcon = story.url ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      ` : '';

      return `
        <article class="story-card" style="animation-delay: ${index * 0.1}s">
          <div class="story-meta">
            <span class="story-rank">#${index + 1}</span>
            <span class="story-score">${story.score} points</span>
            <span class="story-divider">•</span>
            <span class="story-author">by ${story.author}</span>
            <span class="story-divider">•</span>
            <a href="${story.hnUrl}" target="_blank" rel="noopener" class="story-hn-link">
              HN Discussion
            </a>
          </div>
          <h3 class="story-title">
            ${story.url ? `<a ${linkTarget}>${story.title} ${externalIcon}</a>` : story.title}
          </h3>
          <div class="story-summary-box">
            <div class="summary-label">Industry Impact</div>
            <p class="story-summary">${story.summary}</p>
          </div>
        </article>
      `;
    }).join('');

    storiesContainer.innerHTML = html;
  }

  // Render error message card
  function renderErrorState(message) {
    storiesContainer.innerHTML = `
      <div class="empty-state" style="border-color: light-dark(oklch(80% 0.1 20), oklch(35% 0.08 20));">
        <div class="empty-icon">❌</div>
        <h3 style="color: light-dark(oklch(35% 0.1 20), oklch(85% 0.08 20));">Failed to fetch summaries</h3>
        <p>${message}</p>
      </div>
    `;
  }
});
