// ==UserScript==
// @name         Reddit Age Verifier
// @namespace    RedditAgeVerifier
// @description  Check user ages using PushShift API to verify posting history
// @include      http://*.reddit.com/*
// @include      https://*.reddit.com/*
// @exclude      https://*.reddit.com/prefs/*
// @exclude      https://*.reddit.com/r/*/wiki/*
// @exclude      https://*.reddit.com/r/*/about/edit/*
// @exclude      https://*.reddit.com/r/*/about/rules/*
// @exclude      https://*.reddit.com/r/*/about/moderators/*
// @exclude      https://*.reddit.com/r/*/about/contributors/*
// @exclude      https://*.reddit.com/r/*/about/scheduledposts
// @exclude      https://*.reddit.com/mod/*/insights*
// @exclude      https://*.reddit.com/r/*/about/banned/*
// @exclude      https://*.reddit.com/r/*/about/muted/*
// @exclude      https://*.reddit.com/r/*/about/flair/*
// @exclude      https://*.reddit.com/r/*/about/log/*
// @exclude      https://*.reddit.com/api/*
// @exclude      https://*.reddit.com/message/*
// @exclude      https://*.reddit.com/report*
// @exclude      https://chat.reddit.com*
// @exclude      https://developers.reddit.com*
// @exclude      https://mod.reddit.com/chat*
// @downloadURL  https://github.com/quentinwolf/Reddit-Age-Verifier/raw/refs/heads/main/Reddit_Age_Verifier.user.js
// @updateURL    https://github.com/quentinwolf/Reddit-Age-Verifier/raw/refs/heads/main/Reddit_Age_Verifier.user.js
// @version      1.13
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// ============================================================================
// CONFIGURATION
// ============================================================================

// Debug Mode
const debugMode = true; // Set to 'true' for console logs

// Search configuration
const MIN_AGE = 10;                // Minimum age to search for
const MAX_AGE = 70;                // Maximum age to search for

const ENABLE_VERY_LOW_CONFIDENCE = true;  // Show age estimates even with very low confidence

// Snippet length configuration
const TITLE_SNIPPET_LENGTH = 150;   // Characters to show for title before truncating
const BODY_SNIPPET_LENGTH = 300;    // Characters to show for post body before truncating

// Cache expiration times
const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000;      // 1 week for user results
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000;          // 24 hours for API token

// PushShift API configuration
const PUSHSHIFT_API_BASE = "https://api.pushshift.io";
const PUSHSHIFT_AUTH_URL = "https://auth.pushshift.io/authorize";
const PUSHSHIFT_TOKEN_URL = "https://api.pushshift.io/signup";

// ============================================================================
// GLOBAL STATE
// ============================================================================

const userToButtonNode = {};
const ageCache = JSON.parse(GM_getValue('ageVerifierCache', '{}'));
let apiToken = null;
let tokenModal = null;
let resultsModals = []; // Array to track multiple result modals
let modalCounter = 0;   // Counter for unique modal IDs
let zIndexCounter = 10000; // Counter for z-index management

// ============================================================================
// STYLES
// ============================================================================

GM_addStyle(`
    .age-check-button {
        margin: 3px;
        padding: 2px 6px;
        background-color: #0079d3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
    }

    .age-check-button:hover {
        background-color: #005ba1;
    }

    .age-check-button.cached {
        background-color: #46d160;
    }

    .age-check-button.cached:hover {
        background-color: #37a84e;
    }

    .age-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #1a1a1b;
        color: #d7dadc;
        border: 2px solid #343536;
        border-radius: 8px;
        padding: 0;
        z-index: 10000;
        min-width: 400px;
        min-height: 300px;
        max-width: 90vw;
        max-height: 80vh;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
    }

    .age-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.3);
        z-index: 9999;
        pointer-events: none;  /* Allow clicking through to background */
    }

    .age-modal-header {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 15px 20px;
        border-bottom: 1px solid #343536;
        user-select: none;
        flex-shrink: 0;
    }

    .age-modal-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        gap: 12px;
        cursor: move;  /* Drag handle */
    }

    .age-modal-title {
        font-size: 18px;
        font-weight: bold;
        color: #d7dadc;
    }

    .age-modal-close {
        background: none;
        border: none;
        color: #818384;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        line-height: 30px;
        text-align: center;
    }

    .age-modal-close:hover {
        color: #d7dadc;
    }

    .age-modal-content {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }

    .age-modal-topbar {
        width: 100%;
        background-color: #1f1f21;
        border: 1px solid #343536;
        border-radius: 6px;
        padding: 12px 14px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    }

    .age-token-input {
        width: 100%;
        padding: 8px;
        background-color: #272729;
        border: 1px solid #343536;
        border-radius: 4px;
        color: #d7dadc;
        font-family: monospace;
        font-size: 12px;
        margin-top: 10px;
    }

    .age-modal-button {
        padding: 8px 16px;
        background-color: #0079d3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        margin-right: 10px;
    }

    .age-modal-button:hover {
        background-color: #005ba1;
    }

    .age-modal-button.secondary {
        background-color: #343536;
    }

    .age-modal-button.secondary:hover {
        background-color: #4a4a4b;
    }

    .age-modal-button.danger {
        background-color: #ea0027;
    }

    .age-modal-button.danger:hover {
        background-color: #c20022;
    }

    .age-summary {
        background-color: #272729;
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 15px;
        border-left: 4px solid #0079d3;
    }

    .age-summary-title {
        font-weight: bold;
        margin-bottom: 8px;
        color: #d7dadc;
    }

    .age-filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
    }

    .age-chip {
        display: inline-block;
        padding: 4px 12px;
        background-color: #0079d3;
        color: white;
        border-radius: 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: bold;
        transition: background-color 0.2s;
    }

    .age-chip:hover {
        background-color: #005ba1;
    }

    .age-chip.possible {
        background-color: #818384;
    }

    .age-chip.possible:hover {
        background-color: #6b6c6e;
    }

    .age-chip.active {
        background-color: #ff4500;
    }

    .age-chip.active:hover {
        background-color: #cc3700;
    }

    .age-chip.posted.active {
        background-color: #2d8a44;
    }

    .age-chip.posted.active:hover {
        background-color: #237035;
    }

    .age-chip.possible.active {
        background-color: #ff8c42;
    }

    .age-chip.possible.active:hover {
        background-color: #e67a32;
    }

    .age-filter-status-container {
        margin-top: 10px;
    }

    .age-filter-status {
        background-color: #ff4500;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 10px;
        cursor: pointer;
        font-size: 13px;
    }

    .age-filter-status:hover {
        background-color: #cc3700;
    }

    .age-results-container {
        margin-bottom: 15px;
    }

    .age-result-item {
        background-color: #272729;
        padding: 12px;
        margin-bottom: 10px;
        border-radius: 4px;
        border-left: 3px solid #0079d3;
    }

    .age-result-item.hidden {
        display: none;
    }

    .age-result-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 13px;
    }

    .age-result-age {
        font-weight: bold;
        color: #ff4500;
        font-size: 14px;
    }

    .age-result-date {
        color: #818384;
    }

    .age-result-subreddit {
        color: #0079d3;
        font-weight: normal;
    }

    .age-result-snippet {
        color: #d7dadc;
        font-size: 12px;
        margin: 8px 0;
        line-height: 1.4;
    }

    .age-result-link {
        color: #0079d3;
        text-decoration: none;
        font-size: 11px;
    }

    .age-result-link:hover {
        text-decoration: underline;
    }

    .age-error {
        background-color: #4a1c1c;
        color: #ff6b6b;
        padding: 12px;
        border-radius: 4px;
        border-left: 4px solid #ea0027;
    }

    .age-loading {
        text-align: center;
        padding: 20px;
        color: #818384;
    }

    .age-loading::after {
        content: '...';
        animation: dots 1.5s steps(4, end) infinite;
    }

    @keyframes dots {
        0%, 20% { content: '.'; }
        40% { content: '..'; }
        60%, 100% { content: '...'; }
    }

    .age-modal-buttons {
        display: flex;
        justify-content: flex-start;
        gap: 10px;
        padding: 15px 20px;
        border-top: 1px solid #343536;
        flex-shrink: 0;
    }

    .age-link-text {
        color: #0079d3;
        margin: 10px 0;
    }

    .age-link-text a {
        color: #0079d3;
        text-decoration: underline;
    }

    .age-link-text a:hover {
        color: #005ba1;
    }

    /* Resizable modal */
    .age-modal.resizable {
        resize: both;
        overflow: hidden;
    }

    .highlight-age {
        background-color: #ff4500;
        color: white;
        padding: 2px 4px;
        border-radius: 2px;
        font-weight: bold;
    }

    .highlight-age.posted {
        background-color: #46d160;
        color: white;
    }

    .highlight-age.possible {
        background-color: #ff8c42;
        color: white;
    }

    .expand-link,
    .collapse-link {
        color: #0079d3;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
        text-decoration: none;
        user-select: none;
    }

    .expand-link:hover,
    .collapse-link:hover {
        color: #005ba1;
        text-decoration: underline;
    }

    .snippet-content {
        word-wrap: break-word;
    }
`);

