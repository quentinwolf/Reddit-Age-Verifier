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
// @version      1.23
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
    modalWidth: 800, // default results modal width in pixels
    modalHeight: 900, // default results modal height in pixels
    trackedSubreddits: [], // subreddits to compare age behavior against
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
        margin-bottom: 4px;
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

    /* Deep Analysis Modal Styles */
    .deep-analysis-section {
        background-color: #272729;
        border: 1px solid #343536;
        border-radius: 6px;
        margin-bottom: 15px;
        overflow: hidden;
    }

    .deep-analysis-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background-color: #1f1f21;
        cursor: pointer;
        user-select: none;
    }

    .deep-analysis-header:hover {
        background-color: #2a2a2c;
    }

    .deep-analysis-title {
        font-weight: bold;
        font-size: 14px;
        color: #d7dadc;
    }

    .deep-analysis-toggle {
        color: #818384;
        font-size: 12px;
    }

    .deep-analysis-content {
        padding: 15px;
        border-top: 1px solid #343536;
    }

    .deep-analysis-content.collapsed {
        display: none;
    }

    .analysis-stat-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #343536;
    }

    .analysis-stat-row:last-child {
        border-bottom: none;
    }

    .analysis-stat-label {
        color: #818384;
        font-size: 13px;
    }

    .analysis-stat-value {
        color: #d7dadc;
        font-size: 13px;
        font-weight: 500;
    }

    .analysis-stat-value.warning {
        color: #ff8c42;
    }

    .analysis-stat-value.danger {
        color: #ff6b6b;
    }

    .analysis-stat-value.success {
        color: #46d160;
    }

    .analysis-stat-value.info {
        color: #0079d3;
    }

    .timeline-entry {
        display: flex;
        padding: 8px 12px;
        border-left: 3px solid #343536;
        margin-bottom: 8px;
        background-color: #1f1f21;
        border-radius: 0 4px 4px 0;
    }

    .timeline-entry.age-increase {
        border-left-color: #46d160;
    }

    .timeline-entry.age-decrease {
        border-left-color: #ff6b6b;
    }

    .timeline-entry.age-same {
        border-left-color: #818384;
    }

    .timeline-entry.first-post {
        border-left-color: #0079d3;
    }

    .timeline-date {
        color: #818384;
        font-size: 11px;
        min-width: 140px;
    }

    .timeline-age {
        font-weight: bold;
        min-width: 60px;
    }

    .timeline-subreddit {
        color: #0079d3;
        font-size: 12px;
        min-width: 150px;
    }

    .timeline-change {
        color: #818384;
        font-size: 12px;
        flex: 1;
    }

    .subreddit-comparison-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .subreddit-comparison-table th {
        text-align: left;
        padding: 8px;
        background-color: #1f1f21;
        color: #818384;
        font-weight: normal;
        border-bottom: 1px solid #343536;
    }

    .subreddit-comparison-table td {
        padding: 8px;
        border-bottom: 1px solid #343536;
        color: #d7dadc;
    }

    .subreddit-comparison-table tr:last-child td {
        border-bottom: none;
    }

    .couples-track {
        background-color: #1f1f21;
        border: 1px solid #343536;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 10px;
    }

    .couples-track-title {
        font-weight: bold;
        margin-bottom: 8px;
        color: #d7dadc;
    }

    .birthday-estimate {
        background-color: #1f1f21;
        border-radius: 4px;
        padding: 15px;
        text-align: center;
    }

    .birthday-month-range {
        font-size: 18px;
        font-weight: bold;
        color: #0079d3;
        margin-bottom: 5px;
    }

    .birthday-confidence {
        font-size: 12px;
        color: #818384;
    }

    .fetch-more-container {
        text-align: center;
        padding: 15px;
        border-top: 1px solid #343536;
        margin-top: 15px;
    }

    .fetch-more-status {
        color: #818384;
        font-size: 12px;
        margin-top: 8px;
    }

    .anomaly-item {
        background-color: #4a1c1c;
        border-left: 3px solid #ff6b6b;
        padding: 10px 12px;
        margin-bottom: 8px;
        border-radius: 0 4px 4px 0;
    }

    .anomaly-description {
        color: #ff6b6b;
        font-size: 13px;
    }

    .anomaly-date {
        color: #818384;
        font-size: 11px;
        margin-top: 4px;
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
    modal.style.minWidth = '500px';
    modal.style.width = '500px';
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

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Modal Width (pixels)</label>
                    <input type="number" class="age-settings-input" id="setting-modal-width"
                           value="${userSettings.modalWidth}" min="400" max="2000">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Modal Height (pixels)</label>
                    <input type="number" class="age-settings-input" id="setting-modal-height"
                           value="${userSettings.modalHeight}" min="300" max="2000">
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

            <!-- Tracked Subreddits -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Tracked Subreddits</div>
                <p class="age-settings-help-text">Subreddits you moderate - used in Deep Analysis to detect if users post different ages on your subs vs elsewhere. Enter comma-separated names (with or without r/ prefix).</p>
                <input type="text" class="age-settings-input" id="setting-tracked-subs"
                       style="width: 100%; font-family: monospace;"
                       value="${(userSettings.trackedSubreddits || []).join(', ')}"
                       placeholder="subreddit1, subreddit2, r/subreddit3">
            </div>

            <!-- Ignored Users -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Ignored Users</div>
                ${ignoredUsersListHTML}<br />
                <p class="age-settings-help-text">Add usernames (one per line) to never show age check buttons for</p>
                <textarea class="age-settings-textarea" id="ignored-users-input"
                          placeholder="username1&#10;username2&#10;username3"></textarea>
                <div class="age-settings-buttons-row">
                    <button class="age-modal-button" id="add-ignored-users">Add Users</button>
                </div>
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

        // Parse tracked subreddits - normalize by removing r/ prefix and trimming
        const trackedSubsInput = modal.querySelector('#setting-tracked-subs').value;
        const trackedSubreddits = trackedSubsInput
            .split(',')
            .map(s => s.trim().replace(/^r\/|^\/r\//i, '').toLowerCase())
            .filter(s => s.length > 0);

        const newSettings = {
            debugMode: modal.querySelector('#setting-debug').checked,
            minAge: parseInt(modal.querySelector('#setting-min-age').value),
            maxAge: parseInt(modal.querySelector('#setting-max-age').value),
            enableVeryLowConfidence: modal.querySelector('#setting-very-low-confidence').checked,
            titleSnippetLength: parseInt(modal.querySelector('#setting-title-length').value),
            bodySnippetLength: parseInt(modal.querySelector('#setting-body-length').value),
            cacheExpiration: parseInt(modal.querySelector('#setting-cache-days').value),
            modalWidth: parseInt(modal.querySelector('#setting-modal-width').value),
            modalHeight: parseInt(modal.querySelector('#setting-modal-height').value),
            showAgeEstimation: modal.querySelector('#setting-show-estimation').checked,
            defaultSort: modal.querySelector('#setting-sort-order').value,
            autoFilterPosted: modal.querySelector('#setting-auto-filter').checked,
            ignoredUsers: userSettings.ignoredUsers, // Keep existing
            trackedSubreddits: trackedSubreddits,
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

// ============================================================================
// DEEP ANALYSIS FUNCTIONS
// ============================================================================

function performDeepAnalysis(ageData, username) {
    const analysis = {
        username: username,
        totalPosts: ageData.results.length,
        postedAges: ageData.postedAges,
        possibleAges: ageData.possibleAges,
        timeline: [],
        backwardsAging: [],
        subredditComparison: {
            tracked: { ages: new Set(), posts: [] },
            other: { ages: new Set(), posts: [] }
        },
        ageExtremes: null,
        birthdayEstimate: null,
        couplesAnalysis: null,
        ageTransitions: [],
        recentAgeChange: null,
        consistencyScore: 0
    };

    // Build timeline from results (only posted ages)
    const timelinePoints = [];
    ageData.results.forEach(result => {
        if (result.postedAges && result.postedAges.length > 0) {
            result.postedAges.forEach(age => {
                timelinePoints.push({
                    timestamp: result.timestamp,
                    date: result.date,
                    age: age,
                    subreddit: result.subreddit.toLowerCase(),
                    permalink: result.permalink
                });
            });
        }
    });

    // Sort chronologically (oldest first)
    timelinePoints.sort((a, b) => a.timestamp - b.timestamp);
    analysis.timeline = timelinePoints;

    if (timelinePoints.length === 0) {
        return analysis;
    }

    // Detect backwards aging
    analysis.backwardsAging = detectBackwardsAging(timelinePoints);

    // Analyze subreddit behavior
    analysis.subredditComparison = analyzeSubredditBehavior(timelinePoints, userSettings.trackedSubreddits || []);

    // Calculate age extremes
    analysis.ageExtremes = calculateAgeExtremes(timelinePoints);

    // Detect age transitions
    analysis.ageTransitions = detectAgeTransitions(timelinePoints);

    // Check for recent age change
    analysis.recentAgeChange = detectRecentAgeChange(timelinePoints);

    // Enhanced couples detection
    analysis.couplesAnalysis = detectCouplesAccountEnhanced(timelinePoints);

    // Estimate birthday (only if not couples account or analyze primary track)
    if (!analysis.couplesAnalysis.isCouplesAccount) {
        analysis.birthdayEstimate = estimateBirthday(timelinePoints);
    } else {
        // Estimate for each track
        analysis.couplesAnalysis.tracks.forEach(track => {
            track.birthdayEstimate = estimateBirthday(track.points);
            track.currentAgeEstimate = estimateCurrentAgeFromPoints(track.points);
        });
    }

    // Calculate consistency score
    analysis.consistencyScore = calculateConsistencyScore(timelinePoints, analysis.backwardsAging);

    return analysis;
}

function detectBackwardsAging(timelinePoints) {
    const anomalies = [];

    for (let i = 1; i < timelinePoints.length; i++) {
        const prev = timelinePoints[i - 1];
        const curr = timelinePoints[i];

        // If current age is younger than previous, that's backwards aging
        if (curr.age < prev.age) {
            const daysBetween = (curr.timestamp - prev.timestamp) / (24 * 60 * 60);
            anomalies.push({
                fromAge: prev.age,
                toAge: curr.age,
                fromDate: prev.date,
                toDate: curr.date,
                fromTimestamp: prev.timestamp,
                toTimestamp: curr.timestamp,
                daysBetween: Math.round(daysBetween),
                fromSubreddit: prev.subreddit,
                toSubreddit: curr.subreddit,
                ageDrop: prev.age - curr.age,
                permalink: curr.permalink
            });
        }
    }

    return anomalies;
}

function analyzeSubredditBehavior(timelinePoints, trackedSubs) {
    const trackedLower = trackedSubs.map(s => s.toLowerCase());

    const result = {
        tracked: { ages: new Set(), posts: [], subreddits: new Set() },
        other: { ages: new Set(), posts: [], subreddits: new Set() },
        ageDiscrepancy: false,
        onlyOlderOnTracked: false,
        onlyYoungerOnTracked: false,
        trackedAgeRange: null,
        otherAgeRange: null
    };

    if (trackedLower.length === 0) {
        // No tracked subs configured
        timelinePoints.forEach(point => {
            result.other.ages.add(point.age);
            result.other.posts.push(point);
            result.other.subreddits.add(point.subreddit);
        });
        return result;
    }

    timelinePoints.forEach(point => {
        const isTracked = trackedLower.includes(point.subreddit);
        if (isTracked) {
            result.tracked.ages.add(point.age);
            result.tracked.posts.push(point);
            result.tracked.subreddits.add(point.subreddit);
        } else {
            result.other.ages.add(point.age);
            result.other.posts.push(point);
            result.other.subreddits.add(point.subreddit);
        }
    });

    // Convert Sets to arrays for comparison
    const trackedAges = Array.from(result.tracked.ages).sort((a, b) => a - b);
    const otherAges = Array.from(result.other.ages).sort((a, b) => a - b);

    if (trackedAges.length > 0) {
        result.trackedAgeRange = {
            min: Math.min(...trackedAges),
            max: Math.max(...trackedAges),
            ages: trackedAges
        };
    }

    if (otherAges.length > 0) {
        result.otherAgeRange = {
            min: Math.min(...otherAges),
            max: Math.max(...otherAges),
            ages: otherAges
        };
    }

    // Check for discrepancies
    if (trackedAges.length > 0 && otherAges.length > 0) {
        const trackedMin = Math.min(...trackedAges);
        const trackedMax = Math.max(...trackedAges);
        const otherMin = Math.min(...otherAges);
        const otherMax = Math.max(...otherAges);

        // Check if they're posting older on tracked subs
        if (trackedMin > otherMax) {
            result.onlyOlderOnTracked = true;
            result.ageDiscrepancy = true;
        }

        // Check if they're posting younger on tracked subs
        if (trackedMax < otherMin) {
            result.onlyYoungerOnTracked = true;
            result.ageDiscrepancy = true;
        }

        // General discrepancy - no overlap in ages
        const hasOverlap = trackedAges.some(age => otherAges.includes(age));
        if (!hasOverlap && (trackedMax < otherMin - 2 || trackedMin > otherMax + 2)) {
            result.ageDiscrepancy = true;
        }
    }

    return result;
}

function calculateAgeExtremes(timelinePoints) {
    if (timelinePoints.length === 0) return null;

    const ages = timelinePoints.map(p => p.age);
    const uniqueAges = [...new Set(ages)].sort((a, b) => a - b);

    const min = Math.min(...ages);
    const max = Math.max(...ages);
    const spread = max - min;

    // Calculate standard deviation
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    const variance = ages.reduce((sum, age) => sum + Math.pow(age - mean, 2), 0) / ages.length;
    const stdDev = Math.sqrt(variance);

    // Find first and last occurrence of each age
    const ageOccurrences = {};
    timelinePoints.forEach(point => {
        if (!ageOccurrences[point.age]) {
            ageOccurrences[point.age] = { first: point, last: point, count: 0 };
        }
        ageOccurrences[point.age].last = point;
        ageOccurrences[point.age].count++;
    });

    return {
        min,
        max,
        spread,
        mean: Math.round(mean * 10) / 10,
        stdDev: Math.round(stdDev * 100) / 100,
        uniqueAges,
        ageOccurrences,
        isExtreme: spread >= 5 // Flag if spread is 5+ years
    };
}

function detectAgeTransitions(timelinePoints) {
    const transitions = [];

    if (timelinePoints.length < 2) return transitions;

    let currentAge = timelinePoints[0].age;
    let currentAgeStart = timelinePoints[0];

    for (let i = 1; i < timelinePoints.length; i++) {
        if (timelinePoints[i].age !== currentAge) {
            transitions.push({
                fromAge: currentAge,
                toAge: timelinePoints[i].age,
                fromDate: currentAgeStart.date,
                toDate: timelinePoints[i].date,
                fromTimestamp: currentAgeStart.timestamp,
                toTimestamp: timelinePoints[i].timestamp,
                daysBetween: Math.round((timelinePoints[i].timestamp - currentAgeStart.timestamp) / (24 * 60 * 60)),
                direction: timelinePoints[i].age > currentAge ? 'increase' : 'decrease',
                change: timelinePoints[i].age - currentAge
            });
            currentAge = timelinePoints[i].age;
            currentAgeStart = timelinePoints[i];
        }
    }

    return transitions;
}

function detectRecentAgeChange(timelinePoints) {
    if (timelinePoints.length < 2) return null;

    const now = Date.now() / 1000;
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

    // Get recent posts
    const recentPosts = timelinePoints.filter(p => p.timestamp > ninetyDaysAgo);
    if (recentPosts.length < 2) return null;

    // Find if there was an age change in recent posts
    const recentAges = [...new Set(recentPosts.map(p => p.age))];
    if (recentAges.length === 1) return null;

    // Find the transition
    const sortedRecent = [...recentPosts].sort((a, b) => a.timestamp - b.timestamp);
    let lastChange = null;

    for (let i = 1; i < sortedRecent.length; i++) {
        if (sortedRecent[i].age !== sortedRecent[i-1].age) {
            lastChange = {
                fromAge: sortedRecent[i-1].age,
                toAge: sortedRecent[i].age,
                date: sortedRecent[i].date,
                timestamp: sortedRecent[i].timestamp,
                daysAgo: Math.round((now - sortedRecent[i].timestamp) / (24 * 60 * 60)),
                isVeryRecent: sortedRecent[i].timestamp > thirtyDaysAgo
            };
        }
    }

    return lastChange;
}

function detectCouplesAccountEnhanced(timelinePoints) {
    const result = {
        isCouplesAccount: false,
        confidence: 'None',
        tracks: [],
        interleaveRatio: 0,
        ageGapConsistency: 0,
        explanation: '',
        detectionMethod: null
    };

    if (timelinePoints.length < 4) {
        result.explanation = 'Not enough data points to detect couples account (need at least 4)';
        return result;
    }

    // Group ages into clusters (within 4 years of each other)
    const clusters = [];
    timelinePoints.forEach((point, idx) => {
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

    // Need exactly 2 clusters (can be small if age gap is significant)
    const substantialClusters = clusters.filter(c => c.length >= 2);
    if (substantialClusters.length !== 2) {
        result.explanation = `Found ${substantialClusters.length} age clusters (need exactly 2 for couples detection)`;
        return result;
    }

    const cluster1 = substantialClusters[0];
    const cluster2 = substantialClusters[1];

    // Calculate basic cluster stats
    const track1Ages = cluster1.map(p => p.age);
    const track2Ages = cluster2.map(p => p.age);
    const track1Avg = track1Ages.reduce((a, b) => a + b, 0) / track1Ages.length;
    const track2Avg = track2Ages.reduce((a, b) => a + b, 0) / track2Ages.length;
    const avgAgeGap = Math.abs(track1Avg - track2Avg);

    // If age gap is less than 10 years, unlikely to be couples (could just be inconsistent posting)
    if (avgAgeGap < 10) {
        result.explanation = `Age gap between clusters (${avgAgeGap.toFixed(1)} years) too small for couples detection`;
        return result;
    }

    // Calculate interleave score (original method)
    const cluster1Indices = new Set(cluster1.map(p => p.originalIndex));
    let interleaveScore = 0;
    for (let i = 0; i < timelinePoints.length - 1; i++) {
        const isInCluster1 = cluster1Indices.has(i);
        const nextIsInCluster1 = cluster1Indices.has(i + 1);
        if (isInCluster1 !== nextIsInCluster1) {
            interleaveScore++;
        }
    }
    result.interleaveRatio = interleaveScore / (timelinePoints.length - 1);

    // NEW METHOD: Check if both clusters age appropriately over time
    // This catches couples where one person posts rarely
    const ageProgressionAnalysis = analyzeClusterAgeProgression(cluster1, cluster2);
    result.ageGapConsistency = ageProgressionAnalysis.gapConsistency;

    // Determine if this is a couples account using multiple signals
    let couplesScore = 0;
    let detectionReasons = [];

    // Signal 1: High interleave ratio (alternating posts)
    if (result.interleaveRatio >= 0.35) {
        couplesScore += 40;
        detectionReasons.push(`alternating posts (${(result.interleaveRatio * 100).toFixed(0)}% interleave)`);
    } else if (result.interleaveRatio >= 0.20) {
        couplesScore += 20;
        detectionReasons.push(`some alternation (${(result.interleaveRatio * 100).toFixed(0)}% interleave)`);
    }

    // Signal 2: Large, consistent age gap
    if (avgAgeGap >= 15) {
        couplesScore += 25;
        detectionReasons.push(`large age gap (${avgAgeGap.toFixed(0)} years)`);
    } else if (avgAgeGap >= 10) {
        couplesScore += 15;
        detectionReasons.push(`significant age gap (${avgAgeGap.toFixed(0)} years)`);
    }

    // Signal 3: Both clusters show appropriate age progression
    if (ageProgressionAnalysis.bothProgress) {
        couplesScore += 35;
        detectionReasons.push('both ages progress over time');
    } else if (ageProgressionAnalysis.oneProgresses) {
        couplesScore += 15;
        detectionReasons.push('one age track progresses');
    }

    // Signal 4: Age gap remains consistent over time
    if (ageProgressionAnalysis.gapConsistency >= 0.8) {
        couplesScore += 25;
        detectionReasons.push(`consistent gap (${(ageProgressionAnalysis.gapConsistency * 100).toFixed(0)}%)`);
    } else if (ageProgressionAnalysis.gapConsistency >= 0.6) {
        couplesScore += 15;
        detectionReasons.push(`fairly consistent gap (${(ageProgressionAnalysis.gapConsistency * 100).toFixed(0)}%)`);
    }

    // Signal 5: Multiple data points in each cluster
    const minClusterSize = Math.min(cluster1.length, cluster2.length);
    const totalPoints = cluster1.length + cluster2.length;
    if (minClusterSize >= 3 && totalPoints >= 8) {
        couplesScore += 15;
        detectionReasons.push(`good data coverage (${totalPoints} points)`);
    } else if (minClusterSize >= 2 && totalPoints >= 5) {
        couplesScore += 10;
        detectionReasons.push(`adequate data (${totalPoints} points)`);
    }

    // Determine if couples account based on score
    if (couplesScore >= 50) {
        result.isCouplesAccount = true;

        // Determine confidence
        if (couplesScore >= 90) {
            result.confidence = 'High';
        } else if (couplesScore >= 70) {
            result.confidence = 'Medium';
        } else {
            result.confidence = 'Low';
        }

        result.detectionMethod = detectionReasons.join(', ');

        // Build track information
        result.tracks = [
            {
                name: 'Person A',
                points: cluster1.sort((a, b) => a.timestamp - b.timestamp),
                ageRange: {
                    min: Math.min(...track1Ages),
                    max: Math.max(...track1Ages)
                },
                postCount: cluster1.length,
                ageProgression: ageProgressionAnalysis.track1Progression
            },
            {
                name: 'Person B',
                points: cluster2.sort((a, b) => a.timestamp - b.timestamp),
                ageRange: {
                    min: Math.min(...track2Ages),
                    max: Math.max(...track2Ages)
                },
                postCount: cluster2.length,
                ageProgression: ageProgressionAnalysis.track2Progression
            }
        ];

        // Sort tracks so older person is first
        result.tracks.sort((a, b) => b.ageRange.max - a.ageRange.max);
        result.tracks[0].name = 'Person A (older)';
        result.tracks[1].name = 'Person B (younger)';

        result.explanation = `Couples account detected: ${detectionReasons.join(', ')}`;
    } else {
        result.explanation = `Couples score ${couplesScore}/100 (need 50+). Signals: ${detectionReasons.length > 0 ? detectionReasons.join(', ') : 'none detected'}`;
    }

    logDebug('Couples detection:', {
        couplesScore,
        avgAgeGap,
        interleaveRatio: result.interleaveRatio,
        gapConsistency: ageProgressionAnalysis.gapConsistency,
        bothProgress: ageProgressionAnalysis.bothProgress,
        detectionReasons
    });

    return result;
}

function analyzeClusterAgeProgression(cluster1, cluster2) {
    const result = {
        track1Progression: null,
        track2Progression: null,
        bothProgress: false,
        oneProgresses: false,
        gapConsistency: 0
    };

    // Sort each cluster by timestamp
    const sorted1 = [...cluster1].sort((a, b) => a.timestamp - b.timestamp);
    const sorted2 = [...cluster2].sort((a, b) => a.timestamp - b.timestamp);

    // Analyze track 1 progression
    result.track1Progression = analyzeTrackProgression(sorted1);

    // Analyze track 2 progression
    result.track2Progression = analyzeTrackProgression(sorted2);

    // Check if both progress appropriately
    const track1Good = result.track1Progression.isReasonable;
    const track2Good = result.track2Progression.isReasonable;

    result.bothProgress = track1Good && track2Good;
    result.oneProgresses = track1Good || track2Good;

    // Calculate age gap consistency over time
    // Find overlapping time periods and compare gaps
    result.gapConsistency = calculateGapConsistency(sorted1, sorted2);

    return result;
}

function analyzeTrackProgression(sortedPoints) {
    if (sortedPoints.length < 2) {
        return {
            isReasonable: true, // Single point can't be unreasonable
            ageChange: 0,
            timeSpanYears: 0,
            ratePerYear: 0
        };
    }

    const first = sortedPoints[0];
    const last = sortedPoints[sortedPoints.length - 1];

    const ageChange = last.age - first.age;
    const timeSpanYears = (last.timestamp - first.timestamp) / (365.25 * 24 * 60 * 60);
    const ratePerYear = timeSpanYears > 0 ? ageChange / timeSpanYears : 0;

    // Check for reasonable progression
    // Reasonable: ages increase at roughly 1 year per calendar year (0.5 to 1.5 is acceptable)
    // Also acceptable: no change over short periods
    let isReasonable = false;

    if (timeSpanYears < 0.5) {
        // Short time span - any small change is fine
        isReasonable = Math.abs(ageChange) <= 1;
    } else if (ageChange >= 0) {
        // Age increased or stayed same - check rate
        isReasonable = ratePerYear >= 0.5 && ratePerYear <= 1.8;
    } else {
        // Age decreased - not reasonable for a single person
        isReasonable = false;
    }

    // Also check intermediate points for consistency
    let hasBackwardsAging = false;
    for (let i = 1; i < sortedPoints.length; i++) {
        if (sortedPoints[i].age < sortedPoints[i-1].age) {
            hasBackwardsAging = true;
            break;
        }
    }

    if (hasBackwardsAging) {
        isReasonable = false;
    }

    return {
        isReasonable,
        ageChange,
        timeSpanYears: Math.round(timeSpanYears * 10) / 10,
        ratePerYear: Math.round(ratePerYear * 100) / 100
    };
}

function calculateGapConsistency(sorted1, sorted2) {
    // Find time windows where we have data from both clusters
    // and check if the age gap is consistent

    if (sorted1.length === 0 || sorted2.length === 0) {
        return 0;
    }

    // Get time range overlap
    const start1 = sorted1[0].timestamp;
    const end1 = sorted1[sorted1.length - 1].timestamp;
    const start2 = sorted2[0].timestamp;
    const end2 = sorted2[sorted2.length - 1].timestamp;

    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);

    // If no overlap, use the full range and extrapolate
    // Calculate expected gap based on earliest known ages
    const earliest1 = sorted1[0];
    const earliest2 = sorted2[0];
    const latest1 = sorted1[sorted1.length - 1];
    const latest2 = sorted2[sorted2.length - 1];

    // Calculate gaps at different points
    const gaps = [];

    // Gap at earliest point (using whichever came first, projecting the other)
    const earliestGap = Math.abs(earliest1.age - earliest2.age);
    gaps.push(earliestGap);

    // Gap at latest point
    const latestGap = Math.abs(latest1.age - latest2.age);
    gaps.push(latestGap);

    // If we have intermediate points close in time, use those too
    for (let p1 of sorted1) {
        for (let p2 of sorted2) {
            const timeDiff = Math.abs(p1.timestamp - p2.timestamp);
            // Within 90 days of each other
            if (timeDiff < 90 * 24 * 60 * 60) {
                gaps.push(Math.abs(p1.age - p2.age));
            }
        }
    }

    if (gaps.length < 2) {
        // Not enough data points to assess consistency
        // If we have a large gap, give it the benefit of the doubt
        return earliestGap >= 10 ? 0.7 : 0.5;
    }

    // Calculate consistency as 1 - (stddev / mean)
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);

    // Consistency score: 1.0 = perfectly consistent, 0.0 = highly inconsistent
    // Allow for ~2 year variance as normal (people might round ages, birthdays, etc.)
    const consistency = Math.max(0, 1 - (stdDev / Math.max(mean, 1)));

    return Math.round(consistency * 100) / 100;
}

function estimateBirthday(timelinePoints) {
    if (timelinePoints.length < 2) {
        return { confidence: 'None', reason: 'Insufficient data' };
    }

    // Find age transitions that look like birthdays (age increases by 1)
    const birthdayTransitions = [];

    // Sort by timestamp
    const sorted = [...timelinePoints].sort((a, b) => a.timestamp - b.timestamp);

    // Track age spans
    const ageSpans = {};
    let currentAge = sorted[0].age;
    let ageStart = sorted[0].timestamp;

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].age !== currentAge) {
            // Record the span for the previous age
            if (!ageSpans[currentAge]) {
                ageSpans[currentAge] = [];
            }
            ageSpans[currentAge].push({
                start: ageStart,
                end: sorted[i - 1].timestamp,
                duration: sorted[i - 1].timestamp - ageStart
            });

            // Check if this is a +1 transition
            if (sorted[i].age === currentAge + 1) {
                birthdayTransitions.push({
                    age: sorted[i].age,
                    timestamp: sorted[i].timestamp,
                    prevEnd: sorted[i - 1].timestamp,
                    gap: sorted[i].timestamp - sorted[i - 1].timestamp
                });
            }

            currentAge = sorted[i].age;
            ageStart = sorted[i].timestamp;
        }
    }

    // Record final span
    if (!ageSpans[currentAge]) {
        ageSpans[currentAge] = [];
    }
    ageSpans[currentAge].push({
        start: ageStart,
        end: sorted[sorted.length - 1].timestamp,
        duration: sorted[sorted.length - 1].timestamp - ageStart
    });

    // Analyze birthday transitions
    if (birthdayTransitions.length === 0) {
        // Try to estimate from account age and posting patterns
        return estimateBirthdayFromPatterns(sorted, ageSpans);
    }

    // Calculate estimated birthday months from transitions
    const birthdayMonths = birthdayTransitions.map(t => {
        // Birthday likely occurred between prevEnd and timestamp
        // Weight towards the transition timestamp
        const midpoint = t.prevEnd + (t.gap * 0.3); // Assume birthday is 30% into the gap
        const date = new Date(midpoint * 1000);
        return {
            month: date.getMonth(),
            year: date.getFullYear(),
            confidence: t.gap < (30 * 24 * 60 * 60) ? 'High' : // Gap < 30 days
                        t.gap < (90 * 24 * 60 * 60) ? 'Medium' : 'Low' // Gap < 90 days
        };
    });

    if (birthdayMonths.length === 1) {
        return formatBirthdayEstimate(birthdayMonths[0].month, birthdayMonths[0].confidence);
    }

    // Multiple transitions - find consensus
    const monthCounts = {};
    birthdayMonths.forEach(bm => {
        // Count this month and adjacent months
        for (let offset = -1; offset <= 1; offset++) {
            const m = (bm.month + offset + 12) % 12;
            monthCounts[m] = (monthCounts[m] || 0) + (offset === 0 ? 2 : 1);
        }
    });

    // Find peak month(s)
    const maxCount = Math.max(...Object.values(monthCounts));
    const peakMonths = Object.keys(monthCounts)
        .filter(m => monthCounts[m] >= maxCount - 1)
        .map(m => parseInt(m))
        .sort((a, b) => a - b);

    // Determine confidence based on consistency
    let confidence;
    if (peakMonths.length === 1 && birthdayMonths.length >= 2) {
        confidence = 'High';
    } else if (peakMonths.length <= 2) {
        confidence = 'Medium';
    } else if (peakMonths.length <= 4) {
        confidence = 'Low';
    } else {
        confidence = 'Very Low';
    }

    return formatBirthdayEstimate(peakMonths, confidence, birthdayTransitions.length);
}

function estimateBirthdayFromPatterns(sorted, ageSpans) {
    // If we have long stretches at consistent ages, we can estimate
    // based on when they would have turned that age

    const longestSpans = [];
    Object.keys(ageSpans).forEach(age => {
        const totalDuration = ageSpans[age].reduce((sum, span) => sum + span.duration, 0);
        const latestEnd = Math.max(...ageSpans[age].map(s => s.end));
        longestSpans.push({
            age: parseInt(age),
            totalDuration,
            latestEnd
        });
    });

    // Sort by duration
    longestSpans.sort((a, b) => b.totalDuration - a.totalDuration);

    if (longestSpans.length > 0 && longestSpans[0].totalDuration > 180 * 24 * 60 * 60) {
        // At least 6 months of data at one age
        // Birthday would be within a year after latestEnd minus age years
        return {
            confidence: 'Very Low',
            reason: 'Estimated from posting duration patterns',
            estimatedRange: 'Unable to determine specific month range'
        };
    }

    return {
        confidence: 'None',
        reason: 'No clear birthday pattern detected'
    };
}

function formatBirthdayEstimate(monthData, confidence, transitionCount = 1) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    if (Array.isArray(monthData)) {
        // Multiple months
        if (monthData.length === 1) {
            return {
                confidence,
                month: monthNames[monthData[0]],
                range: monthNames[monthData[0]],
                transitionCount
            };
        } else if (monthData.length === 2) {
            // Check if adjacent
            const diff = Math.abs(monthData[0] - monthData[1]);
            if (diff === 1 || diff === 11) {
                return {
                    confidence,
                    range: `${monthNames[monthData[0]]} - ${monthNames[monthData[1]]}`,
                    transitionCount
                };
            }
        }
        // Non-adjacent or multiple months
        const start = Math.min(...monthData);
        const end = Math.max(...monthData);
        return {
            confidence,
            range: `${monthNames[start]} - ${monthNames[end]}`,
            transitionCount
        };
    } else {
        // Single month
        return {
            confidence,
            month: monthNames[monthData],
            range: monthNames[monthData],
            transitionCount
        };
    }
}

