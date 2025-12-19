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
// @version      1.18
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
let debugMode = true; // Set to 'true' for console logs

// Search configuration
let MIN_AGE = 10;                // Minimum age to search for
let MAX_AGE = 70;                // Maximum age to search for

let ENABLE_VERY_LOW_CONFIDENCE = true;  // Show age estimates even with very low confidence

// Snippet length configuration
let TITLE_SNIPPET_LENGTH = 150;   // Characters to show for title before truncating
let BODY_SNIPPET_LENGTH = 300;    // Characters to show for post body before truncating

// Cache expiration times
let CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000;      // 1 week for user results
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000;          // 24 hours for API token

// PushShift API configuration
const PUSHSHIFT_API_BASE = "https://api.pushshift.io";
const PUSHSHIFT_AUTH_URL = "https://auth.pushshift.io/authorize";
const PUSHSHIFT_TOKEN_URL = "https://api.pushshift.io/signup";

// ============================================================================
// USER SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
    debugMode: debugMode,
    minAge: MIN_AGE,
    maxAge: MAX_AGE,
    enableVeryLowConfidence: ENABLE_VERY_LOW_CONFIDENCE,
    titleSnippetLength: TITLE_SNIPPET_LENGTH,
    bodySnippetLength: BODY_SNIPPET_LENGTH,
    cacheExpiration: CACHE_EXPIRATION / (24 * 60 * 60 * 1000), // in days
    ignoredUsers: [],
    // Additional features
    showAgeEstimation: true,
    defaultSort: 'newest', // 'oldest' or 'newest'
    autoFilterPosted: false, // auto-filter to show only posted ages
    commonBots: {
        AutoModerator: true,
        RepostSleuthBot: true,
        sneakpeekbot: true,
        RemindMeBot: true,
        MTGCardFetcher: true
    }
};

let userSettings = null;

function loadSettings() {
    const saved = GM_getValue('ageVerifierSettings', null);
    if (saved) {
        userSettings = JSON.parse(saved);
        // Merge with defaults for any missing keys (handles updates to DEFAULT_SETTINGS)
        userSettings = { ...DEFAULT_SETTINGS, ...userSettings };
        // Ensure commonBots object exists and has all default bots
        if (!userSettings.commonBots) {
            userSettings.commonBots = { ...DEFAULT_SETTINGS.commonBots };
        } else {
            userSettings.commonBots = { ...DEFAULT_SETTINGS.commonBots, ...userSettings.commonBots };
        }
    } else {
        userSettings = { ...DEFAULT_SETTINGS };
    }

    applySettings();
}

function saveSettings(settings) {
    userSettings = settings;
    GM_setValue('ageVerifierSettings', JSON.stringify(settings));
    applySettings();
}

function applySettings() {
    debugMode = userSettings.debugMode;
    MIN_AGE = userSettings.minAge;
    MAX_AGE = userSettings.maxAge;
    ENABLE_VERY_LOW_CONFIDENCE = userSettings.enableVeryLowConfidence;
    TITLE_SNIPPET_LENGTH = userSettings.titleSnippetLength;
    BODY_SNIPPET_LENGTH = userSettings.bodySnippetLength;
    CACHE_EXPIRATION = userSettings.cacheExpiration * 24 * 60 * 60 * 1000; // convert days to ms
}

function getIgnoredUsersList() {
    const ignored = new Set(userSettings.ignoredUsers.map(u => u.toLowerCase()));

    // Add common bots if enabled
    if (userSettings.commonBots) {
        Object.keys(userSettings.commonBots).forEach(bot => {
            if (userSettings.commonBots[bot]) {
                ignored.add(bot.toLowerCase());
            }
        });
    }

    return ignored;
}

function resetToDefaults() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        userSettings = { ...DEFAULT_SETTINGS };
        GM_setValue('ageVerifierSettings', JSON.stringify(userSettings));
        applySettings();
        return true;
    }
    return false;
}

