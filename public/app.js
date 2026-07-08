document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = themeToggle.querySelector('.sun-icon');
  const moonIcon = themeToggle.querySelector('.moon-icon');
  
  const settingsButton = document.getElementById('settings-button');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettings = document.getElementById('close-settings');
  const settingsForm = document.getElementById('settings-form');
  const apiKeyAlert = document.getElementById('api-key-alert');

  // API Inputs
  const geminiKeyInput = document.getElementById('gemini-key-input');

  const summarizerForm = document.getElementById('summarizer-form');
  const modelChipsContainer = document.getElementById('model-chips');
  const modelChips = document.querySelectorAll('.model-chip');
  
  const chipContainer = document.getElementById('industry-chips');
  const chips = document.querySelectorAll('.chip');
  const customIndustryInput = document.getElementById('custom-industry-input');
  const submitBtn = document.getElementById('submit-btn');
  const stopBtn = document.getElementById('stop-btn');

  // Target inputs
  const targetUrlInput = document.getElementById('target-url-input');

  // Loading and Results elements
  const progressContainer = document.getElementById('progress-container');
  const progressMessage = document.getElementById('progress-message');
  const resultsHeading = document.getElementById('results-heading');
  const currentIndustryDisplay = document.getElementById('current-industry-display');
  const loadingState = document.getElementById('loading-state');
  const storiesContainer = document.getElementById('stories-container');
  const scanTimerElement = document.getElementById('scan-timer');

  // App State
  let activeModel = 'gemini';
  let activeIndustry = 'Tech';
  let isScanning = false;
  let rateLimitDelay = 2500;

  // Shadow variables for hover prefetching
  let hoverScanActive = false;
  let hoverScanResult = null;
  let hoverScanError = null;
  let hoverScanProgress = 'Initiating scan...';
  let hoverScanStartTime = 0;
  let hoverScanElapsedSeconds = '0.00';
  let hoverScanTimerInterval = null;
  let hoverScanFinalIndustry = '';
  let hoverScanTargetType = '';
  let hoverScanTargetUrl = '';
  let userClicked = false;
  let abortController = null;

  // API Keys state
  let keys = {
    gemini: localStorage.getItem('hn_scanner_gemini_key') || ''
  };

  // Initialize
  initTheme();
  initSettings();
  setupEventListeners();
  checkSelectedModelKeyStatus();

  // Theme Logic
  function initTheme() {
    const savedTheme = localStorage.getItem('color-scheme') || 'light dark';
    document.documentElement.style.colorScheme = savedTheme;
    updateThemeIcons(savedTheme);
  }

  function updateThemeIcons(theme) {
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
    const current = document.documentElement.style.colorScheme || 'light dark';
    let nextTheme = 'light';

    if (current === 'light') {
      nextTheme = 'dark';
    } else if (current === 'dark') {
      nextTheme = 'light dark';
    } else {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      nextTheme = systemIsDark ? 'light' : 'dark';
    }

    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem('color-scheme', nextTheme);
    updateThemeIcons(nextTheme);
  }

  // Settings Modal Logic
  function initSettings() {
    geminiKeyInput.value = keys.gemini;
  }

  // Check if current selected model has its required API key
  function checkSelectedModelKeyStatus() {
    if (activeModel !== 'gemini') {
      apiKeyAlert.style.display = 'none';
      return true;
    }

    const currentKey = keys.gemini;
    if (!currentKey || currentKey.trim() === '') {
      apiKeyAlert.style.display = 'flex';
      return false;
    } else {
      apiKeyAlert.style.display = 'none';
      return true;
    }
  }

  function openModal(focusInputId = null) {
    settingsModal.classList.add('open');
    settingsModal.setAttribute('aria-hidden', 'false');
    
    if (focusInputId) {
      const targetInput = document.getElementById(focusInputId);
      if (targetInput) targetInput.focus();
    } else {
      geminiKeyInput.focus();
    }
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
    settingsButton.addEventListener('click', () => openModal());
    closeSettings.addEventListener('click', closeModal);
    settingsModal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    
    // Save Settings
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      keys.gemini = geminiKeyInput.value.trim();
      localStorage.setItem('hn_scanner_gemini_key', keys.gemini);

      checkSelectedModelKeyStatus();
      closeModal();
    });

    // Toggle password field visibility (Eye Buttons)
    document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const targetInput = document.getElementById(targetId);
        const eyeOpen = btn.querySelector('.eye-open');
        const eyeClosed = btn.querySelector('.eye-closed');

        if (targetInput.type === 'password') {
          targetInput.type = 'text';
          eyeOpen.style.display = 'none';
          eyeClosed.style.display = 'block';
          btn.setAttribute('aria-label', 'Hide key');
        } else {
          targetInput.type = 'password';
          eyeOpen.style.display = 'block';
          eyeClosed.style.display = 'none';
          btn.setAttribute('aria-label', 'Show key');
        }
      });
    });

    // Handle ESC key for modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsModal.classList.contains('open')) {
        closeModal();
      }
    });

    // LLM Model Selection Chips
    modelChipsContainer.addEventListener('click', (e) => {
      const targetChip = e.target.closest('.model-chip');
      if (!targetChip || targetChip.classList.contains('disabled-chip')) return;

      modelChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });

      targetChip.classList.add('active');
      targetChip.setAttribute('aria-checked', 'true');
      activeModel = targetChip.dataset.value;

      checkSelectedModelKeyStatus();
    });

    // Industry selection chips
    chipContainer.addEventListener('click', (e) => {
      const targetChip = e.target.closest('.chip');
      if (!targetChip) return;

      chips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });

      targetChip.classList.add('active');
      targetChip.setAttribute('aria-checked', 'true');
      activeIndustry = targetChip.dataset.value;

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
        const defaultChip = document.getElementById('chip-tech');
        defaultChip.classList.add('active');
        defaultChip.setAttribute('aria-checked', 'true');
        activeIndustry = defaultChip.dataset.value;
      }
    });

    // Hover to trigger scan
    submitBtn.addEventListener('mouseenter', () => {
      if (!submitBtn.disabled && !isScanning) {
        rateLimitDelay = 2500; // Reset rate limit to default on fresh scan
        triggerHoverScan(); // Starts prefetch in background
      }
    });

    submitBtn.addEventListener('click', () => {
      rateLimitDelay = 2500; // Reset rate limit on manual click
    });

    // Stop button event listener
    stopBtn.addEventListener('click', () => {
      if (abortController) {
        abortController.abort();
      }
    });

    // Form Submission
    summarizerForm.addEventListener('submit', handleFormSubmit);
  }

  // Pre-fetch scan in the background (triggered on hover)
  async function triggerHoverScan() {
    if (hoverScanActive || isScanning) return;

    // Validate inputs
    const hasKey = checkSelectedModelKeyStatus();
    if (!hasKey) return; 

    const customValue = customIndustryInput.value.trim();
    const sanitizedCustomValue = customValue.replace(/[^a-zA-Z0-9\s\-]/g, '');
    if (customValue !== '' && sanitizedCustomValue.trim() === '') return;

    const finalIndustry = customValue !== '' ? sanitizedCustomValue : activeIndustry;

    const targetUrl = targetUrlInput.value.trim();
    const targetType = targetUrl.toLowerCase().includes('news.ycombinator.com') ? 'hn' : 'url';

    const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlRegex.test(targetUrl)) return;

    // Lock prefetch hover state
    hoverScanActive = true;
    hoverScanResult = null;
    hoverScanError = null;
    hoverScanProgress = 'Initiating scan...';
    hoverScanFinalIndustry = finalIndustry;
    hoverScanTargetType = targetType;
    hoverScanTargetUrl = targetUrl;
    hoverScanStartTime = Date.now();
    hoverScanElapsedSeconds = '0.00';

    abortController = new AbortController();

    hoverScanTimerInterval = setInterval(() => {
      hoverScanElapsedSeconds = ((Date.now() - hoverScanStartTime) / 1000).toFixed(2);
      if (userClicked) {
        scanTimerElement.textContent = `${hoverScanElapsedSeconds}s`;
      }
    }, 10);

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': keys.gemini
        },
        body: JSON.stringify({ 
          industry: finalIndustry,
          model: activeModel,
          targetType,
          targetUrl,
          delay: rateLimitDelay
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Connection error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let resultReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            let data = null;
            try {
              data = JSON.parse(cleanLine.substring(6));
            } catch (err) {
              console.error('Error parsing hover stream line:', err);
              continue;
            }

            if (data.type === 'status') {
              hoverScanProgress = data.message;
              if (userClicked) {
                progressMessage.textContent = hoverScanProgress;
              }
            } else if (data.type === 'error') {
              throw new Error(data.message);
            } else if (data.type === 'partial_result') {
              hoverScanResult = data.stories;
              if (userClicked) {
                loadingState.style.display = 'none';
                renderStories(data.stories, finalIndustry, hoverScanElapsedSeconds, true);
              }
            } else if (data.type === 'result') {
              resultReceived = true;
              hoverScanResult = data.stories;
              if (userClicked) {
                loadingState.style.display = 'none';
                currentIndustryDisplay.textContent = finalIndustry;
                resultsHeading.style.display = 'block';
                renderStories(data.stories, finalIndustry, hoverScanElapsedSeconds, false);
              }
            }
          }
        }
      }

      // Parse trailing content
      const trailingContent = buffer.trim();
      if (trailingContent.startsWith('data: ')) {
        let data = null;
        try {
          data = JSON.parse(trailingContent.substring(6));
        } catch (err) {
          console.error('Error parsing trailing hover buffer:', err);
        }

        if (data) {
          if (data.type === 'result') {
            resultReceived = true;
            hoverScanResult = data.stories;
            if (userClicked) {
              loadingState.style.display = 'none';
              currentIndustryDisplay.textContent = finalIndustry;
              resultsHeading.style.display = 'block';
              renderStories(data.stories, finalIndustry, hoverScanElapsedSeconds, false);
            }
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        }
      }

      if (!resultReceived) {
        throw new Error('Connection closed before final summaries could compile.');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Hover scan aborted.');
        hoverScanError = 'Scan cancelled by user.';
      } else {
        console.error('Hover fetch error:', error);
        hoverScanError = error.message;
      }
      if (userClicked) {
        renderErrorState(hoverScanError);
      }
    } finally {
      clearInterval(hoverScanTimerInterval);
      hoverScanActive = false;
      if (userClicked) {
        isScanning = false;
        submitBtn.disabled = false;
        stopBtn.style.display = 'none';
        progressContainer.style.display = 'none';
        loadingState.style.display = 'none';
      }
    }
  }

  // Handle data fetching and summarizing (Reading SSE/Chunked response)
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (isScanning) return;

    // Determine values
    const targetUrl = targetUrlInput.value.trim();
    const targetType = targetUrl.toLowerCase().includes('news.ycombinator.com') ? 'hn' : 'url';
    const customValue = customIndustryInput.value.trim();
    const sanitizedCustomValue = customValue.replace(/[^a-zA-Z0-9\s\-]/g, '');
    const finalIndustry = customValue !== '' ? sanitizedCustomValue : activeIndustry;

    // Check if the user changed the input fields since we started hover scan
    const inputsChanged = targetUrl !== hoverScanTargetUrl || 
                          targetType !== hoverScanTargetType || 
                          finalIndustry !== hoverScanFinalIndustry;

    // If inputs changed, discard hover scan
    if (inputsChanged && hoverScanActive) {
      if (abortController) {
        abortController.abort(); // Cancel old fetch
      }
      hoverScanActive = false;
      hoverScanResult = null;
      hoverScanError = null;
    }

    userClicked = true;

    // Case 1: Hover pre-fetch completed successfully
    if (!hoverScanActive && hoverScanResult && !inputsChanged) {
      currentIndustryDisplay.textContent = hoverScanFinalIndustry;
      resultsHeading.style.display = 'block';
      renderStories(hoverScanResult, hoverScanFinalIndustry, hoverScanElapsedSeconds, false);
      userClicked = false;
      return;
    }

    // Case 2: Hover pre-fetch completed with error
    if (!hoverScanActive && hoverScanError && !inputsChanged) {
      renderErrorState(hoverScanError);
      userClicked = false;
      return;
    }

    // Case 3: Hover pre-fetch is still active in background
    if (hoverScanActive && !inputsChanged) {
      isScanning = true;
      submitBtn.disabled = true;
      stopBtn.style.display = 'inline-flex';
      progressContainer.style.display = 'flex';
      progressMessage.textContent = hoverScanProgress;
      scanTimerElement.textContent = `${hoverScanElapsedSeconds}s`;

      if (hoverScanResult) {
        renderStories(hoverScanResult, hoverScanFinalIndustry, hoverScanElapsedSeconds, true);
      } else {
        loadingState.style.display = 'flex';
        storiesContainer.innerHTML = '';
      }
      resultsHeading.style.display = 'none';
      return;
    }

    // Case 4: Fresh scan required (hover scan was not running or inputs changed)
    isScanning = true;

    // 1. Verify API key status before calling
    const hasKey = checkSelectedModelKeyStatus();
    if (!hasKey) {
      openModal('gemini-key-input');
      isScanning = false;
      userClicked = false;
      return;
    }

    // Validate inputs
    if (customValue !== '' && sanitizedCustomValue.trim() === '') {
      alert('Please enter a valid custom industry name (alphanumeric, spaces, or hyphens only).');
      isScanning = false;
      userClicked = false;
      return;
    }

    const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlRegex.test(targetUrl)) {
      alert('Please enter a valid target URL starting with http:// or https://');
      isScanning = false;
      userClicked = false;
      return;
    }

    // Set UI to loading state
    submitBtn.disabled = true;
    stopBtn.style.display = 'inline-flex';
    progressContainer.style.display = 'flex';
    progressMessage.textContent = 'Initiating scan...';
    scanTimerElement.textContent = '0.00s';
    loadingState.style.display = 'flex';
    storiesContainer.innerHTML = '';
    resultsHeading.style.display = 'none';

    let startTime = Date.now();
    let elapsedSeconds = '0.00';
    
    abortController = new AbortController();

    const timerInterval = setInterval(() => {
      elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
      scanTimerElement.textContent = `${elapsedSeconds}s`;
    }, 10);

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': keys.gemini
        },
        body: JSON.stringify({ 
          industry: finalIndustry,
          model: activeModel,
          targetType,
          targetUrl,
          delay: rateLimitDelay
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Connection error: ${response.status}`);
      }

      // Read streamed chunks
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let resultReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            let data = null;
            try {
              data = JSON.parse(cleanLine.substring(6));
            } catch (err) {
              console.error('Error parsing stream line:', err);
              continue;
            }

            if (data.type === 'status') {
              progressMessage.textContent = data.message;
            } else if (data.type === 'error') {
              if (data.message === 'API_KEY_REQUIRED_GEMINI') {
                apiKeyAlert.style.display = 'flex';
                openModal('gemini-key-input');
                throw new Error('Gemini API Key is required. Configure in settings.');
              }
              throw new Error(data.message);
            } else if (data.type === 'partial_result') {
              loadingState.style.display = 'none';
              renderStories(data.stories, finalIndustry, elapsedSeconds, true);
            } else if (data.type === 'result') {
              resultReceived = true;
              loadingState.style.display = 'none';
              currentIndustryDisplay.textContent = finalIndustry;
              resultsHeading.style.display = 'block';
              renderStories(data.stories, finalIndustry, elapsedSeconds, false);
            }
          }
        }
      }

      // Parse any remaining content in the buffer after stream ends
      const trailingContent = buffer.trim();
      if (trailingContent.startsWith('data: ')) {
        let data = null;
        try {
          data = JSON.parse(trailingContent.substring(6));
        } catch (err) {
          console.error('Error parsing trailing buffer:', err);
        }

        if (data) {
          if (data.type === 'result') {
            resultReceived = true;
            loadingState.style.display = 'none';
            currentIndustryDisplay.textContent = finalIndustry;
            resultsHeading.style.display = 'block';
            renderStories(data.stories, finalIndustry, elapsedSeconds, false);
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        }
      }

      if (!resultReceived) {
        throw new Error('Connection closed before final summaries could compile.');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Main scan aborted.');
        renderErrorState('Scan cancelled by user.');
      } else {
        console.error('Fetch error:', error);
        renderErrorState(error.message);
      }
    } finally {
      clearInterval(timerInterval);
      submitBtn.disabled = false;
      stopBtn.style.display = 'none';
      isScanning = false;
      userClicked = false;
      progressContainer.style.display = 'none';
      loadingState.style.display = 'none';
    }
  }

  // Render story list (Supports incremental partial rendering and dynamic skeletons)
  function renderStories(stories, industryName, elapsedSeconds, isPartial = false) {
    if (!stories || stories.length === 0) {
      storiesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No stories found</h3>
          <p>Could not fetch any stories from target at this moment.</p>
        </div>
      `;
      return;
    }

    resultsHeading.innerHTML = `Top Stories Summary for <span id="current-industry-display">${escapeHTML(industryName)}</span> <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-left: 0.5rem; opacity: 0.8;">(Scan run time: ${escapeHTML(elapsedSeconds)}s)</span>`;

    let cardsHtml = stories.map((story, index) => {
      const linkTarget = story.url ? `href="${story.url}" target="_blank" rel="noopener"` : '';
      const externalIcon = story.url ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      ` : '';

      const isCustomUrl = story.id === 'custom-url';

      return `
        <article class="story-card" style="animation-delay: ${index * 0.1}s">
          <div class="story-meta">
            ${isCustomUrl ? `<span class="story-rank">Scanned Target</span>` : `<span class="story-rank">#${index + 1}</span>`}
            ${isCustomUrl ? '' : `<span class="story-score">${escapeHTML(story.score)} points</span>`}
            ${isCustomUrl ? '' : `<span class="story-divider">•</span>`}
            ${isCustomUrl ? '' : `<span class="story-author">by ${escapeHTML(story.author)}</span>`}
            ${isCustomUrl ? '' : `<span class="story-divider">•</span>`}
            ${isCustomUrl ? '' : `
            <a href="${story.hnUrl}" target="_blank" rel="noopener" class="story-hn-link">
              HN Discussion
            </a>`}
          </div>
          <h3 class="story-title">
            ${story.url ? `<a ${linkTarget}>${escapeHTML(story.title)} ${externalIcon}</a>` : escapeHTML(story.title)}
          </h3>
          <div class="story-summary-box">
            <div class="summary-label">Impact on ${escapeHTML(industryName)}</div>
            <p class="story-summary">${escapeHTML(story.summary)}</p>
          </div>
        </article>
      `;
    }).join('');

    // Append dynamic skeletons if loading is in progress (partial)
    if (isPartial) {
      const targetUrl = targetUrlInput.value.trim();
      const targetType = targetUrl.toLowerCase().includes('news.ycombinator.com') ? 'hn' : 'url';
      const expectedTotal = targetType === 'hn' ? 5 : 1;
      
      const skeletonsNeeded = Math.max(0, expectedTotal - stories.length);
      for (let i = 0; i < skeletonsNeeded; i++) {
        cardsHtml += `
          <div class="skeleton-card" style="margin-top: 1.5rem; opacity: 0.7;">
            <div class="skeleton-meta"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-summary-1"></div>
            <div class="skeleton-summary-2"></div>
          </div>
        `;
      }
    }

    storiesContainer.innerHTML = cardsHtml;
  }

  // Render error message card with retry slowdown option
  function renderErrorState(message) {
    storiesContainer.innerHTML = `
      <div class="empty-state" style="border-color: light-dark(oklch(80% 0.1 20), oklch(35% 0.08 20));">
        <div class="empty-icon">❌</div>
        <h3 style="color: light-dark(oklch(35% 0.1 20), oklch(85% 0.08 20));">Failed to fetch summaries</h3>
        <p>${escapeHTML(message)}</p>
        <button type="button" id="retry-btn" class="retry-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="display:inline; vertical-align:middle; margin-right: 0.25rem;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
          </svg>
          <span>Retry (Slow Mode)</span>
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        rateLimitDelay = 5000; // Slow down rate limits on retry!
        // Reset hoverScan states so a fresh scan starts
        hoverScanResult = null;
        hoverScanError = null;
        hoverScanActive = false;
        userClicked = false;
        isScanning = false;
        progressMessage.textContent = 'Retrying with slower rate limit (5.0s delay)...';
        summarizerForm.requestSubmit();
      });
    }
  }

  // HTML escaping to prevent XSS injection attacks
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