function estimateCurrentAgeFromPoints(points) {
    if (points.length === 0) return null;

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const latest = sorted[sorted.length - 1];
    const now = Date.now() / 1000;
    const yearsSince = (now - latest.timestamp) / (365.25 * 24 * 60 * 60);

    // Simple projection from latest known age
    const estimated = latest.age + yearsSince;
    return Math.round(estimated * 2) / 2; // Round to 0.5
}

function calculateConsistencyScore(timelinePoints, backwardsAging) {
    if (timelinePoints.length < 2) return 100;

    let score = 100;

    // Penalize for backwards aging
    score -= backwardsAging.length * 15;

    // Check for reasonable progression
    const sorted = [...timelinePoints].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
        const timeDiff = (sorted[i].timestamp - sorted[i-1].timestamp) / (365.25 * 24 * 60 * 60);
        const ageDiff = sorted[i].age - sorted[i-1].age;

        if (timeDiff > 0) {
            const rate = ageDiff / timeDiff;
            // Penalize for unrealistic aging rates
            if (rate > 2) score -= 10;
            if (rate < -0.5) score -= 15;
        }
    }

    // Calculate age spread penalty
    const ages = timelinePoints.map(p => p.age);
    const spread = Math.max(...ages) - Math.min(...ages);
    if (spread > 5) score -= (spread - 5) * 5;

    return Math.max(0, Math.min(100, score));
}