// Debug Function to log messages to console if enabled at top of script
function logDebug(...args) {
    if (debugMode) {
        console.log('[Age Verifier]', ...args);
    }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

function loadToken() {
    const tokenData = JSON.parse(GM_getValue('pushShiftToken', 'null'));
    if (tokenData && Date.now() - tokenData.timestamp < TOKEN_EXPIRATION) {
        apiToken = tokenData.token;
        logDebug("Age Verifier: Using cached token");
        return true;
    }
    return false;
}

function saveToken(token) {
    GM_setValue('pushShiftToken', JSON.stringify({
        token: token,
        timestamp: Date.now()
    }));
    apiToken = token;
}

function clearToken() {
    GM_setValue('pushShiftToken', 'null');
    apiToken = null;
}

function attemptAutoFetchToken() {
    // Auto-fetch is not reliable due to CORS and redirect handling
    // Users need to manually visit the auth URL and paste the token
    logDebug("Age Verifier: Auto-fetch not supported, showing manual token entry");
    return false;
}

function showTokenModal(pendingUsername = null) {
    if (tokenModal) return; // Already showing

    const overlay = document.createElement('div');
    overlay.className = 'age-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title">PushShift API Token Required</div>
            <button class="age-modal-close">&times;</button>
        </div>
        <div class="age-modal-content">
            <p>This tool requires a PushShift API token to verify user ages.</p>
            <p><strong>To get your token:</strong></p>
            <ol style="margin-left: 20px; line-height: 1.6;">
                <li>Visit the <a href="${PUSHSHIFT_AUTH_URL}" target="_blank" style="color: #0079d3;">PushShift Authorization page</a></li>
                <li>Sign in with your Reddit account and authorize</li>
                <li>After authorization, copy the <code style="background: #272729; padding: 2px 6px; border-radius: 3px;">access_token</code> from the callback page</li>
                <li>Paste it below</li>
            </ol>
            <p style="font-size: 12px; color: #818384;">Your token will be cached for 24 hours.</p>
            <input type="text" class="age-token-input" placeholder="Paste your API token here..." />
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button">Save Token</button>
            <button class="age-modal-button secondary">Cancel</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    tokenModal = { modal, overlay };

    const closeBtn = modal.querySelector('.age-modal-close');
    const saveBtn = modal.querySelectorAll('.age-modal-button')[0];
    const cancelBtn = modal.querySelectorAll('.age-modal-button')[1];
    const input = modal.querySelector('.age-token-input');

    const closeModal = () => {
        document.body.removeChild(overlay);
        document.body.removeChild(modal);
        tokenModal = null;
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    overlay.onclick = closeModal;

    saveBtn.onclick = () => {
        const token = input.value.trim();
        if (token) {
            saveToken(token);
            closeModal();

            // If there was a pending username, automatically continue the age check
            if (pendingUsername) {
                handleAgeCheck(pendingUsername);
            } else {
                alert('Token saved successfully! You can now check user ages.');
            }
        } else {
            alert('Please enter a valid token.');
        }
    };

    input.focus();
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function getCachedAgeData(username) {
    const cached = ageCache[username];
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION) {
        return cached.data;
    }
    return null;
}

function setCachedAgeData(username, data) {
    ageCache[username] = {
        data: data,
        timestamp: Date.now()
    };
    GM_setValue('ageVerifierCache', JSON.stringify(ageCache));
}

function clearUserCache(username) {
    delete ageCache[username];
    GM_setValue('ageVerifierCache', JSON.stringify(ageCache));
}

function clearAllCache() {
    GM_setValue('ageVerifierCache', '{}');
    Object.keys(ageCache).forEach(key => delete ageCache[key]);
}

// ============================================================================
// AGE SEARCH QUERY BUILDER
// ============================================================================

function buildAgeSearchQuery() {
    const ages = [];
    for (let age = MIN_AGE; age <= MAX_AGE; age++) {
        ages.push(age.toString());           // "18"
        ages.push(age + 'm');                // "18m"
        ages.push('m' + age);                // "m18"
    }
    return ages.join('|');
}

// ============================================================================
// AGE EXTRACTION FROM TEXT
// ============================================================================

function extractAgesFromText(text) {
    if (!text) return { posted: [], possible: [] };

    const posted = new Set();
    const possible = new Set();

    // Pattern to find ages within brackets: (18), [18], {18}, (18m), etc.
    const bracketPatterns = [
        /[\(\[\{](\d{2})[mM]?[\)\]\}]/g,  // (18), [18], {18}, (18m), etc.
        /[\(\[\{][mM](\d{2})[\)\]\}]/g     // (m18), [m18], {m18}
    ];

    // Pattern to find standalone ages
    const standalonePatterns = [
        /\b(\d{2})[mM]\b/g,           // 18m, 18M
        /\b[mM](\d{2})\b/g,           // m18, M18
        /\b(\d{2})\b/g                // 18 (standalone)
    ];

    // First, find all bracketed ages (posted)
    bracketPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const age = parseInt(match[1]);
            if (age >= MIN_AGE && age <= MAX_AGE) {
                posted.add(age);
            }
        }
    });

    // Then find all ages and add to possible if not already posted
    standalonePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const age = parseInt(match[1]);
            if (age >= MIN_AGE && age <= MAX_AGE) {
                if (!posted.has(age)) {
                    possible.add(age);
                }
            }
        }
    });

    return {
        posted: Array.from(posted).sort((a, b) => a - b),
        possible: Array.from(possible).sort((a, b) => a - b)
    };
}