function exportSettings() {
    const dataStr = JSON.stringify(userSettings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reddit-age-verifier-settings.json';
    link.click();
    URL.revokeObjectURL(url);
}

function importSettings(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            // Validate and merge with defaults
            const merged = { ...DEFAULT_SETTINGS, ...imported };
            // Ensure commonBots is properly merged
            if (imported.commonBots) {
                merged.commonBots = { ...DEFAULT_SETTINGS.commonBots, ...imported.commonBots };
            }
            saveSettings(merged);
            alert('Settings imported successfully! Please refresh the page for all changes to take effect.');
        } catch (error) {
            alert('Failed to import settings. Please ensure the file is valid JSON.');
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
}

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
        max-width: 95vw;
        max-height: 95vh;  /* <-- Increased to 95% */
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

    /* Settings Modal Specific Styles */
    .age-settings-section {
        margin-bottom: 25px;
        padding-bottom: 20px;
        border-bottom: 1px solid #343536;
    }

    .age-settings-section:last-child {
        border-bottom: none;
        margin-bottom: 0;
    }

    .age-settings-section-title {
        font-size: 16px;
        font-weight: bold;
        color: #d7dadc;
        margin-bottom: 15px;
    }

    .age-settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 15px;
    }

    .age-settings-label {
        color: #d7dadc;
        font-size: 13px;
        flex: 1;
    }

    .age-settings-input {
        background-color: #272729;
        border: 1px solid #343536;
        border-radius: 4px;
        color: #d7dadc;
        padding: 6px 10px;
        font-size: 13px;
        width: 80px;
    }

    .age-settings-input:focus {
        outline: none;
        border-color: #0079d3;
    }

    .age-settings-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .age-settings-textarea {
        width: 100%;
        min-height: 100px;
        background-color: #272729;
        border: 1px solid #343536;
        border-radius: 4px;
        color: #d7dadc;
        padding: 8px;
        font-size: 12px;
        font-family: monospace;
        resize: vertical;
    }

    .age-settings-textarea:focus {
        outline: none;
        border-color: #0079d3;
    }

    .age-ignored-users-list {
        max-height: 150px;
        overflow-y: auto;
        background-color: #272729;
        border: 1px solid #343536;
        border-radius: 4px;
        padding: 8px;
        margin-top: 10px;
    }

    .age-ignored-user-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        margin-bottom: 4px;
        background-color: #1a1a1b;
        border-radius: 3px;
    }

    .age-ignored-user-name {
        color: #d7dadc;
        font-size: 12px;
        font-family: monospace;
    }

    .age-ignored-user-remove {
        background-color: #ea0027;
        color: white;
        border: none;
        border-radius: 3px;
        padding: 2px 8px;
        font-size: 11px;
        cursor: pointer;
        font-weight: bold;
    }

    .age-ignored-user-remove:hover {
        background-color: #c20022;
    }

    .age-settings-bot-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-top: 10px;
    }

    .age-settings-bot-item {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .age-settings-bot-label {
        color: #d7dadc;
        font-size: 12px;
        font-family: monospace;
    }

    .age-settings-buttons-row {
        display: flex;
        gap: 10px;
        margin-top: 15px;
    }

    .age-settings-gear {
        background: none;
        border: none;
        color: #818384;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        line-height: 30px;
        text-align: center;
        margin-left: 10px;
    }

    .age-settings-gear:hover {
        color: #d7dadc;
    }

    .age-settings-help-text {
        color: #818384;
        font-size: 11px;
        margin-top: 5px;
        font-style: italic;
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
            <div class="age-modal-title-row">
                <div class="age-modal-title">PushShift API Token Required</div>
                <div style="display: flex; align-items: center;">
                    <button class="age-settings-gear" title="Settings">⚙</button>
                    <button class="age-modal-close">&times;</button>
                </div>
            </div>
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

    const settingsBtn = modal.querySelector('.age-settings-gear');
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        showSettingsModal();
    };

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

function showSettingsModal() {
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.minWidth = '650px';
    modal.style.width = '700px';
    modal.style.height = '80vh';
    modal.style.zIndex = ++zIndexCounter;

    // Build common bots checkboxes
    const commonBotsHTML = Object.keys(DEFAULT_SETTINGS.commonBots).map(botName => {
        const isChecked = userSettings.commonBots[botName] ? 'checked' : '';
        return `
            <div class="age-settings-bot-item">
                <input type="checkbox" class="age-settings-checkbox common-bot-checkbox"
                       data-bot="${botName}" ${isChecked} id="bot-${botName}">
                <label class="age-settings-bot-label" for="bot-${botName}">${botName}</label>
            </div>
        `;
    }).join('');

    // Build ignored users list
    const ignoredUsersListHTML = userSettings.ignoredUsers.length > 0
        ? `<div class="age-ignored-users-list">
            ${userSettings.ignoredUsers.map(user => `
                <div class="age-ignored-user-item">
                    <span class="age-ignored-user-name">${escapeHtml(user)}</span>
                    <button class="age-ignored-user-remove" data-username="${escapeHtml(user)}">Remove</button>
                </div>
            `).join('')}
           </div>`
        : '<p class="age-settings-help-text">No ignored users yet.</p>';

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Settings</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <!-- General Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">General Settings</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Enable Debug Mode</label>
                    <input type="checkbox" class="age-settings-checkbox" id="setting-debug"
                           ${userSettings.debugMode ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Show Age Estimation</label>
                    <input type="checkbox" class="age-settings-checkbox" id="setting-show-estimation"
                           ${userSettings.showAgeEstimation ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Enable Very Low Confidence Estimates</label>
                    <input type="checkbox" class="age-settings-checkbox" id="setting-very-low-confidence"
                           ${userSettings.enableVeryLowConfidence ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Auto-Filter to Posted Ages Only</label>
                    <input type="checkbox" class="age-settings-checkbox" id="setting-auto-filter"
                           ${userSettings.autoFilterPosted ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Sort Order</label>
                    <select class="age-settings-input" id="setting-sort-order" style="width: 120px;">
                        <option value="oldest" ${userSettings.defaultSort === 'oldest' ? 'selected' : ''}>Oldest First</option>
                        <option value="newest" ${userSettings.defaultSort === 'newest' ? 'selected' : ''}>Newest First</option>
                    </select>
                </div>
            </div>

            <!-- Age Range Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Age Search Range</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Minimum Age</label>
                    <input type="number" class="age-settings-input" id="setting-min-age"
                           value="${userSettings.minAge}" min="1" max="99">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Maximum Age</label>
                    <input type="number" class="age-settings-input" id="setting-max-age"
                           value="${userSettings.maxAge}" min="1" max="99">
                </div>
            </div>

            <!-- Display Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Display Settings</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Title Snippet Length (characters)</label>
                    <input type="number" class="age-settings-input" id="setting-title-length"
                           value="${userSettings.titleSnippetLength}" min="50" max="500">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Body Snippet Length (characters)</label>
                    <input type="number" class="age-settings-input" id="setting-body-length"
                           value="${userSettings.bodySnippetLength}" min="50" max="1000">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Cache Expiration (days)</label>
                    <input type="number" class="age-settings-input" id="setting-cache-days"
                           value="${userSettings.cacheExpiration}" min="1" max="90">
                </div>
            </div>

            <!-- Common Bots -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Common Bots to Ignore</div>
                <p class="age-settings-help-text">Automatically hide age check button for these known bots</p>
                <div class="age-settings-bot-list">
                    ${commonBotsHTML}
                </div>
            </div>

            <!-- Ignored Users -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Ignored Users</div>
                <p class="age-settings-help-text">Add usernames (one per line) to never show age check buttons for</p>
                <textarea class="age-settings-textarea" id="ignored-users-input"
                          placeholder="username1&#10;username2&#10;username3"></textarea>
                <div class="age-settings-buttons-row">
                    <button class="age-modal-button" id="add-ignored-users">Add Users</button>
                </div>
                ${ignoredUsersListHTML}
            </div>

            <!-- Import/Export -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Backup & Restore</div>
                <div class="age-settings-buttons-row">
                    <button class="age-modal-button secondary" id="export-settings">Export Settings</button>
                    <button class="age-modal-button secondary" id="import-settings-btn">Import Settings</button>
                    <input type="file" id="import-settings-file" accept=".json" style="display: none;">
                    <button class="age-modal-button danger" id="reset-settings">Reset to Defaults</button>
                </div>
            </div>
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="save-settings">Save & Apply</button>
            <button class="age-modal-button secondary" id="cancel-settings">Cancel</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username: 'settings' });

    // Event Handlers
    const closeBtn = modal.querySelector('.age-modal-close');
    const saveBtn = modal.querySelector('#save-settings');
    const cancelBtn = modal.querySelector('#cancel-settings');
    const exportBtn = modal.querySelector('#export-settings');
    const importBtn = modal.querySelector('#import-settings-btn');
    const importFile = modal.querySelector('#import-settings-file');
    const resetBtn = modal.querySelector('#reset-settings');
    const addUsersBtn = modal.querySelector('#add-ignored-users');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    saveBtn.onclick = () => {
        const oldSortOrder = userSettings.defaultSort;

        const newSettings = {
            debugMode: modal.querySelector('#setting-debug').checked,
            minAge: parseInt(modal.querySelector('#setting-min-age').value),
            maxAge: parseInt(modal.querySelector('#setting-max-age').value),
            enableVeryLowConfidence: modal.querySelector('#setting-very-low-confidence').checked,
            titleSnippetLength: parseInt(modal.querySelector('#setting-title-length').value),
            bodySnippetLength: parseInt(modal.querySelector('#setting-body-length').value),
            cacheExpiration: parseInt(modal.querySelector('#setting-cache-days').value),
            showAgeEstimation: modal.querySelector('#setting-show-estimation').checked,
            defaultSort: modal.querySelector('#setting-sort-order').value,
            autoFilterPosted: modal.querySelector('#setting-auto-filter').checked,
            ignoredUsers: userSettings.ignoredUsers, // Keep existing
            commonBots: {}
        };

        // Collect common bots settings
        modal.querySelectorAll('.common-bot-checkbox').forEach(checkbox => {
            newSettings.commonBots[checkbox.dataset.bot] = checkbox.checked;
        });

        saveSettings(newSettings);

        // If sort order changed, update all currently open results modals
        if (oldSortOrder !== newSettings.defaultSort) {
            resultsModals.forEach(modalInfo => {
                // Skip settings modal and only process results modals
                if (modalInfo.username !== 'settings') {
                    const sortButton = modalInfo.modal.querySelector('#toggle-sort-order');
                    if (sortButton) {
                        // Check if current display matches new setting
                        const buttonText = sortButton.textContent;
                        const currentlyShowingNewest = buttonText.includes('Newest First');
                        const shouldShowNewest = newSettings.defaultSort === 'newest';

                        // If they don't match, toggle the sort
                        if (currentlyShowingNewest !== shouldShowNewest) {
                            sortButton.click();
                        }
                    }
                }
            });
        }

        alert('Settings saved! Please refresh the page for all changes to take effect.');
        closeModal();
    };

    exportBtn.onclick = () => {
        exportSettings();
    };

    importBtn.onclick = () => {
        importFile.click();
    };

    importFile.onchange = () => {
        importSettings(importFile);
    };

    resetBtn.onclick = () => {
        if (resetToDefaults()) {
            closeModal();
            alert('Settings reset to defaults! Please refresh the page.');
        }
    };

    addUsersBtn.onclick = () => {
        const textarea = modal.querySelector('#ignored-users-input');
        const newUsers = textarea.value
            .split('\n')
            .map(u => u.trim())
            .filter(u => u.length > 0)
            .filter(u => !userSettings.ignoredUsers.includes(u)); // Don't add duplicates

        if (newUsers.length > 0) {
            userSettings.ignoredUsers.push(...newUsers);
            textarea.value = '';

            // Rebuild the ignored users list
            const listContainer = modal.querySelector('.age-ignored-users-list')?.parentElement;
            if (listContainer) {
                const oldList = modal.querySelector('.age-ignored-users-list');
                const oldHelpText = listContainer.querySelector('.age-settings-help-text');
                if (oldList) oldList.remove();
                if (oldHelpText) oldHelpText.remove();

                const newListHTML = `<div class="age-ignored-users-list">
                    ${userSettings.ignoredUsers.map(user => `
                        <div class="age-ignored-user-item">
                            <span class="age-ignored-user-name">${escapeHtml(user)}</span>
                            <button class="age-ignored-user-remove" data-username="${escapeHtml(user)}">Remove</button>
                        </div>
                    `).join('')}
                </div>`;

                listContainer.insertAdjacentHTML('beforeend', newListHTML);

                // Re-attach remove handlers
                attachRemoveHandlers(modal);
            }
        }
    };

    // Attach remove button handlers
    function attachRemoveHandlers(modalElement) {
        modalElement.querySelectorAll('.age-ignored-user-remove').forEach(btn => {
            btn.onclick = () => {
                const username = btn.dataset.username;
                userSettings.ignoredUsers = userSettings.ignoredUsers.filter(u => u !== username);
                btn.closest('.age-ignored-user-item').remove();

                // If no more users, show help text
                if (userSettings.ignoredUsers.length === 0) {
                    const listContainer = modalElement.querySelector('.age-ignored-users-list')?.parentElement;
                    if (listContainer) {
                        const list = modalElement.querySelector('.age-ignored-users-list');
                        if (list) list.remove();
                        listContainer.insertAdjacentHTML('beforeend',
                            '<p class="age-settings-help-text">No ignored users yet.</p>');
                    }
                }
            };
        });
    }

    attachRemoveHandlers(modal);
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
                timestamp: post.created_utc,  // ADD THIS LINE - store raw timestamp
                subreddit: post.subreddit,
                snippet: snippet,
                permalink: `https://reddit.com${post.permalink}`,
                title: title,
                selftext: cleanSelftext
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
            // Use stored timestamp directly
            const timestamp = result.timestamp;
            if (!timestamp) {
                return; // Skip if no timestamp
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
        if (ageEstimate && userSettings.showAgeEstimation) {
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                <div class="age-filter-status-container" style="flex: 1;"></div>
                <button class="age-modal-button secondary" id="toggle-sort-order" style="margin: 0;">
                    Sort: ${userSettings.defaultSort === 'newest' ? 'Newest First' : 'Oldest First'}
                </button>
            </div>
        </div>
    `;

    // Apply sort order to results before building HTML
    if (userSettings.defaultSort === 'oldest') {
        results.reverse(); // Reverse to show oldest first
    }
    // If 'newest', keep default order (already newest first from API)

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
                <div style="display: flex; align-items: center;">
                    <button class="age-settings-gear" title="Settings">⚙</button>
                    <button class="age-modal-close">&times;</button>
                </div>
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

    const settingsBtn = modal.querySelector('.age-settings-gear');
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        showSettingsModal();
    };

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

    // Age filter functionality with multi-select support
    let activeFilters = new Set(); // Track multiple active filters as "age-type" strings

    function updateFilterDisplay() {
        const visibleCount = Array.from(resultItems).filter(item => !item.classList.contains('hidden')).length;

        if (activeFilters.size === 0) {
            // No filters active
            if (filterStatusContainer) {
                filterStatusContainer.innerHTML = '';
            }
        } else {
            // Show filter status
            if (filterStatusContainer) {
                let filterStatus = filterStatusContainer.querySelector('.age-filter-status');
                if (!filterStatus) {
                    filterStatus = document.createElement('div');
                    filterStatus.className = 'age-filter-status';
                    filterStatusContainer.appendChild(filterStatus);
                }

                // Parse filters to show ages
                const filterAges = Array.from(activeFilters).map(f => {
                    const [age, type] = f.split('-');
                    return { age: parseInt(age), type };
                });

                // Group by age and show with type indicators
                const ageGroups = {};
                filterAges.forEach(({age, type}) => {
                    if (!ageGroups[age]) {
                        ageGroups[age] = [];
                    }
                    ageGroups[age].push(type);
                });

                const agesText = Object.keys(ageGroups)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .map(age => {
                        const types = ageGroups[age];
                        if (types.length === 2) {
                            return `${age} (posted+possible)`;
                        } else if (types[0] === 'posted') {
                            return `${age} (posted)`;
                        } else {
                            return `${age} (possible)`;
                        }
                    })
                    .join(', ');

                filterStatus.textContent = `Showing ${visibleCount} posts with age${activeFilters.size > 1 ? 's' : ''} ${agesText}. Click to clear filter.`;
                filterStatus.onclick = () => {
                    activeFilters.clear();
                    ageChips.forEach(c => c.classList.remove('active'));
                    resultItems.forEach(item => item.classList.remove('hidden'));
                    filterStatusContainer.innerHTML = '';
                };
            }
        }
    }

    function applyFilters() {
        if (activeFilters.size === 0) {
            // No filters - show all
            resultItems.forEach(item => item.classList.remove('hidden'));
        } else {
            // Apply filters - show items matching ANY of the selected age-type combinations
            resultItems.forEach(item => {
                const postedAges = item.dataset.postedAges ?
                    item.dataset.postedAges.split(',').map(a => parseInt(a)) : [];
                const possibleAges = item.dataset.possibleAges ?
                    item.dataset.possibleAges.split(',').map(a => parseInt(a)) : [];

                let shouldShow = false;

                // Check each active filter (format: "age-type")
                activeFilters.forEach(filter => {
                    const [ageStr, type] = filter.split('-');
                    const filterAge = parseInt(ageStr);

                    if (type === 'posted') {
                        // Posted age filter: only show if age is in posted ages
                        if (postedAges.includes(filterAge)) {
                            shouldShow = true;
                        }
                    } else if (type === 'possible') {
                        // Possible age filter: show if age is in possible ages (not posted)
                        // A "possible" age in the data means it wasn't in brackets
                        if (possibleAges.includes(filterAge)) {
                            shouldShow = true;
                        }
                    }
                });

                if (shouldShow) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        }

        updateFilterDisplay();
    }

    ageChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            const filterAge = parseInt(chip.dataset.age);
            const filterType = chip.dataset.type;
            const filterKey = `${filterAge}-${filterType}`; // Unique key combining age and type
            const shiftKey = e.shiftKey;

            if (shiftKey) {
                // Shift-click: Toggle this age-type combination in the selection
                if (activeFilters.has(filterKey)) {
                    activeFilters.delete(filterKey);
                    chip.classList.remove('active');
                } else {
                    activeFilters.add(filterKey);
                    chip.classList.add('active');
                }
            } else {
                // Regular click: Select only this age-type (clear others)
                if (activeFilters.size === 1 && activeFilters.has(filterKey)) {
                    // Clicking the only active filter - clear it
                    activeFilters.clear();
                    chip.classList.remove('active');
                } else {
                    // Clear all other filters and select this one
                    activeFilters.clear();
                    ageChips.forEach(c => c.classList.remove('active'));
                    activeFilters.add(filterKey);
                    chip.classList.add('active');
                }
            }

            applyFilters();

            // Scroll to top if filter changed
            if (contentContainer && activeFilters.size > 0) {
                contentContainer.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Sort toggle functionality
    const sortButton = modal.querySelector('#toggle-sort-order');
    if (sortButton) {
        sortButton.onclick = () => {
            // Reverse the current display order
            const container = modal.querySelector('.age-results-container');
            if (container) {
                const items = Array.from(container.querySelectorAll('.age-result-item'));
                items.reverse().forEach(item => container.appendChild(item));

                // Update button text
                const currentText = sortButton.textContent;
                if (currentText.includes('Newest')) {
                    sortButton.textContent = 'Sort: Oldest First';
                } else {
                    sortButton.textContent = 'Sort: Newest First';
                }

                // Scroll to top
                if (contentContainer) {
                    contentContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        };
    }

    // Apply auto-filter if enabled - select ALL posted ages
    if (userSettings.autoFilterPosted && postedAges.length > 0) {
        // Select all posted age chips
        const postedChips = modal.querySelectorAll('.age-chip.posted');
        postedChips.forEach(chip => {
            const filterAge = parseInt(chip.dataset.age);
            const filterType = chip.dataset.type;
            const filterKey = `${filterAge}-${filterType}`;
            activeFilters.add(filterKey);
            chip.classList.add('active');
        });

        // Apply the filters
        applyFilters();
    }

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
    // Check if user is ignored
    const ignoredUsers = getIgnoredUsersList();
    if (ignoredUsers.has(username.toLowerCase())) {
        return null; // Don't create button for ignored users
    }

    const button = document.createElement('button');
    button.className = 'age-check-button';
    button.dataset.username = username;

    const cached = getCachedAgeData(username);
    if (cached && cached.postedAges && cached.postedAges.length > 0) {
        const minAge = Math.min(...cached.postedAges);
        const maxAge = Math.max(...cached.postedAges);
        const ageText = minAge === maxAge ? minAge : `${minAge}-${maxAge}`;
        button.textContent = `Age: ${ageText}`;
        button.classList.add('cached');
    } else if (cached) {
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
                // Skip if button is null (user is ignored)
                if (userToButtonNode[username] === null) {
                    continue;
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

        // Skip if button is null (user is ignored)
        if (userToButtonNode[username] === null) {
            link.dataset.ageVerifierProcessed = 'true';
            return;
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

// Load settings first
loadSettings();

// Load token on startup
loadToken();

// Set up mutation observer
const observer = new MutationObserver(debouncedMainLoop);
observer.observe(document.body, { childList: true, subtree: true });

logDebug(`Reddit Age Verifier ready for ${isModReddit ? 'mod.reddit.com' : 'old.reddit.com'}`);
logDebug(`Checking ages ${MIN_AGE}-${MAX_AGE} using PushShift API with exact_author=true`);