// ============================================================================
// PAGINATION SUPPORT
// ============================================================================

function searchUserAgesWithPagination(username, beforeTimestamp = null, limit = 250) {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const searchQuery = buildAgeSearchQuery();

        const params = new URLSearchParams();
        params.append('author', username);
        params.append('exact_author', 'true');
        params.append('html_decode', 'True');
        params.append('q', searchQuery);
        params.append('size', limit.toString());
        params.append('sort', 'created_utc');
        params.append('order', 'desc'); // Newest first, so we can paginate backwards

        if (beforeTimestamp) {
            params.append('before', beforeTimestamp.toString());
        }

        const url = `${PUSHSHIFT_API_BASE}/reddit/search/submission/?${params}`;

        logDebug('PushShift pagination request:', { username, beforeTimestamp, limit });

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            onload: function(response) {
                if (response.status === 401 || response.status === 403) {
                    clearToken();
                    reject(new Error('Token expired or invalid'));
                    return;
                }

                if (response.status !== 200) {
                    reject(new Error(`PushShift API error: ${response.status}`));
                    return;
                }

                try {
                    const data = JSON.parse(response.responseText);
                    const results = data.data || [];
                    logDebug(`Pagination returned ${results.length} results`);
                    resolve(results);
                } catch (error) {
                    reject(new Error('Failed to parse API response'));
                }
            },
            onerror: function() {
                reject(new Error('Network error'));
            },
            ontimeout: function() {
                reject(new Error('Request timed out'));
            }
        });
    });
}