// ============================================================================
// PUSHSHIFT API
// ============================================================================

function searchUserAges(username) {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const searchQuery = buildAgeSearchQuery();

        const params = new URLSearchParams();
        params.append('author', username);
        params.append('exact_author', 'true');  // Exact username match only
        params.append('html_decode', 'True');   // Decode HTML entities
        params.append('q', searchQuery);        // Use q parameter like Chearch (searches all fields)
        params.append('size', '100');
        params.append('sort', 'created_utc');

        const url = `${PUSHSHIFT_API_BASE}/reddit/search/submission/?${params}`;

        logDebug('PushShift request for user:', username, 'with exact_author=true');

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            onload: function(response) {
                if (response.status === 401 || response.status === 403) {
                    // Token expired or invalid
                    clearToken();
                    reject(new Error('Token expired or invalid. Please enter a new token.'));
                    return;
                }

                if (response.status !== 200) {
                    let errorMsg = `PushShift API error: ${response.status} ${response.statusText}`;
                    try {
                        const errorData = JSON.parse(response.responseText);
                        if (errorData.message || errorData.error) {
                            errorMsg += ` - ${errorData.message || errorData.error}`;
                        }
                    } catch (e) {
                        // Response not JSON, include raw text if short enough
                        if (response.responseText && response.responseText.length < 200) {
                            errorMsg += ` - ${response.responseText}`;
                        }
                    }
                    console.error('PushShift API Response:', response.responseText);
                    reject(new Error(errorMsg));
                    return;
                }

                try {
                    const data = JSON.parse(response.responseText);
                    const results = data.data || [];
                    logDebug(`PushShift returned ${results.length} results for ${username}`);
                    resolve(results);
                } catch (error) {
                    reject(new Error('Failed to parse API response'));
                }
            },
            onerror: function(response) {
                reject(new Error('Network error when contacting PushShift API'));
            },
            ontimeout: function() {
                reject(new Error('Request to PushShift API timed out'));
            }
        });
    });
}

// ============================================================================
// RESULT PROCESSING
// ============================================================================

function processResults(results, username) {
    const ageData = {
        postedAges: new Set(),
        possibleAges: new Set(),
        results: []
    };

    results.forEach(post => {
        const title = post.title || '';
        const selftext = post.selftext || '';
        const searchText = title + ' ' + selftext;  // Check both title and selftext

        const foundAges = extractAgesFromText(searchText);

        if (foundAges.posted.length > 0 || foundAges.possible.length > 0) {
            foundAges.posted.forEach(age => ageData.postedAges.add(age));
            foundAges.possible.forEach(age => ageData.possibleAges.add(age));

            // Remove title from selftext if it's duplicated (with flexible matching)
            let cleanSelftext = selftext || '';
            if (cleanSelftext && title) {
                // Normalize both strings for comparison (remove special chars, extra spaces)
                const normalizeForComparison = (str) => {
                    return str.toLowerCase()
                        .replace(/[#\[\]\(\)\{\}]/g, '') // Remove brackets and hash
                        .replace(/\s+/g, ' ')             // Normalize whitespace
                        .trim();
                };

                const titleNormalized = normalizeForComparison(title);
                const selftextNormalized = normalizeForComparison(cleanSelftext.substring(0, title.length + 50));

                // If the start of selftext matches title (normalized), it's a duplicate
                if (selftextNormalized.startsWith(titleNormalized.substring(0, Math.min(titleNormalized.length, 30)))) {
                    // Remove the duplicate title portion from selftext
                    // Find where the actual different content starts
                    const words = title.split(/\s+/);
                    const lastWord = words[words.length - 1];
                    const lastWordIndex = cleanSelftext.toLowerCase().indexOf(lastWord.toLowerCase());

                    if (lastWordIndex !== -1) {
                        cleanSelftext = cleanSelftext.substring(lastWordIndex + lastWord.length).trim();
                    }
                }
            }

            // Create snippet from title (prioritize) or selftext
            let snippet = title;
            if (!snippet || snippet.length < 50) {
                snippet = title + (cleanSelftext ? ' - ' + cleanSelftext.substring(0, 150) : '');
            }
            if (snippet.length > 200) {
                snippet = snippet.substring(0, 200) + '...';
            }

            // Format date with day of week, 12-hour time, and timezone
            const postDate = new Date(post.created_utc * 1000);
            const options = {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZoneName: 'longOffset'
            };
            const formattedDate = postDate.toLocaleString('en-US', options)
                .replace(/GMT/, '- GMT')
                .replace(/,/g, '');

            ageData.results.push({
                postedAges: foundAges.posted,
                possibleAges: foundAges.possible,
                allAges: [...foundAges.posted, ...foundAges.possible],
                date: formattedDate,
                subreddit: post.subreddit,
                snippet: snippet,
                permalink: `https://reddit.com${post.permalink}`,
                title: title,
                selftext: cleanSelftext  // Use cleaned version instead of original
            });
        }
    });

    logDebug(`Found ${ageData.results.length} posts with age mentions from ${results.length} total posts`);

    ageData.postedAges = Array.from(ageData.postedAges).sort((a, b) => a - b);
    ageData.possibleAges = Array.from(ageData.possibleAges).sort((a, b) => a - b);
    return ageData;
}

function estimateCurrentAge(ageData) {
    // Only use posted ages (in brackets) for estimation
    const dataPoints = [];

    ageData.results.forEach(result => {
        if (result.postedAges && result.postedAges.length > 0) {
            // Parse date string back to timestamp
            const dateParts = result.date.split('/');
            let timestamp;
            if (dateParts.length === 3) {
                // Assuming MM/DD/YYYY format
                timestamp = new Date(`${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`).getTime() / 1000;
            } else {
                return; // Skip if we can't parse date
            }

            result.postedAges.forEach(age => {
                dataPoints.push({ timestamp, age });
            });
        }
    });

    if (dataPoints.length === 0) {
        return null;
    }

    // Sort by timestamp
    dataPoints.sort((a, b) => a.timestamp - b.timestamp);

    // Detect anomalies (suspicious age jumps)
    const anomalies = [];
    let hasMajorJump = false;

    for (let i = 1; i < dataPoints.length; i++) {
        const timeDiff = (dataPoints[i].timestamp - dataPoints[i-1].timestamp) / (365.25 * 24 * 60 * 60);
        const ageDiff = dataPoints[i].age - dataPoints[i-1].age;

        // Flag if aging faster than 2 years per calendar year, or aging backwards
        if (timeDiff > 0) {
            const ageRate = ageDiff / timeDiff;
            if (ageRate > 2 || ageRate < -0.5) {
                anomalies.push({
                    index: i,
                    fromAge: dataPoints[i-1].age,
                    toAge: dataPoints[i].age,
                    years: timeDiff,
                    rate: ageRate
                });

                // Major jump: >5 years in <2 calendar years
                if (Math.abs(ageDiff) >= 5 && timeDiff < 2) {
                    hasMajorJump = true;
                }

                logDebug(`Anomaly detected: ${dataPoints[i-1].age} -> ${dataPoints[i].age} in ${timeDiff.toFixed(2)} years (rate: ${ageRate.toFixed(2)})`);
            }
        }
    }

    // Try to detect couples account FIRST (before bailing on anomalies)
    let isCouplesAccount = false;
    if (dataPoints.length >= 4 && anomalies.length > 0) {  // Lowered from 6 to 4, removed !hasMajorJump check
        // Group ages into clusters (within 4 years of each other)
        const clusters = [];
        dataPoints.forEach((point, idx) => {
            let foundCluster = false;
            for (let cluster of clusters) {
                const avgAge = cluster.reduce((sum, p) => sum + p.age, 0) / cluster.length;
                if (Math.abs(avgAge - point.age) <= 4) {
                    cluster.push({...point, originalIndex: idx});
                    foundCluster = true;
                    break;
                }
            }
            if (!foundCluster) {
                clusters.push([{...point, originalIndex: idx}]);
            }
        });

        // If we have exactly 2 clusters with reasonable sizes
        if (clusters.length === 2 && clusters[0].length >= 3 && clusters[1].length >= 3) {
            // Check if ages alternate (not clustered temporally)
            const cluster1Indices = clusters[0].map(p => p.originalIndex).sort((a, b) => a - b);
            const cluster2Indices = clusters[1].map(p => p.originalIndex).sort((a, b) => a - b);

            // Calculate how interleaved they are
            let interleaveScore = 0;
            for (let i = 0; i < dataPoints.length - 1; i++) {
                const isInCluster1 = cluster1Indices.includes(i);
                const nextIsInCluster1 = cluster1Indices.includes(i + 1);

                // Award points for alternation
                if (isInCluster1 !== nextIsInCluster1) {
                    interleaveScore++;
                }
            }

            const interleaveRatio = interleaveScore / (dataPoints.length - 1);

            // If ages alternate at least 40% of the time, likely couples account
            if (interleaveRatio >= 0.4) {
                logDebug(`Couples account detected - interleave ratio: ${interleaveRatio.toFixed(2)}`);
                isCouplesAccount = true;

                // Use the track with more recent data
                const track1 = clusters[0].sort((a, b) => a.timestamp - b.timestamp);
                const track2 = clusters[1].sort((a, b) => a.timestamp - b.timestamp);

                const track1Latest = track1[track1.length - 1].timestamp;
                const track2Latest = track2[track2.length - 1].timestamp;

                dataPoints.length = 0;
                dataPoints.push(...(track1Latest > track2Latest ? track1 : track2));
            } else {
                logDebug(`Not couples account - interleave ratio too low: ${interleaveRatio.toFixed(2)}`);
            }
        }
    }

    // After couples detection, check if we should skip estimation
    // Only skip if NOT a couples account and we have major issues
    if (!isCouplesAccount) {
        // If there's a major jump in non-couples account, likely falsified data
        if (hasMajorJump) {
            logDebug('Major age jump detected in non-couples account - likely falsified data');

            // If most data is after the jump, skip estimation entirely
            if (anomalies.length > 0 && anomalies[0].index < dataPoints.length / 2) {
                logDebug('Jump is early in timeline, skipping estimation');
                return {
                    skipped: true,
                    reason: 'major_jump',
                    anomalies: anomalies,
                    message: `Major age jump detected (${anomalies[0].fromAge} → ${anomalies[0].toAge} in ${anomalies[0].years.toFixed(1)} years). Unable to estimate current age.`
                };
            }
        }

        // If more than 30% of transitions are anomalies in non-couples account, skip
        if (dataPoints.length > 1 && anomalies.length / (dataPoints.length - 1) > 0.3) {
            logDebug('Too many anomalies detected, skipping estimation');
            return {
                skipped: true,
                reason: 'too_many_anomalies',
                anomalies: anomalies,
                message: `Too many age inconsistencies detected (${anomalies.length} anomalies in ${dataPoints.length} points). Unable to estimate current age.`
            };
        }
    }

    // Remove anomalous points if not a couples account
    if (!isCouplesAccount && anomalies.length > 0 && anomalies.length < dataPoints.length / 2) {
        // For major jumps, only keep data from one side of the jump
        if (hasMajorJump && anomalies.length === 1) {
            const jumpIndex = anomalies[0].index;
            // Keep the larger group (before or after jump)
            if (jumpIndex > dataPoints.length / 2) {
                // More data before jump - keep that
                dataPoints.length = jumpIndex;
                logDebug('Kept data before major jump');
            } else {
                // More data after jump - keep that
                dataPoints.splice(0, jumpIndex);
                logDebug('Kept data after major jump');
            }
        } else {
            // Remove individual anomalous points
            const filteredPoints = dataPoints.filter((_, index) =>
                !anomalies.some(a => a.index === index)
            );
            if (filteredPoints.length >= 1) {
                dataPoints.length = 0;
                dataPoints.push(...filteredPoints);
                logDebug(`Filtered out ${anomalies.length} anomalous data points`);
            }
        }
    }

    const now = Date.now() / 1000;
    const earliest = dataPoints[0];
    const latest = dataPoints[dataPoints.length - 1];
    const yearSpan = (latest.timestamp - earliest.timestamp) / (365.25 * 24 * 60 * 60);
    const yearsSinceLatest = (now - latest.timestamp) / (365.25 * 24 * 60 * 60);

    let estimatedAge, confidence;

    if (dataPoints.length === 1) {
        // Single data point
        estimatedAge = latest.age + yearsSinceLatest;

        if (yearsSinceLatest >= 1) {
            confidence = 'Medium';
        } else if (yearsSinceLatest >= 0.25) {
            confidence = 'Low';
        } else {
            if (!ENABLE_VERY_LOW_CONFIDENCE) return null;
            confidence = 'Very Low';
        }
    } else {
        // Multiple data points
        const ageChange = latest.age - earliest.age;
        const rate = yearSpan > 0 ? ageChange / yearSpan : 0;

        // Check for decreasing or wildly inconsistent ages
        let hasDecreasingAges = false;
        for (let i = 1; i < dataPoints.length; i++) {
            if (dataPoints[i].age < dataPoints[i-1].age - 1) {
                hasDecreasingAges = true;
                break;
            }
        }

        if (hasDecreasingAges) {
            return null;
        }

        // Calculate variance for very short spans
        if (yearSpan < 1 && dataPoints.length >= 2) {
            const ages = dataPoints.map(d => d.age);
            const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
            const variance = ages.reduce((sum, age) => sum + Math.pow(age - mean, 2), 0) / ages.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev > 2) {
                return null;
            }
        }

        // Project to current date
        estimatedAge = latest.age + (yearsSinceLatest * rate);

        // Calculate progression consistency score
        let consistencyScore = 0;
        let consistentPoints = 0;

        if (dataPoints.length >= 3) {
            for (let i = 1; i < dataPoints.length; i++) {
                const timeDiff = (dataPoints[i].timestamp - dataPoints[i-1].timestamp) / (365.25 * 24 * 60 * 60);
                const ageDiff = dataPoints[i].age - dataPoints[i-1].age;
                const pointRate = timeDiff > 0 ? ageDiff / timeDiff : 0;

                if (pointRate >= 0.7 && pointRate <= 1.5) {
                    consistentPoints++;
                }
            }
            consistencyScore = consistentPoints / (dataPoints.length - 1);
        }

        // Determine confidence - heavily penalize if major jump was detected
        if (hasMajorJump) {
            // Major jump detected = maximum Low confidence
            confidence = 'Low';
        } else if (dataPoints.length >= 10 && yearSpan >= 2 && rate >= 0.6 && rate <= 1.6 && consistencyScore >= 0.7 && anomalies.length === 0) {
            confidence = 'High';
        } else if (dataPoints.length >= 3 && yearSpan >= 2 && rate >= 0.7 && rate <= 1.5 && anomalies.length === 0) {
            confidence = 'High';
        } else if (dataPoints.length >= 2 && yearSpan >= 1 && rate >= 0.6 && rate <= 1.6) {
            confidence = anomalies.length > 0 ? 'Low' : 'Medium';
        } else if (rate >= 0.5 && rate <= 2.0) {
            confidence = 'Low';
        } else {
            if (!ENABLE_VERY_LOW_CONFIDENCE) return null;
            confidence = 'Very Low';
        }

        // Downgrade confidence if anomalies present
        if (anomalies.length > 0 && confidence === 'High') {
            confidence = 'Medium';
        }
    }

    // Round to nearest 0.5
    estimatedAge = Math.round(estimatedAge * 2) / 2;

    // Sanity check
    if (estimatedAge < MIN_AGE || estimatedAge > MAX_AGE + 10) {
        return null;
    }

    return {
        estimatedAge,
        confidence,
        dataPoints: dataPoints.length,
        yearSpan: Math.round(yearSpan * 10) / 10,
        anomaliesDetected: anomalies.length > 0,
        couplesAccount: isCouplesAccount,
        majorJump: hasMajorJump
    };
}

function highlightAgesInText(text, postedAges, possibleAges) {
    let highlighted = text;

    // First highlight posted ages in green
    postedAges.forEach(age => {
        const patterns = [
            new RegExp(`\\b${age}[mM]\\b`, 'g'),
            new RegExp(`\\b[mM]${age}\\b`, 'g'),
            new RegExp(`\\b${age}\\b`, 'g'),
            new RegExp(`[\\(\\[\\{]${age}[mM]?[\\)\\]\\}]`, 'g'),
            new RegExp(`[\\(\\[\\{][mM]${age}[\\)\\]\\}]`, 'g')
        ];
        patterns.forEach(pattern => {
            highlighted = highlighted.replace(pattern, `<span class="highlight-age posted">$&</span>`);
        });
    });

    // Then highlight possible ages in orange
    possibleAges.forEach(age => {
        const patterns = [
            new RegExp(`\\b${age}[mM]\\b`, 'g'),
            new RegExp(`\\b[mM]${age}\\b`, 'g'),
            new RegExp(`\\b${age}\\b`, 'g')
        ];
        patterns.forEach(pattern => {
            // Only highlight if not already highlighted (avoid double-highlighting)
            highlighted = highlighted.replace(pattern, (match, offset, string) => {
                // Check if this match is already inside a highlight span
                const before = string.substring(Math.max(0, offset - 50), offset);
                if (before.includes('<span class="highlight-age')) {
                    return match; // Already highlighted, skip
                }
                return `<span class="highlight-age possible">${match}</span>`;
            });
        });
    });

    return highlighted;
}

// ============================================================================
// MODAL DRAG FUNCTIONALITY
// ============================================================================

function closeModalById(modalId) {
    const modalInfo = resultsModals.find(m => m.modalId === modalId);
    if (modalInfo) {
        // Remove overlay if it exists in the DOM (most modals don't add one)
        if (modalInfo.overlay && modalInfo.overlay.parentNode) {
            modalInfo.overlay.parentNode.removeChild(modalInfo.overlay);
        }

        // Always attempt to remove the modal itself
        if (modalInfo.modal && modalInfo.modal.parentNode) {
            modalInfo.modal.parentNode.removeChild(modalInfo.modal);
        }

        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    }
}

function bringToFront(modal) {
    zIndexCounter++;
    modal.style.zIndex = zIndexCounter;
}

function normalizeModalPosition(modal) {
    const transform = window.getComputedStyle(modal).transform;
    if (transform && transform !== 'none') {
        const rect = modal.getBoundingClientRect();
        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;
        modal.style.transform = 'none';
    }
}

function makeDraggable(modal) {
    const dragHandle = modal.querySelector('.age-modal-title-row') || modal.querySelector('.age-modal-header');
    let isDragging = false;
    let startX, startY;
    let modalStartLeft, modalStartTop;

    dragHandle.addEventListener('mousedown', dragStart);

    function dragStart(e) {
        if (e.target.classList.contains('age-modal-close')) {
            return; // Don't drag when clicking close button
        }

        // Ensure modal uses pixel positioning before starting drag
        normalizeModalPosition(modal);

        // Get current position after potential normalization
        const rect = modal.getBoundingClientRect();
        modalStartLeft = rect.left;
        modalStartTop = rect.top;

        // Record starting mouse position
        startX = e.clientX;
        startY = e.clientY;

        isDragging = true;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            // Calculate how far the mouse has moved
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Set new position
            modal.style.left = (modalStartLeft + deltaX) + 'px';
            modal.style.top = (modalStartTop + deltaY) + 'px';
        }
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    }
}