// ============================================================================
// AGE HIGHLIGHTING
// ============================================================================

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
    modal.style.width = `${userSettings.modalWidth}px`;
    modal.style.height = `${userSettings.modalHeight}px`;
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

                let couplesNote = '';
                if (ageEstimate.couplesAccount) {
                    couplesNote = '<br><span style="color: #ff8c42; font-size: 11px;">👥 Couples/Shared Account Detected - see Deep Analysis for details</span>';
                }

                estimateHTML = `<p style="margin-top: 8px; padding-top: 4px; border-top: 1px solid #343536;">
                    <strong>Estimated Current Age:</strong>
                    <span style="color: ${confidenceColor}; font-weight: bold; font-size: 16px;">${ageEstimate.estimatedAge}</span>
                    <span style="color: #818384; font-size: 12px;"> (${ageEstimate.confidence} Confidence)</span>
                    ${ageEstimate.couplesAccount ? '<span style="color: #ff8c42; font-size: 12px;"> 👥 Couples Account</span>' : ''}
                    <br>
                    <span style="color: #818384; font-size: 11px;">Based on ${ageEstimate.dataPoints} data point${ageEstimate.dataPoints > 1 ? 's' : ''} spanning ${ageEstimate.yearSpan} year${ageEstimate.yearSpan !== 1 ? 's' : ''}</span>
                    ${anomalyNote}
                    ${couplesNote}
                </p>`;
            }
        }

        summaryHTML = `<div class="age-summary">
            <div class="age-summary-title"><b>Found Ages: ${postedRangeText}</b> (Total posts with age mentions: ${results.length})</div>
            <p>Posted ages found: ${postedAges.length > 0 ? postedAges.join(', ') : 'None'}</p>
            <p>Possible ages found: ${possibleAges.length > 0 ? possibleAges.join(', ') : 'None'}</p>
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
                ? `<span class="expand-link" data-target="title-${index}">... [ Expand ]</span>`
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
                    ? `<span class="expand-link" data-target="body-${index}">... [ Expand ]</span>`
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
            <button class="age-modal-button deep-analysis">Deep Analysis</button>
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
    const deepAnalysisBtn = modal.querySelector('.deep-analysis');
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

    deepAnalysisBtn.onclick = () => {
        const analysis = performDeepAnalysis(ageData, username);
        showDeepAnalysisModal(username, ageData, analysis);
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

function showDeepAnalysisModal(username, ageData, analysis) {
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.minWidth = '700px';
    modal.style.width = '900px';
    modal.style.height = '85vh';
    modal.style.zIndex = ++zIndexCounter;

    // Store analysis data for pagination
    modal.dataset.username = username;

    // Build section content
    const overviewHTML = buildOverviewSection(analysis);
    const timelineHTML = buildTimelineSection(analysis);
    const anomaliesHTML = buildAnomaliesSection(analysis);
    const subredditHTML = buildSubredditSection(analysis);
    const birthdayHTML = buildBirthdaySection(analysis);
    const couplesHTML = buildCouplesSection(analysis);

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Deep Analysis: u/${username}</div>
                <div style="display: flex; align-items: center;">
                    <button class="age-settings-gear" title="Settings">⚙</button>
                    <button class="age-modal-close">&times;</button>
                </div>
            </div>
        </div>
        <div class="age-modal-content">
            ${overviewHTML}
            ${anomaliesHTML}
            ${subredditHTML}
            ${birthdayHTML}
            ${couplesHTML}
            ${timelineHTML}

            <div class="fetch-more-container">
                <div class="fetch-more-status">
                    Currently showing ${analysis.totalPosts} posts with age mentions.
                    ${analysis.timeline.length > 0 ?
                        `Oldest post: ${new Date(analysis.timeline[0].timestamp * 1000).toLocaleDateString()}` : ''}
                </div>
            </div>
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="fetch-more-data">Fetch More Data (250 posts)</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username, ageData, analysis });

    // Event handlers
    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-button.secondary');
    const settingsBtn = modal.querySelector('.age-settings-gear');
    const fetchMoreBtn = modal.querySelector('#fetch-more-data');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        showSettingsModal();
    };

    // Collapsible sections
    modal.querySelectorAll('.deep-analysis-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.deep-analysis-toggle');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▶ Show' : '▼ Hide';
        });
    });

    // Fetch more data handler
    fetchMoreBtn.onclick = async () => {
        const modalInfo = resultsModals.find(m => m.modalId === modalId);
        if (!modalInfo) return;

        fetchMoreBtn.disabled = true;
        fetchMoreBtn.textContent = 'Fetching...';

        try {
            // Get earliest timestamp from current data
            const earliestTimestamp = modalInfo.analysis.timeline.length > 0 ?
                Math.min(...modalInfo.analysis.timeline.map(p => p.timestamp)) :
                null;

            const newResults = await searchUserAgesWithPagination(username, earliestTimestamp, 250);

            if (newResults.length === 0) {
                fetchMoreBtn.textContent = 'No More Data Available';
                return;
            }

            // Process new results and merge
            const newAgeData = processResults(newResults, username);

            // Merge with existing data
            const mergedResults = [...modalInfo.ageData.results];
            newAgeData.results.forEach(newResult => {
                // Check for duplicates by permalink
                if (!mergedResults.some(r => r.permalink === newResult.permalink)) {
                    mergedResults.push(newResult);
                }
            });

            // Update age sets
            const mergedPostedAges = new Set([...modalInfo.ageData.postedAges, ...newAgeData.postedAges]);
            const mergedPossibleAges = new Set([...modalInfo.ageData.possibleAges, ...newAgeData.possibleAges]);

            const mergedAgeData = {
                postedAges: Array.from(mergedPostedAges).sort((a, b) => a - b),
                possibleAges: Array.from(mergedPossibleAges).sort((a, b) => a - b),
                results: mergedResults
            };

            // Update cache
            setCachedAgeData(username, mergedAgeData);

            // Re-run analysis
            const newAnalysis = performDeepAnalysis(mergedAgeData, username);

            // Update modal info
            modalInfo.ageData = mergedAgeData;
            modalInfo.analysis = newAnalysis;

            // Refresh modal content
            const content = modal.querySelector('.age-modal-content');
            content.innerHTML = `
                ${buildOverviewSection(newAnalysis)}
                ${buildAnomaliesSection(newAnalysis)}
                ${buildSubredditSection(newAnalysis)}
                ${buildBirthdaySection(newAnalysis)}
                ${buildCouplesSection(newAnalysis)}
                ${buildTimelineSection(newAnalysis)}

                <div class="fetch-more-container">
                    <div class="fetch-more-status">
                        Currently showing ${newAnalysis.totalPosts} posts with age mentions.
                        ${newAnalysis.timeline.length > 0 ?
                            `Oldest post: ${new Date(newAnalysis.timeline[0].timestamp * 1000).toLocaleDateString()}` : ''}
                    </div>
                </div>
            `;

            // Reset button state
            fetchMoreBtn.disabled = false;
            fetchMoreBtn.textContent = 'Fetch More Data (250 posts)';

            // Re-attach event handlers for collapsible sections
            attachDeepAnalysisHandlers(modal, modalId, username);

        } catch (error) {
            console.error('Fetch more error:', error);
            fetchMoreBtn.textContent = `Error: ${error.message}`;
        }
    };
}

function attachDeepAnalysisHandlers(modal, modalId, username) {
    // Collapsible sections
    modal.querySelectorAll('.deep-analysis-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.deep-analysis-toggle');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▶ Show' : '▼ Hide';
        });
    });

    // Fetch more button
    const fetchMoreBtn = modal.querySelector('#fetch-more-data');
    if (fetchMoreBtn) {
        fetchMoreBtn.onclick = async () => {
            const modalInfo = resultsModals.find(m => m.modalId === modalId);
            if (!modalInfo) return;

            fetchMoreBtn.disabled = true;
            fetchMoreBtn.textContent = 'Fetching...';

            try {
                const earliestTimestamp = modalInfo.analysis.timeline.length > 0 ?
                    Math.min(...modalInfo.analysis.timeline.map(p => p.timestamp)) :
                    null;

                const newResults = await searchUserAgesWithPagination(username, earliestTimestamp, 250);

                if (newResults.length === 0) {
                    fetchMoreBtn.textContent = 'No More Data Available';
                    return;
                }

                const newAgeData = processResults(newResults, username);

                const mergedResults = [...modalInfo.ageData.results];
                newAgeData.results.forEach(newResult => {
                    if (!mergedResults.some(r => r.permalink === newResult.permalink)) {
                        mergedResults.push(newResult);
                    }
                });

                const mergedPostedAges = new Set([...modalInfo.ageData.postedAges, ...newAgeData.postedAges]);
                const mergedPossibleAges = new Set([...modalInfo.ageData.possibleAges, ...newAgeData.possibleAges]);

                const mergedAgeData = {
                    postedAges: Array.from(mergedPostedAges).sort((a, b) => a - b),
                    possibleAges: Array.from(mergedPossibleAges).sort((a, b) => a - b),
                    results: mergedResults
                };

                setCachedAgeData(username, mergedAgeData);

                const newAnalysis = performDeepAnalysis(mergedAgeData, username);

                modalInfo.ageData = mergedAgeData;
                modalInfo.analysis = newAnalysis;

                const content = modal.querySelector('.age-modal-content');
                content.innerHTML = `
                    ${buildOverviewSection(newAnalysis)}
                    ${buildAnomaliesSection(newAnalysis)}
                    ${buildSubredditSection(newAnalysis)}
                    ${buildBirthdaySection(newAnalysis)}
                    ${buildCouplesSection(newAnalysis)}
                    ${buildTimelineSection(newAnalysis)}

                    <div class="fetch-more-container">
                        <div class="fetch-more-status">
                            Currently showing ${newAnalysis.totalPosts} posts with age mentions.
                            ${newAnalysis.timeline.length > 0 ?
                                `Oldest post: ${new Date(newAnalysis.timeline[0].timestamp * 1000).toLocaleDateString()}` : ''}
                        </div>
                    </div>
                `;

                // Reset button state
                fetchMoreBtn.disabled = false;
                fetchMoreBtn.textContent = 'Fetch More Data (250 posts)';

                attachDeepAnalysisHandlers(modal, modalId, username);

            } catch (error) {
                console.error('Fetch more error:', error);
                fetchMoreBtn.textContent = `Error: ${error.message}`;
            }
        };
    }
}

function buildOverviewSection(analysis) {
    const extremes = analysis.ageExtremes;
    const consistency = analysis.consistencyScore;

    let consistencyClass = 'success';
    if (consistency < 50) consistencyClass = 'danger';
    else if (consistency < 75) consistencyClass = 'warning';

    let extremeWarning = '';
    if (extremes && extremes.isExtreme) {
        extremeWarning = `<div class="analysis-stat-row">
            <span class="analysis-stat-label">⚠ Age Spread Warning</span>
            <span class="analysis-stat-value danger">${extremes.spread} year spread detected</span>
        </div>`;
    }

    // Recent age change
    let recentChangeHTML = '';
    if (analysis.recentAgeChange) {
        const rc = analysis.recentAgeChange;
        const changeClass = rc.isVeryRecent ? 'warning' : 'info';
        recentChangeHTML = `<div class="analysis-stat-row">
            <span class="analysis-stat-label">Recent Age Change</span>
            <span class="analysis-stat-value ${changeClass}">
                ${rc.fromAge} → ${rc.toAge} (${rc.daysAgo} days ago)${rc.isVeryRecent ? ' ⚠ Very Recent!' : ''}
            </span>
        </div>`;
    }

    // Couples account indicator
    let couplesIndicator = '';
    if (analysis.couplesAnalysis && analysis.couplesAnalysis.isCouplesAccount) {
        couplesIndicator = `<div class="analysis-stat-row">
            <span class="analysis-stat-label">Account Type</span>
            <span class="analysis-stat-value warning">Likely Couples/Shared Account (${analysis.couplesAnalysis.confidence} confidence)</span>
        </div>`;
    }

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📊 Overview</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Posts with Age Mentions</span>
                    <span class="analysis-stat-value">${analysis.totalPosts}</span>
                </div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Posted Ages (in brackets)</span>
                    <span class="analysis-stat-value">${analysis.postedAges.length > 0 ? analysis.postedAges.join(', ') : 'None'}</span>
                </div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Possible Ages (not bracketed)</span>
                    <span class="analysis-stat-value">${analysis.possibleAges.length > 0 ? analysis.possibleAges.join(', ') : 'None'}</span>
                </div>
                ${extremes ? `
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Age Range</span>
                    <span class="analysis-stat-value">${extremes.min} - ${extremes.max} (spread: ${extremes.spread})</span>
                </div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Mean Age / Std Dev</span>
                    <span class="analysis-stat-value">${extremes.mean} / ±${extremes.stdDev}</span>
                </div>
                ` : ''}
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Consistency Score</span>
                    <span class="analysis-stat-value ${consistencyClass}">${consistency}/100</span>
                </div>
                ${extremeWarning}
                ${recentChangeHTML}
                ${couplesIndicator}
            </div>
        </div>
    `;
}