// ============================================================================
// RESULTS MODAL
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showResultsModal(username, ageData) {
    const modalId = `age-modal-${modalCounter++}`;

    const overlay = document.createElement('div');
    overlay.className = 'age-modal-overlay';
    overlay.dataset.modalId = modalId;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.minWidth = '600px';
    modal.style.width = '800px';
    modal.style.height = '750px';
    modal.style.zIndex = ++zIndexCounter;

    const postedAges = ageData.postedAges;
    const possibleAges = ageData.possibleAges;
    const allAges = [...postedAges, ...possibleAges];
    const results = ageData.results;

    let summaryHTML = '';
    if (allAges.length === 0) {
        summaryHTML = `<div class="age-summary">
            <div class="age-summary-title">No ages found for u/${username}</div>
            <p>No posts found matching age patterns (${MIN_AGE}-${MAX_AGE}).</p>
        </div>`;
    } else {
        // Create posted age chips
        let postedChipsHTML = '';
        if (postedAges.length > 0) {
            postedChipsHTML = `
                <div style="margin-top: 10px;">
                    <strong>Posted Ages (in brackets):</strong>
                    <div class="age-filter-chips">
                        ${postedAges.map(age =>
                            `<span class="age-chip posted" data-age="${age}" data-type="posted">${age}</span>`
                        ).join('')}
                    </div>
                </div>
            `;
        }

        // Create possible age chips
        let possibleChipsHTML = '';
        if (possibleAges.length > 0) {
            possibleChipsHTML = `
                <div style="margin-top: 10px;">
                    <strong>Possible Ages (not in brackets):</strong>
                    <div class="age-filter-chips">
                        ${possibleAges.map(age =>
                            `<span class="age-chip possible" data-age="${age}" data-type="possible">${age}</span>`
                        ).join('')}
                    </div>
                </div>
            `;
        }

        const minPosted = postedAges.length > 0 ? Math.min(...postedAges) : null;
        const maxPosted = postedAges.length > 0 ? Math.max(...postedAges) : null;
        const postedRangeText = minPosted !== null
            ? (minPosted === maxPosted ? `${minPosted}` : `${minPosted}-${maxPosted}`)
            : 'None';

        // Calculate estimated current age
        const ageEstimate = estimateCurrentAge(ageData);
        let estimateHTML = '';
        if (ageEstimate) {
            if (ageEstimate.skipped) {
                // Show anomaly warning instead of estimate
                estimateHTML = `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #343536;">
                    <strong style="color: #ff6b6b;">⚠ Age Anomaly Detected</strong>
                    <br>
                    <span style="color: #ff6b6b; font-size: 12px;">${ageEstimate.message}</span>
                </p>`;
            } else {
                // Show estimate
                const confidenceColors = {
                    'High': '#46d160',
                    'Medium': '#ff8c42',
                    'Low': '#ffa500',
                    'Very Low': '#ff6b6b'
                };
                const confidenceColor = confidenceColors[ageEstimate.confidence] || '#818384';

                let anomalyNote = '';
                if (ageEstimate.anomaliesDetected || ageEstimate.majorJump) {
                    anomalyNote = '<br><span style="color: #ff8c42; font-size: 11px;">⚠ Age inconsistencies detected in data</span>';
                }

                estimateHTML = `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #343536;">
                    <strong>Estimated Current Age:</strong>
                    <span style="color: ${confidenceColor}; font-weight: bold; font-size: 16px;">${ageEstimate.estimatedAge}</span>
                    <span style="color: #818384; font-size: 12px;"> (${ageEstimate.confidence} Confidence)</span>
                    <br>
                    <span style="color: #818384; font-size: 11px;">Based on ${ageEstimate.dataPoints} data point${ageEstimate.dataPoints > 1 ? 's' : ''} spanning ${ageEstimate.yearSpan} year${ageEstimate.yearSpan !== 1 ? 's' : ''}</span>
                    ${anomalyNote}
                </p>`;
            }
        }

        summaryHTML = `<div class="age-summary">
            <div class="age-summary-title">Found Ages: ${postedRangeText}</div>
            <p>Posted ages found: ${postedAges.length > 0 ? postedAges.join(', ') : 'None'}</p>
            <p>Possible ages found: ${possibleAges.length > 0 ? possibleAges.join(', ') : 'None'}</p>
            <p>Total posts with age mentions: ${results.length}</p>
            ${estimateHTML}
            ${postedChipsHTML}
            ${possibleChipsHTML}
        </div>`;
    }

    const topbarHTML = `
        <div class="age-modal-topbar">
            ${summaryHTML}
            <div class="age-filter-status-container"></div>
        </div>
    `;

    let resultsHTML = '';
    if (results.length > 0) {
        resultsHTML = '<div class="age-results-container">';
        results.forEach((result, index) => {
            const postedBadge = result.postedAges.length > 0
                ? `<span style="color: #46d160;">✓ ${result.postedAges.join(', ')}</span>`
                : '';
            const possibleBadge = result.possibleAges.length > 0
                ? `<span style="color: #818384;">? ${result.possibleAges.join(', ')}</span>`
                : '';

            // Process title
            const titleNeedsTruncation = result.title.length > TITLE_SNIPPET_LENGTH;
            const displayTitle = titleNeedsTruncation
                ? result.title.substring(0, TITLE_SNIPPET_LENGTH)
                : result.title;
            const highlightedTitle = highlightAgesInText(displayTitle, result.postedAges, result.possibleAges);

            const titleExpandLink = titleNeedsTruncation
                ? `<span class="expand-link" data-target="title-${index}"> [ Expand ]</span>`
                : '';
            const titleCollapseLink = titleNeedsTruncation
                ? `<span class="collapse-link" data-target="title-${index}" style="display: none;"> [ Collapse ]</span>`
                : '';

            // Process body (selftext)
            let bodyHTML = '';
            if (result.selftext && result.selftext.trim().length > 0) {
                const bodyNeedsTruncation = result.selftext.length > BODY_SNIPPET_LENGTH;
                const displayBody = bodyNeedsTruncation
                    ? result.selftext.substring(0, BODY_SNIPPET_LENGTH)
                    : result.selftext;
                const highlightedBody = highlightAgesInText(displayBody, result.postedAges, result.possibleAges);

                const bodyExpandLink = bodyNeedsTruncation
                    ? `<span class="expand-link" data-target="body-${index}"> [ Expand ]</span>`
                    : '';
                const bodyCollapseLink = bodyNeedsTruncation
                    ? `<span class="collapse-link" data-target="body-${index}" style="display: none;"> [ Collapse ]</span>`
                    : '';

                bodyHTML = `
                    <div class="age-result-snippet">
                        <span class="snippet-content" data-id="body-${index}" data-full="${escapeHtml(result.selftext)}">${highlightedBody}</span>${bodyExpandLink}${bodyCollapseLink}
                    </div>
                `;
            }

            resultsHTML += `
                <div class="age-result-item" data-index="${index}"
                     data-posted-ages="${result.postedAges.join(',')}"
                     data-possible-ages="${result.possibleAges.join(',')}"
                     data-all-ages="${result.allAges.join(',')}">
                    <div class="age-result-header">
                        <span class="age-result-age">Age: ${postedBadge} ${possibleBadge} · <span class="age-result-subreddit"><a href='https://old.reddit.com/r/${result.subreddit}' target='_blank'>r/${result.subreddit}</a></span></span>
                        <span class="age-result-date">${result.date}</span>
                    </div>
                    <div class="age-result-snippet" style="font-weight: 500; margin-bottom: ${bodyHTML ? '8px' : '0'};">
                        <span class="snippet-content" data-id="title-${index}" data-full="${escapeHtml(result.title)}">${highlightedTitle}</span>${titleExpandLink}${titleCollapseLink}
                    </div>
                    ${bodyHTML}
                    <a href="${result.permalink}" target="_blank" class="age-result-link">View Post →</a>
                </div>
            `;
        });
        resultsHTML += '</div>';
    }

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Age Verification: u/${username}</div>
                <button class="age-modal-close">&times;</button>
            </div>
            ${topbarHTML}
        </div>
        <div class="age-modal-content">
            ${resultsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button recheck-age">Recheck Age</button>
            <button class="age-modal-button danger clear-user">Clear This User Cache</button>
            <button class="age-modal-button danger clear-all">Clear All Cache</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    // Don't append overlay - we don't want darkening with multiple modals
    // document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Make modal draggable
    makeDraggable(modal);

    // Add click-to-focus functionality and ensure transform is removed for proper resizing
    modal.addEventListener('mousedown', (e) => {
        bringToFront(modal);

        // Remove transform on first interaction for proper resizing
        normalizeModalPosition(modal);
    });

    // Store modal reference
    resultsModals.push({ modalId, modal, overlay, username });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-button.secondary');
    const recheckBtn = modal.querySelector('.recheck-age');
    const clearUserBtn = modal.querySelector('.clear-user');
    const clearAllBtn = modal.querySelector('.clear-all');
    const ageChips = modal.querySelectorAll('.age-chip');
    const resultItems = modal.querySelectorAll('.age-result-item');
    const filterStatusContainer = modal.querySelector('.age-filter-status-container');
    const contentContainer = modal.querySelector('.age-modal-content');

    let activeFilter = null;

    const closeModal = () => {
        // Don't try to remove overlay since we didn't append it
        // document.body.removeChild(overlay);
        document.body.removeChild(modal);
        // Remove from tracking array
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    recheckBtn.onclick = () => {
        clearUserCache(username);
        closeModal();
        handleAgeCheck(username);
    };

    clearUserBtn.onclick = () => {
        if (confirm(`Clear cached data for u/${username}?`)) {
            clearUserCache(username);
            closeModal();
            updateButtonForUser(username);
        }
    };

    clearAllBtn.onclick = () => {
        if (confirm('Clear all cached age verification data?')) {
            clearAllCache();
            closeModal();
            document.querySelectorAll('.age-check-button.cached').forEach(btn => {
                const username = btn.dataset.username;
                updateButtonForUser(username);
            });
        }
    };

    // Age filter functionality
    ageChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filterAge = parseInt(chip.dataset.age);
            const isSwitchingFilter = activeFilter !== null && activeFilter !== filterAge;

            if (activeFilter === filterAge) {
                // Clear filter
                activeFilter = null;
                chip.classList.remove('active');
                resultItems.forEach(item => item.classList.remove('hidden'));
                // Remove filter status if exists
                if (filterStatusContainer) {
                    filterStatusContainer.innerHTML = '';
                }
            } else {
                // Apply filter
                activeFilter = filterAge;

                // Update chip states
                ageChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                // Filter results based on chip type
                const chipType = chip.dataset.type; // 'posted' or 'possible'

                resultItems.forEach(item => {
                    let shouldShow = false;

                    if (chipType === 'posted') {
                        // Posted age chips: only show if age is in posted ages
                        const postedAges = item.dataset.postedAges ?
                            item.dataset.postedAges.split(',').map(a => parseInt(a)) : [];
                        shouldShow = postedAges.includes(filterAge);
                    } else if (chipType === 'possible') {
                        // Possible age chips: show if age is in either posted OR possible
                        const postedAges = item.dataset.postedAges ?
                            item.dataset.postedAges.split(',').map(a => parseInt(a)) : [];
                        const possibleAges = item.dataset.possibleAges ?
                            item.dataset.possibleAges.split(',').map(a => parseInt(a)) : [];
                        shouldShow = postedAges.includes(filterAge) || possibleAges.includes(filterAge);
                    }

                    if (shouldShow) {
                        item.classList.remove('hidden');
                    } else {
                        item.classList.add('hidden');
                    }
                });

                // Add/update filter status message
                if (filterStatusContainer) {
                    let filterStatus = filterStatusContainer.querySelector('.age-filter-status');
                    if (!filterStatus) {
                        filterStatus = document.createElement('div');
                        filterStatus.className = 'age-filter-status';
                        filterStatusContainer.appendChild(filterStatus);
                    }
                    const visibleCount = Array.from(resultItems).filter(item => !item.classList.contains('hidden')).length;
                    filterStatus.textContent = `Showing ${visibleCount} posts with age ${filterAge}. Click to clear filter.`;
                    filterStatus.onclick = () => {
                        activeFilter = null;
                        ageChips.forEach(c => c.classList.remove('active'));
                        resultItems.forEach(item => item.classList.remove('hidden'));
                        filterStatusContainer.innerHTML = '';
                    };
                }

                if (isSwitchingFilter && contentContainer) {
                    contentContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        });
    });

    // Expand/collapse functionality
    const expandLinks = modal.querySelectorAll('.expand-link');
    const collapseLinks = modal.querySelectorAll('.collapse-link');

    expandLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.dataset.target;
            const contentSpan = modal.querySelector(`.snippet-content[data-id="${targetId}"]`);
            const collapseLink = modal.querySelector(`.collapse-link[data-target="${targetId}"]`);

            if (contentSpan && collapseLink) {
                const fullText = contentSpan.dataset.full;
                const postedAges = contentSpan.closest('.age-result-item').dataset.postedAges.split(',').filter(Boolean).map(Number);
                const possibleAges = contentSpan.closest('.age-result-item').dataset.possibleAges.split(',').filter(Boolean).map(Number);

                contentSpan.innerHTML = highlightAgesInText(fullText, postedAges, possibleAges);
                link.style.display = 'none';
                collapseLink.style.display = 'inline';
            }
        });
    });

    collapseLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.dataset.target;
            const contentSpan = modal.querySelector(`.snippet-content[data-id="${targetId}"]`);
            const expandLink = modal.querySelector(`.expand-link[data-target="${targetId}"]`);

            if (contentSpan && expandLink) {
                const fullText = contentSpan.dataset.full;
                const postedAges = contentSpan.closest('.age-result-item').dataset.postedAges.split(',').filter(Boolean).map(Number);
                const possibleAges = contentSpan.closest('.age-result-item').dataset.possibleAges.split(',').filter(Boolean).map(Number);

                const isTitle = targetId.startsWith('title-');
                const maxLength = isTitle ? TITLE_SNIPPET_LENGTH : BODY_SNIPPET_LENGTH;
                const truncated = fullText.substring(0, maxLength);

                contentSpan.innerHTML = highlightAgesInText(truncated, postedAges, possibleAges);
                link.style.display = 'none';
                expandLink.style.display = 'inline';
            }
        });
    });
}