function buildAnomaliesSection(analysis) {
    const backwardsAging = analysis.backwardsAging;

    if (backwardsAging.length === 0) {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">⚠️ Anomalies & Backwards Aging</span>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: #46d160;">✓ No backwards aging detected. User ages chronologically.</p>
                </div>
            </div>
        `;
    }

    const anomaliesHTML = backwardsAging.map(a => `
        <div class="anomaly-item">
            <div class="anomaly-description">
                Age dropped from <strong>${a.fromAge}</strong> to <strong>${a.toAge}</strong>
                (${a.ageDrop} year${a.ageDrop !== 1 ? 's' : ''} younger)
            </div>
            <div class="anomaly-date">
                ${a.fromDate} (r/${a.fromSubreddit}) → ${a.toDate} (r/${a.toSubreddit})
                <br>${a.daysBetween} days between posts
                <a href="${a.permalink}" target="_blank" style="margin-left: 10px; color: #0079d3;">View Post →</a>
            </div>
        </div>
    `).join('');

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">⚠️ Anomalies & Backwards Aging (${backwardsAging.length} found)</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                <p style="color: #ff6b6b; margin-bottom: 15px;">
                    User posted as a younger age AFTER claiming to be older. This could indicate age falsification or a couples account.
                </p>
                ${anomaliesHTML}
            </div>
        </div>
    `;
}

function buildSubredditSection(analysis) {
    const comparison = analysis.subredditComparison;
    const trackedSubs = userSettings.trackedSubreddits || [];

    if (trackedSubs.length === 0) {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">🔍 Subreddit Age Comparison</span>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: #818384;">No tracked subreddits configured. Add subreddits in Settings to compare age behavior.</p>
                </div>
            </div>
        `;
    }

    let warningHTML = '';
    if (comparison.ageDiscrepancy) {
        if (comparison.onlyOlderOnTracked) {
            warningHTML = `<p style="color: #ff6b6b; font-weight: bold; margin-bottom: 15px;">
                ⚠️ USER POSTS OLDER AGES ON YOUR SUBREDDITS!
                <br>Posts as ${comparison.trackedAgeRange.ages.join(', ')} on tracked subs, but ${comparison.otherAgeRange.ages.join(', ')} elsewhere.
            </p>`;
        } else if (comparison.onlyYoungerOnTracked) {
            warningHTML = `<p style="color: #ff8c42; margin-bottom: 15px;">
                ⚠️ User posts younger ages on your subreddits.
                <br>Posts as ${comparison.trackedAgeRange.ages.join(', ')} on tracked subs, but ${comparison.otherAgeRange.ages.join(', ')} elsewhere.
            </p>`;
        } else {
            warningHTML = `<p style="color: #ff8c42; margin-bottom: 15px;">
                ⚠️ Age discrepancy detected between tracked and other subreddits.
            </p>`;
        }
    }

    const trackedSubsList = Array.from(comparison.tracked.subreddits).map(s => `r/${s}`).join(', ') || 'None';
    const otherSubsList = Array.from(comparison.other.subreddits).slice(0, 10).map(s => `r/${s}`).join(', ') || 'None';

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">🔍 Subreddit Age Comparison</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${warningHTML}
                <table class="subreddit-comparison-table">
                    <tr>
                        <th>Category</th>
                        <th>Ages Posted</th>
                        <th>Post Count</th>
                        <th>Subreddits</th>
                    </tr>
                    <tr>
                        <td><strong>Your Tracked Subs</strong></td>
                        <td>${comparison.trackedAgeRange ? comparison.trackedAgeRange.ages.join(', ') : 'N/A'}</td>
                        <td>${comparison.tracked.posts.length}</td>
                        <td style="font-size: 11px;">${trackedSubsList}</td>
                    </tr>
                    <tr>
                        <td><strong>Other Subreddits</strong></td>
                        <td>${comparison.otherAgeRange ? comparison.otherAgeRange.ages.join(', ') : 'N/A'}</td>
                        <td>${comparison.other.posts.length}</td>
                        <td style="font-size: 11px;">${otherSubsList}${comparison.other.subreddits.size > 10 ? '...' : ''}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;
}

function buildBirthdaySection(analysis) {
    const birthday = analysis.birthdayEstimate;

    if (!birthday || birthday.confidence === 'None') {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">🎂 Birthday Estimate</span>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: #818384;">
                        ${birthday && birthday.reason ? birthday.reason : 'Unable to estimate birthday from available data.'}
                    </p>
                    <p style="color: #818384; font-size: 12px; margin-top: 10px;">
                        Birthday estimation requires consistent age progression data (ideally seeing a user turn from one age to the next).
                    </p>
                </div>
            </div>
        `;
    }

    const confidenceColors = {
        'High': '#46d160',
        'Medium': '#ff8c42',
        'Low': '#ffa500',
        'Very Low': '#ff6b6b'
    };

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">🎂 Birthday Estimate</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                <div class="birthday-estimate">
                    <div class="birthday-month-range">${birthday.range}</div>
                    <div class="birthday-confidence" style="color: ${confidenceColors[birthday.confidence]};">
                        ${birthday.confidence} Confidence
                        ${birthday.transitionCount ? `(based on ${birthday.transitionCount} age transition${birthday.transitionCount > 1 ? 's' : ''})` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function buildCouplesSection(analysis) {
    const couples = analysis.couplesAnalysis;

    if (!couples || !couples.isCouplesAccount) {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">👥 Couples Account Detection</span>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: #46d160;">✓ No couples/shared account pattern detected.</p>
                    <p style="color: #818384; font-size: 12px; margin-top: 10px;">
                        ${couples ? couples.explanation : 'Couples detection looks for two distinct age groups that both age appropriately over time.'}
                    </p>
                    ${couples && couples.ageGapConsistency > 0 ? `
                    <p style="color: #818384; font-size: 11px; margin-top: 5px;">
                        Debug: interleave=${(couples.interleaveRatio * 100).toFixed(0)}%,
                        gapConsistency=${(couples.ageGapConsistency * 100).toFixed(0)}%
                    </p>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const tracksHTML = couples.tracks.map(track => {
        const ageEstimate = track.currentAgeEstimate ? `~${track.currentAgeEstimate}` : 'Unknown';
        const birthdayInfo = track.birthdayEstimate && track.birthdayEstimate.confidence !== 'None'
            ? `Birthday: ${track.birthdayEstimate.range} (${track.birthdayEstimate.confidence})`
            : 'Birthday: Unable to estimate';

        // Show progression info if available
        let progressionInfo = '';
        if (track.ageProgression) {
            const prog = track.ageProgression;
            if (prog.timeSpanYears > 0) {
                progressionInfo = `
                    <div class="analysis-stat-row">
                        <span class="analysis-stat-label">Age Progression</span>
                        <span class="analysis-stat-value ${prog.isReasonable ? 'success' : 'warning'}">
                            +${prog.ageChange} years over ${prog.timeSpanYears} years
                            (${prog.ratePerYear}/yr) ${prog.isReasonable ? '✓' : '⚠️'}
                        </span>
                    </div>
                `;
            }
        }

        return `
            <div class="couples-track">
                <div class="couples-track-title">${track.name}</div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Age Range</span>
                    <span class="analysis-stat-value">${track.ageRange.min} - ${track.ageRange.max}</span>
                </div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Estimated Current Age</span>
                    <span class="analysis-stat-value">${ageEstimate}</span>
                </div>
                ${progressionInfo}
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">${birthdayInfo.split(':')[0]}</span>
                    <span class="analysis-stat-value">${birthdayInfo.split(':')[1] || 'Unable to estimate'}</span>
                </div>
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label">Post Count</span>
                    <span class="analysis-stat-value">${track.postCount}</span>
                </div>
            </div>
        `;
    }).join('');

    // Calculate the age gap for display
    const track1Avg = couples.tracks[0] ? (couples.tracks[0].ageRange.min + couples.tracks[0].ageRange.max) / 2 : 0;
    const track2Avg = couples.tracks[1] ? (couples.tracks[1].ageRange.min + couples.tracks[1].ageRange.max) / 2 : 0;
    const avgGap = Math.abs(track1Avg - track2Avg);

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">👥 Couples Account Detection (${couples.confidence} Confidence)</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                <p style="color: #ff8c42; margin-bottom: 15px;">
                    ⚠️ This appears to be a shared/couples account with two people of different ages.
                </p>
                <div style="background-color: #1f1f21; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <div class="analysis-stat-row">
                        <span class="analysis-stat-label">Detection Method</span>
                        <span class="analysis-stat-value info">${couples.detectionMethod || 'Multiple signals'}</span>
                    </div>
                    <div class="analysis-stat-row">
                        <span class="analysis-stat-label">Average Age Gap</span>
                        <span class="analysis-stat-value">${avgGap.toFixed(0)} years</span>
                    </div>
                    <div class="analysis-stat-row">
                        <span class="analysis-stat-label">Gap Consistency</span>
                        <span class="analysis-stat-value ${couples.ageGapConsistency >= 0.8 ? 'success' : couples.ageGapConsistency >= 0.6 ? 'warning' : ''}">${(couples.ageGapConsistency * 100).toFixed(0)}%</span>
                    </div>
                    <div class="analysis-stat-row">
                        <span class="analysis-stat-label">Post Interleaving</span>
                        <span class="analysis-stat-value">${(couples.interleaveRatio * 100).toFixed(0)}%</span>
                    </div>
                </div>
                ${tracksHTML}
            </div>
        </div>
    `;
}

function buildTimelineSection(analysis) {
    if (analysis.timeline.length === 0) {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">📅 Age Timeline</span>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: #818384;">No timeline data available.</p>
                </div>
            </div>
        `;
    }

    // Group by transitions for cleaner display
    const timelineEntries = [];
    let prevAge = null;

    // Show most recent 50 entries
    const displayTimeline = analysis.timeline.slice(-50);

    displayTimeline.forEach((point, idx) => {
        let entryClass = 'age-same';
        let changeText = '';

        if (idx === 0 || prevAge === null) {
            entryClass = 'first-post';
            changeText = '(First recorded)';
        } else if (point.age > prevAge) {
            entryClass = 'age-increase';
            changeText = `(+${point.age - prevAge} from ${prevAge})`;
        } else if (point.age < prevAge) {
            entryClass = 'age-decrease';
            changeText = `(${point.age - prevAge} from ${prevAge}) ⚠️`;
        }

        timelineEntries.push(`
            <div class="timeline-entry ${entryClass}">
                <span class="timeline-date">${new Date(point.timestamp * 1000).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                })}</span>
                <span class="timeline-age" style="color: ${entryClass === 'age-decrease' ? '#ff6b6b' : '#d7dadc'};">
                    Age: ${point.age}
                </span>
                <span class="timeline-subreddit">r/${point.subreddit}</span>
                <span class="timeline-change">${changeText}</span>
            </div>
        `);

        prevAge = point.age;
    });

    const hiddenCount = analysis.timeline.length - displayTimeline.length;

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📅 Age Timeline (${analysis.timeline.length} entries)</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${hiddenCount > 0 ? `<p style="color: #818384; margin-bottom: 10px; font-size: 12px;">Showing most recent 50 entries. ${hiddenCount} older entries hidden.</p>` : ''}
                ${timelineEntries.join('')}
            </div>
        </div>
    `;
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