function showErrorModal(username, error) {
    const modalId = `age-modal-${modalCounter++}`;

    const overlay = document.createElement('div');
    overlay.className = 'age-modal-overlay';
    overlay.dataset.modalId = modalId;

    const modal = document.createElement('div');
    modal.className = 'age-modal';
    modal.dataset.modalId = modalId;
    modal.style.zIndex = ++zIndexCounter;

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title">Error: u/${username}</div>
            <button class="age-modal-close">&times;</button>
        </div>
        <div class="age-modal-content">
            <div class="age-error">
                <strong>Error:</strong> ${error}
            </div>
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    // Don't append overlay
    // document.body.appendChild(overlay);
    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', (e) => {
        bringToFront(modal);

        // Remove transform on first interaction
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay, username });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-button');

    const closeModal = () => {
        // document.body.removeChild(overlay);
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;
}

function showLoadingModal(username) {
    const modalId = `age-modal-${modalCounter++}`;

    const overlay = document.createElement('div');
    overlay.className = 'age-modal-overlay';
    overlay.dataset.modalId = modalId;

    const modal = document.createElement('div');
    modal.className = 'age-modal';
    modal.dataset.modalId = modalId;
    modal.style.zIndex = ++zIndexCounter;

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title">Checking Ages: u/${username}</div>
        </div>
        <div class="age-modal-content">
            <div class="age-loading">Searching PushShift</div>
        </div>
    `;

    // Don't append overlay
    // document.body.appendChild(overlay);
    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', (e) => {
        bringToFront(modal);

        // Remove transform on first interaction
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay, username });

    // Return modal ID so it can be closed later
    return modalId;
}

// ============================================================================
// BUTTON MANAGEMENT
// ============================================================================

async function handleAgeCheck(username) {
    // Check for cached data first
    const cached = getCachedAgeData(username);
    if (cached) {
        showResultsModal(username, cached);
        return;
    }

    // Check if we have a token
    if (!apiToken) {
        attemptAutoFetchToken(); // Always returns false, logs message
        showTokenModal(username);
        return;
    }

    // Show loading modal and get its ID
    const loadingModalId = showLoadingModal(username);

    try {
        const results = await searchUserAges(username);
        const ageData = processResults(results, username);

        // Cache the results
        setCachedAgeData(username, ageData);

        // Update button
        updateButtonForUser(username);

        // Close loading modal
        closeModalById(loadingModalId);

        // Show results
        showResultsModal(username, ageData);
    } catch (error) {
        console.error('Age check error:', error);

        // Close loading modal
        closeModalById(loadingModalId);

        // Show error
        showErrorModal(username, error.message);

        // If token error, show token modal after closing error and retry with username
        if (error.message.includes('token') || error.message.includes('Token')) {
            setTimeout(() => {
                showTokenModal(username);
            }, 100);
        }
    }
}

function createAgeCheckButton(username) {
    const button = document.createElement('button');
    button.className = 'age-check-button';
    button.dataset.username = username;

    const cached = getCachedAgeData(username);
    if (cached && cached.postedAges && cached.postedAges.length > 0) {
        const minAge = Math.min(...cached.postedAges);
        const maxAge = Math.max(...cached.postedAges);
        const ageText = minAge === maxAge ? minAge : `${minAge}-${maxAge}`;
        //button.textContent = `Age: ${ageText} - Recheck`;
        button.textContent = `Age: ${ageText}`;
        button.classList.add('cached');
    } else if (cached) {
        //button.textContent = 'No Posted Ages - Recheck';
        button.textContent = 'No Posted Ages';
        button.classList.add('cached');
    } else {
        button.textContent = 'Check Age';
    }

    button.onclick = () => handleAgeCheck(username);

    return button;
}

function updateButtonForUser(username) {
    const buttons = document.querySelectorAll(`.age-check-button[data-username="${username}"]`);
    buttons.forEach(button => {
        const cached = getCachedAgeData(username);
        if (cached && cached.postedAges && cached.postedAges.length > 0) {
            const minAge = Math.min(...cached.postedAges);
            const maxAge = Math.max(...cached.postedAges);
            const ageText = minAge === maxAge ? minAge : `${minAge}-${maxAge}`;
            //button.textContent = `Age: ${ageText} - Recheck`;
            button.textContent = `Age: ${ageText}`;
            button.classList.add('cached');
        } else if (cached) {
            //button.textContent = 'No Posted Ages - Recheck';
            button.textContent = 'No Posted Ages';
            button.classList.add('cached');
        } else {
            button.textContent = 'Check Age';
            button.classList.remove('cached');
        }
    });
}

function hasAgeButton(tagline) {
    return tagline.querySelector('.age-check-button') !== null;
}

function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function extractUsernameFromUrl(url) {
    const match = url.match(/reddit\.com\/user\/([^\/?#]+)/i);
    return match ? decodeURIComponent(match[1].replace(/^u\//i, '')) : null;
}

function processOldReddit() {
    const taglines = document.getElementsByClassName('tagline');
    for (let i = 0; i < taglines.length; i++) {
        if (!hasAgeButton(taglines[i])) {
            const authorTag = taglines[i].getElementsByClassName('author')[0];
            if (authorTag != null) {
                const username = authorTag.innerHTML;
                if (!(username in userToButtonNode)) {
                    userToButtonNode[username] = createAgeCheckButton(username);
                }
                const button = userToButtonNode[username].cloneNode(true);
                button.onclick = () => handleAgeCheck(username);
                insertAfter(button, authorTag);
            }
        }
    }
}

function processModReddit() {
    const userLinks = document.querySelectorAll('a[href*="reddit.com/user/"]');

    userLinks.forEach(link => {
        if (link.dataset.ageVerifierProcessed === 'true') {
            return;
        }

        const username = extractUsernameFromUrl(link.href);
        if (!username) {
            return;
        }

        if (!(username in userToButtonNode)) {
            userToButtonNode[username] = createAgeCheckButton(username);
        }

        const button = userToButtonNode[username].cloneNode(true);
        button.onclick = () => handleAgeCheck(username);

        if (link.parentElement) {
            insertAfter(button, link);
            link.dataset.ageVerifierProcessed = 'true';
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const isModReddit = location.hostname.includes('mod.reddit.com');
const activeProcessor = isModReddit ? processModReddit : processOldReddit;

let debounceTimer;
function debouncedMainLoop() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(activeProcessor, 500);
}

// Load token on startup
loadToken();

// Set up mutation observer
const observer = new MutationObserver(debouncedMainLoop);
observer.observe(document.body, { childList: true, subtree: true });

logDebug(`Reddit Age Verifier ready for ${isModReddit ? 'mod.reddit.com' : 'old.reddit.com'}`);
logDebug(`Checking ages ${MIN_AGE}-${MAX_AGE} using PushShift API with exact_author=true`);
