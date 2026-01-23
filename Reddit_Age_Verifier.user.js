// ==UserScript==
// @name         Reddit Details Verifier
// @namespace    RedditAgeVerifier
// @description  Search via PushShift API to verify posting history
// @include      http://*.reddit.com/*
// @include      https://*.reddit.com/*
// @include      https://auth.pushshift.io/*
// @include      https://*.reddit.com/api/v1/authorize*
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
// @exclude      https://*.reddit.com/message/*
// @exclude      https://*.reddit.com/report*
// @exclude      https://chat.reddit.com*
// @exclude      https://developers.reddit.com*
// @exclude      https://mod.reddit.com/chat*
// @downloadURL  https://github.com/quentinwolf/Reddit-Age-Verifier/raw/refs/heads/main/Reddit_Age_Verifier.user.js
// @updateURL    https://github.com/quentinwolf/Reddit-Age-Verifier/raw/refs/heads/main/Reddit_Age_Verifier.user.js
// @version      1.844
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
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

// Cache and expiration times
let CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000;      // 1 week for user results
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000;          // 24 hours for API token
const BUTTON_CACHE_EXPIRATION = 365 * 24 * 60 * 60 * 1000; // 1 year for button text
const DELETED_CONTENT_CACHE_KEY = 'deletedContentCache';

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
    defaultButtonText: 'PushShift',
    buttonDefaultColor: '#0079d3',
    buttonCachedColor: '#46d160',
    themePreset: 'default', // 'default', 'light', 'high-contrast', 'custom'
    customColors: {
        primary: '#0079d3',
        background: '#1a1a1b',
        surface: '#272729',
        text: '#d7dadc',
        textMuted: '#818384',
        border: '#343536',
        success: '#46d160',
        warning: '#ff8c42',
        danger: '#ea0027',
        analysisHeader: '#1f1f21',
        analysisHeaderHover: '#2a2a2c',
        anomalyBg: '#4a1c1c',
        link: '#5ca3f5'
    },
    enableVeryLowConfidence: ENABLE_VERY_LOW_CONFIDENCE,
    titleSnippetLength: TITLE_SNIPPET_LENGTH,
    bodySnippetLength: BODY_SNIPPET_LENGTH,
    cacheExpiration: CACHE_EXPIRATION / (24 * 60 * 60 * 1000), // in days
    ignoredUsers: [],
    // Additional features
    showAgeEstimation: true,
    defaultSort: 'newest', // 'oldest' or 'newest'
    autoFilterPosted: false, // auto-filter to show only posted ages
    showRestoreButtons: true,          // Enable/disable the restore feature
    restoreAllWorkers: 3, // Number of concurrent workers for Restore All (1-5)
    autoRestoreDeletedAuthors: false,  // Future: auto-restore on page load if cached
    modalWidth: 800, // default results modal width in pixels
    modalHeight: 900, // default results modal height in pixels
    paginationLimit: 250,
    trackedSubreddits: [], // subreddits to compare age behavior against
    minPotentialAge: 25,
    minCouplesAgeGap: 6, // minimum age gap (years) to detect couples accounts
    timelineContextPosts: 1, // to provide surrounding context when compressing posts in the Deep Analysis Age Timeline
    timelineCompressionThreshold: 5, // threshold to compress additional posts with the same age in the Deep Analysis Age Timeline
    timelineCompressionMinEntries: 50, // minimum timeline entries before compression is enabled
    commonBots: {
        'AutoModerator': true,
        'RepostSleuthBot': true,
        'sneakpeekbot': true,
        'RemindMeBot': true,
        'MTGCardFetcher': true,
        'magic_eye_bot': true,
        'auto_modmail': true,
        'evasion-guard': true,
    },
    customButtons: [
        // Example: { id: 'clickme', label: 'Clickable Button', type: 'link', urlTemplate: 'https://someurl.here', enabled: true, style: 'danger', showInContextMenu: false }
        // Example: { id: 'verify', label: 'Verification', type: 'template', textTemplate: 'Your text here with {{author}}', enabled: true, style: 'primary', showInContextMenu: true }
    ]
};

const THEME_PRESETS = {
    default: {
        primary: '#0079d3',
        background: '#1a1a1b',
        surface: '#272729',
        text: '#d7dadc',
        textMuted: '#818384',
        border: '#343536',
        success: '#46d160',
        warning: '#ff8c42',
        danger: '#ea0027',
        analysisHeader: '#1f1f21',
        analysisHeaderHover: '#2a2a2c',
        anomalyBg: '#4a1c1c',
        link: '#5ca3f5'
    },
    light: {
        primary: '#0079d3',
        background: '#ffffff',
        surface: '#f6f7f8',
        text: '#1c1c1c',
        textMuted: '#7c7c7c',
        border: '#ccc',
        success: '#46d160',
        warning: '#ff8c42',
        danger: '#ea0027',
        analysisHeader: '#e8e9ea',
        analysisHeaderHover: '#d8d9da',
        anomalyBg: '#ffe5e5',
        link: '#0051a3'
    },
    'high-contrast': {
        primary: '#0099ff',
        background: '#000000',
        surface: '#1a1a1a',
        text: '#ffffff',
        textMuted: '#cccccc',
        border: '#ffffff',
        success: '#00ff00',
        warning: '#ffaa00',
        danger: '#ff0000',
        analysisHeader: '#0a0a0a',
        analysisHeaderHover: '#1f1f1f',
        anomalyBg: '#330000',
        link: '#66b3ff'
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
        // Ensure customButtons exists
        if (!userSettings.customButtons) {
            userSettings.customButtons = [];
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

    // Apply theme
    applyTheme();
}

function applyTheme() {
    const colors = userSettings.themePreset === 'custom'
        ? userSettings.customColors
        : THEME_PRESETS[userSettings.themePreset] || THEME_PRESETS.default;

    // Set CSS variables
    document.documentElement.style.setProperty('--av-primary', colors.primary);
    document.documentElement.style.setProperty('--av-background', colors.background);
    document.documentElement.style.setProperty('--av-surface', colors.surface);
    document.documentElement.style.setProperty('--av-text', colors.text);
    document.documentElement.style.setProperty('--av-text-muted', colors.textMuted);
    document.documentElement.style.setProperty('--av-border', colors.border);
    document.documentElement.style.setProperty('--av-success', colors.success);
    document.documentElement.style.setProperty('--av-warning', colors.warning);
    document.documentElement.style.setProperty('--av-danger', colors.danger);
    document.documentElement.style.setProperty('--av-analysis-header', colors.analysisHeader);
    document.documentElement.style.setProperty('--av-analysis-header-hover', colors.analysisHeaderHover);
    document.documentElement.style.setProperty('--av-anomaly-bg', colors.anomalyBg);
    document.documentElement.style.setProperty('--av-link', colors.link);
    document.documentElement.style.setProperty('--av-button-default', userSettings.buttonDefaultColor);
    document.documentElement.style.setProperty('--av-button-cached', userSettings.buttonCachedColor);
}

// Extract version from userscript metadata
function getScriptVersion() {
    const scriptText = GM_info.script.version ||
          (document.querySelector('script[type="text/javascript"]')?.textContent.match(/@version\s+([\d.]+)/) || [])[1] ||
          'unknown';
    return scriptText;
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

const ageCache = JSON.parse(GM_getValue('ageVerifierCache', '{}'));
const buttonCache = JSON.parse(GM_getValue('ageVerifierButtonCache', '{}'));
let apiToken = null;
let tokenModal = null;
let resultsModals = []; // Array to track multiple result modals
let modalCounter = 0;   // Counter for unique modal IDs
let zIndexCounter = 10000; // Counter for z-index management

let oauthFlowTimestamp = 0; // Track when we initiated OAuth flow
const OAUTH_FLOW_TIMEOUT = 60 * 1000; // 60 seconds

// ============================================================================
// STYLES
// ============================================================================

GM_addStyle(`
    .age-check-button {
        margin: 3px;
        padding: 2px 6px;
        background-color: var(--av-primary);
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
        background-color: var(--av-success);
    }

    .age-check-button.cached:hover {
        background-color: #37a84e;
    }

    .age-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: var(--av-background);
        color: var(--av-text);
        border: 2px solid var(--av-border);
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
        border-bottom: 1px solid var(--av-border);
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
        color: var(--av-text);
    }

    .age-modal-close {
        background: none;
        border: none;
        color: var(--av-text-muted);
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        line-height: 30px;
        text-align: center;
    }

    .age-modal-close:hover {
        color: var(--av-text);
    }

    .age-modal-content {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }

    .age-modal-content a {
        color: var(--av-link);
    }

    .age-modal-topbar {
        width: 100%;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 6px;
        padding: 12px 14px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    }

    .age-token-input {
        width: 100%;
        padding: 8px;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        font-family: monospace;
        font-size: 12px;
        margin-top: 10px;
    }

    .age-modal-button {
        padding: 8px 16px;
        background-color: var(--av-primary);
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
        background-color: var(--av-border);
    }

    .age-modal-button.secondary:hover {
        background-color: #4a4a4b;
    }

    .age-modal-button.danger {
        background-color: var(--av-danger);
    }

    .age-modal-button.danger:hover {
        background-color: #c20022;
    }

    .age-summary {
        background-color: var(--av-surface);
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 15px;
        border-left: 4px solid var(--av-primary);
    }

    .age-summary-title {
        margin-bottom: 4px;
        color: var(--av-text);
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
        background-color: var(--av-primary);
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
        background-color: var(--av-text-muted);
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
        background-color: var(--av-warning);
    }

    .age-chip.possible.active:hover {
        background-color: #e67a32;
    }

    .age-filter-status-container {
        margin-top: 10px;
    }

    .age-filter-status {
        background-color: var(--av-warning);
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
        background-color: var(--av-surface);
        padding: 12px;
        margin-bottom: 10px;
        border-radius: 4px;
        border-left: 3px solid var(--av-primary);
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
        color: var(--av-text-muted);
    }

    .age-result-subreddit {
        color: var(--av-primary);
        font-weight: normal;
    }

    .age-result-snippet {
        color: var(--av-text);
        font-size: 12px;
        margin: 8px 0;
        line-height: 1.4;
    }

    .age-result-link {
        color: var(--av-primary);
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
        border-left: 4px solid var(--av-danger);
    }

    .age-loading {
        text-align: center;
        padding: 20px;
        color: var(--av-text-muted);
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
        border-top: 1px solid var(--av-border);
        flex-shrink: 0;
    }

    .age-link-text {
        color: var(--av-primary);
        margin: 10px 0;
    }

    .age-link-text a {
        color: var(--av-primary);
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
        background-color: var(--av-success);
        color: white;
    }

    .highlight-age.possible {
        background-color: var(--av-warning);
        color: white;
    }

    .expand-link,
    .collapse-link {
        color: var(--av-primary);
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
        border-bottom: 1px solid var(--av-border);
    }

    .age-settings-section:last-child {
        border-bottom: none;
        margin-bottom: 0;
    }

    .age-settings-section-title {
        font-size: 16px;
        font-weight: bold;
        color: var(--av-text);
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
        color: var(--av-text);
        font-size: 13px;
        flex: 1;
    }

    .age-settings-input {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        padding: 6px 10px;
        font-size: 13px;
        width: 100%;
        box-sizing: border-box;
    }

    .age-settings-numberinput {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        padding: 6px 10px;
        font-size: 13px;
        width: 120px;
        box-sizing: border-box;
    }

    .age-settings-input:focus {
        outline: none;
        border-color: var(--av-primary);
    }

    .age-settings-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .age-settings-textarea {
        width: 100%;
        min-height: 100px;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        padding: 8px;
        font-size: 12px;
        font-family: monospace;
        resize: vertical;
        box-sizing: border-box;
    }

    .age-settings-textarea:focus {
        outline: none;
        border-color: var(--av-primary);
    }

    .age-ignored-users-list {
        max-height: 150px;
        overflow-y: auto;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
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
        background-color: var(--av-background);
        border-radius: 3px;
    }

    .age-ignored-user-name {
        color: var(--av-text);
        font-size: 12px;
        font-family: monospace;
    }

    .age-ignored-user-remove {
        background-color: var(--av-danger);
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
        color: var(--av-text);
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
        color: var(--av-text-muted);
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
        color: var(--av-text);
    }

    .age-settings-help-text {
        color: var(--av-text-muted);
        font-size: 11px;
        margin-top: 5px;
        font-style: italic;
    }

    /* Deep Analysis Modal Styles */
    .deep-analysis-section {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 6px;
        margin-bottom: 15px;
        overflow: hidden;
    }

    .deep-analysis-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background-color: var(--av-analysis-header);
        cursor: pointer;
        user-select: none;
    }

    .deep-analysis-header:hover {
        background-color: var(--av-analysis-header-hover);
    }

    .deep-analysis-title {
        font-weight: bold;
        font-size: 14px;
        color: var(--av-text);
    }

    .deep-analysis-toggle {
        color: var(--av-text-muted);
        font-size: 12px;
    }

    .deep-analysis-copy {
        background: none;
        border: none;
        color: var(--av-text-muted);
        font-size: 16px;
        cursor: pointer;
        padding: 0 8px;
        transition: color 0.2s;
    }

    .deep-analysis-copy:hover {
        color: var(--av-text);
    }

    .deep-analysis-copy.copied {
        color: var(--av-success);
    }

    .deep-analysis-content {
        padding: 15px;
        border-top: 1px solid var(--av-border);
    }

    .deep-analysis-content.collapsed {
        display: none;
    }

    .analysis-stat-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--av-border);
    }

    .analysis-stat-row:last-child {
        border-bottom: none;
    }

    .analysis-stat-label {
        color: var(--av-text-muted);
        font-size: 13px;
    }

    .analysis-stat-value {
        color: var(--av-text);
        font-size: 13px;
        font-weight: 500;
    }

    .analysis-stat-value.warning {
        color: var(--av-warning);
    }

    .analysis-stat-value.danger {
        color: #ff6b6b;
    }

    .analysis-stat-value.success {
        color: var(--av-success);
    }

    .analysis-stat-value.info {
        color: var(--av-primary);
    }

    .timeline-entry {
        display: flex;
        padding: 8px 12px;
        border-left: 3px solid var(--av-border);
        margin-bottom: 8px;
        background-color: var(--av-analysis-header);
        border-radius: 0 4px 4px 0;
    }

    .timeline-entry.age-increase {
        border-left-color: var(--av-success);
    }

    .timeline-entry.age-decrease {
        border-left-color: #ff6b6b;
    }

    .timeline-entry.age-same {
        border-left-color: var(--av-text-muted);
    }

    .timeline-entry.first-post {
        border-left-color: var(--av-primary);
    }

    .timeline-date {
        color: var(--av-text-muted);
        font-size: 11px;
        min-width: 180px;
    }

    .timeline-age {
        font-weight: bold;
        min-width: 60px;
    }

    .timeline-subreddit {
        color: var(--av-primary);
        font-size: 12px;
        flex: 1;
    }

    .timeline-change {
        color: var(--av-text-muted);
        font-size: 12px;
        margin-left: 6px;
        min-width: 50px;
    }

    .subreddit-comparison-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .subreddit-comparison-table th {
        text-align: left;
        padding: 8px;
        background-color: var(--av-surface);
        color: var(--av-text-muted);
        font-weight: normal;
        border-bottom: 1px solid var(--av-border);
    }

    .subreddit-comparison-table td {
        padding: 8px;
        border-bottom: 1px solid var(--av-border);
        color: var(--av-text);
    }

    .subreddit-comparison-table tr:last-child td {
        border-bottom: none;
    }

    .couples-track {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 10px;
    }

    .couples-track-title {
        font-weight: bold;
        margin-bottom: 8px;
        color: var(--av-text);
    }

    .birthday-estimate {
        background-color: var(--av-analysis-header);
        border-radius: 4px;
        padding: 15px;
        text-align: center;
    }

    .birthday-month-range {
        font-size: 18px;
        font-weight: bold;
        color: var(--av-primary);
        margin-bottom: 5px;
    }

    .birthday-confidence {
        font-size: 12px;
        color: var(--av-text-muted);
    }

    .fetch-more-container {
        text-align: center;
        padding: 15px;
        border-top: 1px solid var(--av-border);
        margin-top: 15px;
    }

    .fetch-more-status {
        color: var(--av-text-muted);
        font-size: 12px;
        margin-top: 8px;
    }

    .anomaly-item {
        background-color: var(--av-anomaly-bg);
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
        color: var(--av-text-muted);
        font-size: 11px;
        margin-top: 4px;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
    }

    .custom-button-editor {
        cursor: move;
        transition: opacity 0.2s, transform 0.2s;
    }

    .custom-button-editor.dragging {
        opacity: 0.5;
        transform: scale(0.98);
    }

    .custom-button-editor.drag-over {
        border-top: 3px solid var(--av-primary);
    }

    .custom-button-drag-handle {
        color: var(--av-text-muted);
        font-size: 18px;
        cursor: grab;
        user-select: none;
        margin-right: 8px;
    }

    .custom-button-drag-handle:active {
        cursor: grabbing;
    }

    /* Floating Notification Banner */
    .settings-notification-banner {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--av-success);
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideUpFadeIn 0.3s ease-out;
        opacity: 0;
    }

    .settings-notification-banner.show {
        opacity: 1;
    }

    .settings-notification-banner.hide {
        animation: slideDownFadeOut 0.3s ease-out forwards;
    }

    @keyframes slideUpFadeIn {
        from {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }

    @keyframes slideDownFadeOut {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
        }
    }

    /* Context Menu Styles */
    .age-context-menu {
        position: absolute;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        min-width: 180px;
        padding: 4px 0;
    }

    .age-context-menu-item {
        padding: 8px 16px;
        color: var(--av-text);
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background-color 0.1s;
    }

    .age-context-menu-item:hover {
        background-color: var(--av-primary);
        color: white;
    }

    .age-context-menu-item {
        position: relative;
    }

    .age-context-submenu {
        position: absolute;
        left: 100%;
        top: 0;
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        min-width: 180px;
        padding: 4px 0;
        display: none;
        z-index: 1000000;
    }

    .age-context-menu-item:hover .age-context-submenu {
        display: block;
    }

    .age-context-menu-arrow {
        margin-left: auto;
        opacity: 0.6;
    }

    .age-context-menu-item.danger:hover {
        background-color: var(--av-danger);
    }

    .age-context-menu-separator {
        height: 1px;
        background-color: var(--av-border);
        margin: 4px 0;
    }

    /* Manual Search Styles */
    .manual-search-form {
        display: grid;
        gap: 15px;
    }

    .manual-search-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
    }

    .manual-search-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .manual-search-label {
        color: var(--av-text);
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .manual-search-input {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        padding: 8px 10px;
        font-size: 13px;
    }

    .manual-search-input:focus {
        outline: none;
        border-color: var(--av-primary);
    }

    .manual-search-select {
        background-color: var(--av-surface);
        border: 1px solid var(--av-border);
        border-radius: 4px;
        color: var(--av-text);
        padding: 8px 10px;
        font-size: 13px;
        cursor: pointer;
    }

    .manual-search-checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        padding: 10px;
        background-color: --av-analysis-header;
        border-radius: 4px;
    }

    .manual-search-checkbox-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .manual-search-checkbox-item label {
        color: var(--av-text);
        font-size: 13px;
        cursor: pointer;
    }

    .manual-result-item {
        background-color: var(--av-surface);
        padding: 15px;
        margin-bottom: 12px;
        border-radius: 4px;
        border-left: 3px solid var(--av-primary);
    }

    .manual-result-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--av-border);
    }

    .manual-result-meta {
        display: flex;
        gap: 15px;
        font-size: 12px;
        color: var(--av-text-muted);
        flex-wrap: wrap;
    }

    .manual-result-author {
        color: var(--av-primary);
        font-weight: bold;
        text-decoration: none;
    }

    .manual-result-author:hover {
        text-decoration: underline;
    }

    .manual-result-score {
        color: var(--av-warning);
    }

    .manual-result-title {
        font-size: 15px;
        font-weight: bold;
        color: var(--av-text);
        margin-bottom: 10px;
    }

    .manual-result-body {
        color: var(--av-text);
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .highlight-search-term {
        background-color: #ff4500;
        color: white;
        padding: 2px 4px;
        border-radius: 2px;
        font-weight: bold;
    }

`);

// Debug Function to log messages to console if enabled at top of script
function logDebug(...args) {
    if (debugMode) {
        console.log('[Age Verifier]', ...args);
    }
}

// Function to show floating notification banner
function showNotificationBanner(message, duration = 3000, update = false) {
    const existingBanner = document.querySelector('.settings-notification-banner');

    if (update && existingBanner) {
        // Update existing banner text
        const textSpan = existingBanner.querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = message;
        }

        // Clear any existing timeout and set new one if duration is specified
        if (existingBanner.hideTimeout) {
            clearTimeout(existingBanner.hideTimeout);
        }

        if (duration > 0) {
            existingBanner.hideTimeout = setTimeout(() => {
                existingBanner.classList.add('hide');
                existingBanner.classList.remove('show');

                setTimeout(() => {
                    if (existingBanner.parentNode) {
                        existingBanner.remove();
                    }
                }, 300);
            }, duration);
        }

        return;
    }

    // Remove any existing banner if not updating
    if (existingBanner) {
        existingBanner.remove();
    }

    // Create new banner
    const banner = document.createElement('div');
    banner.className = 'settings-notification-banner';
    banner.innerHTML = `
        <span style="font-size: 18px;">✓</span>
        <span>${message}</span>
    `;

    document.body.appendChild(banner);

    // Trigger show animation
    requestAnimationFrame(() => {
        banner.classList.add('show');
    });

    // Auto-hide after duration (if duration > 0)
    if (duration > 0) {
        banner.hideTimeout = setTimeout(() => {
            banner.classList.add('hide');
            banner.classList.remove('show');

            // Remove from DOM after animation completes
            setTimeout(() => {
                if (banner.parentNode) {
                    banner.remove();
                }
            }, 300);
        }, duration);
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
    logDebug("Age Verifier: Opening OAuth flow for auto-submission");

    // Set timestamp to validate auto-submit
    oauthFlowTimestamp = Date.now();
    GM_setValue('oauthFlowTimestamp', oauthFlowTimestamp);

    // Open auth window
    const authWindow = window.open(
        PUSHSHIFT_AUTH_URL,
        'PushShiftAuth',
        'width=600,height=700,left=100,top=100'
    );

    if (!authWindow) {
        logDebug("Age Verifier: Popup blocked - falling back to manual");
        return false;
    }

    return true;
}

function handleOAuthAutoClick() {
    // Only run on Reddit OAuth authorize page
    if (!window.location.href.includes('reddit.com/api/v1/authorize')) {
        return;
    }

    // Security check 1: Verify this is PushShift OAuth request
    const url = new URL(window.location.href);
    const redirectUri = url.searchParams.get('redirect_uri');

    if (!redirectUri || !redirectUri.includes('auth.pushshift.io/callback')) {
        logDebug("Age Verifier: OAuth page detected but not for PushShift - ignoring");
        return;
    }

    // Security check 2: Verify we recently initiated this flow
    const storedTimestamp = GM_getValue('oauthFlowTimestamp', 0);
    const now = Date.now();
    const timeSinceInitiated = now - storedTimestamp;

    if (timeSinceInitiated > OAUTH_FLOW_TIMEOUT) {
        logDebug(`Age Verifier: OAuth page opened but flow not recently initiated (${Math.round(timeSinceInitiated/1000)}s ago) - ignoring`);
        return;
    }

    logDebug("Age Verifier: Detected PushShift OAuth page - auto-submitting form");

    // Clear the timestamp
    GM_setValue('oauthFlowTimestamp', 0);

    const autoSubmitForm = () => {
        // Find the OAuth form
        const form = document.querySelector('form.pretty-form, form[action*="authorize"]');

        if (!form) {
            logDebug("Age Verifier: Form not found yet, retrying...");
            setTimeout(autoSubmitForm, 300);
            return;
        }

        // Verify this is the right form (has the Allow button)
        const allowButton = form.querySelector('input[name="authorize"][value="Allow"]');
        if (!allowButton) {
            logDebug("Age Verifier: Allow button not found in form, retrying...");
            setTimeout(autoSubmitForm, 300);
            return;
        }

        logDebug("Age Verifier: Found OAuth form - extracting data");

        // Extract all form data
        const formData = new FormData(form);

        // Set authorize to "Allow"
        formData.set('authorize', 'Allow');

        // Get the form action URL
        const formAction = form.action;

        logDebug("Age Verifier: Submitting to:", formAction);

        // Convert FormData to URL params
        const params = new URLSearchParams(formData);

        // Submit the form via GM_xmlhttpRequest
        GM_xmlhttpRequest({
            method: 'POST',
            url: formAction,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: params.toString(),
            onload: function(response) {
                logDebug("Age Verifier: OAuth form submitted, status:", response.status);
                logDebug("Age Verifier: Final URL:", response.finalUrl);

                // Check if we got redirected to the callback
                if (response.finalUrl && response.finalUrl.includes('auth.pushshift.io/callback')) {
                    logDebug("Age Verifier: Redirected to callback, extracting token from response");

                    try {
                        // Parse the JSON response
                        const tokenData = JSON.parse(response.responseText);
                        const token = tokenData.access_token;

                        if (token) {
                            logDebug("Age Verifier: Token extracted:", token.substring(0, 20) + '...');

                            // Save the token
                            saveToken(token);

                            // Set a flag that the parent window can detect
                            GM_setValue('oauthFlowComplete', Date.now());
                            logDebug("Age Verifier: Set completion flag");

                            // Show success and close window
                            document.body.innerHTML = `
                                <div style="font-family: Arial; padding: 40px; text-align: center; background: var(--av-background); color: var(--av-text); min-height: 100vh;">
                                    <h2 style="color: var(--av-success);">✓ Token Captured Successfully!</h2>
                                    <p>This window will close automatically...</p>
                                </div>
                            `;

                            setTimeout(() => window.close(), 2000);

                        }
                    } catch (e) {
                        logDebug("Age Verifier: Failed to parse token from response:", e);
                        logDebug("Age Verifier: Response text:", response.responseText.substring(0, 200));

                        // Try regex extraction as fallback
                        const tokenMatch = response.responseText.match(/"access_token"\s*:\s*"([^"]+)"/);
                        if (tokenMatch && tokenMatch[1]) {
                            const token = tokenMatch[1];
                            logDebug("Age Verifier: Token extracted via regex:", token.substring(0, 20) + '...');
                            saveToken(token);

                            document.body.innerHTML = `
                                <div style="font-family: Arial; padding: 40px; text-align: center; background: var(--av-background); color: var(--av-text); min-height: 100vh;">
                                    <h2 style="color: var(--av-success);">✓ Token Captured Successfully!</h2>
                                    <p>This window will close automatically...</p>
                                </div>
                            `;

                            setTimeout(() => window.close(), 2000);
                        }
                    }
                } else {
                    logDebug("Age Verifier: Unexpected response, not redirected to callback");
                    logDebug("Age Verifier: Response:", response.responseText.substring(0, 500));
                }
            },
            onerror: function(response) {
                logDebug("Age Verifier: Error submitting OAuth form:", response);
            }
        });
    };

    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(autoSubmitForm, 500));
    } else {
        setTimeout(autoSubmitForm, 500);
    }
}

function handleCallbackTokenExtraction() {
    // Only run on PushShift callback page
    if (!window.location.href.includes('auth.pushshift.io/callback')) {
        return;
    }

    console.log("[Age Verifier] On callback page - extracting token");
    console.log("[Age Verifier] Document ready state:", document.readyState);
    console.log("[Age Verifier] Body HTML:", document.body?.innerHTML);

    const extractToken = () => {
        console.log("[Age Verifier] Attempting token extraction...");

        try {
            let bodyText = '';

            // Method 1: Check for <pre> tag (JSON displayed as plain text)
            const preElement = document.querySelector('pre');
            if (preElement) {
                bodyText = preElement.textContent;
                console.log("[Age Verifier] Found <pre> element with content:", bodyText.substring(0, 100));
            } else {
                // Method 2: Try body.textContent
                bodyText = document.body?.textContent || '';
                console.log("[Age Verifier] Using body.textContent:", bodyText.substring(0, 100));
            }

            if (!bodyText) {
                console.log("[Age Verifier] No content found yet, retrying...");
                setTimeout(extractToken, 300);
                return false;
            }

            // Try to parse as JSON
            let tokenData;
            try {
                tokenData = JSON.parse(bodyText);
            } catch (e) {
                // Maybe it's wrapped in extra text, try regex
                const jsonMatch = bodyText.match(/\{[^}]*"access_token"\s*:\s*"([^"]+)"[^}]*\}/);
                if (jsonMatch && jsonMatch[1]) {
                    tokenData = { access_token: jsonMatch[1] };
                } else {
                    console.log("[Age Verifier] Could not parse JSON, retrying...");
                    setTimeout(extractToken, 300);
                    return false;
                }
            }

            const token = tokenData.access_token;

            if (!token) {
                console.log("[Age Verifier] No access_token in JSON, retrying...");
                setTimeout(extractToken, 300);
                return false;
            }

            console.log("[Age Verifier] Token extracted successfully:", token.substring(0, 20) + '...');

            // Send token back to opener window
            if (window.opener && !window.opener.closed) {
                console.log("[Age Verifier] Sending token to opener window");

                // Try all possible Reddit origins
                const possibleOrigins = [
                    'https://old.reddit.com',
                    'https://www.reddit.com',
                    'https://mod.reddit.com',
                    '*' // Wildcard as fallback (less secure but for testing)
                ];

                possibleOrigins.forEach(origin => {
                    try {
                        window.opener.postMessage({
                            type: 'PUSHSHIFT_TOKEN',
                            token: token
                        }, origin);
                        console.log("[Age Verifier] Sent message to origin:", origin);
                    } catch (e) {
                        console.log("[Age Verifier] Failed to send to origin:", origin, e);
                    }
                });

                // Show success message
                document.body.innerHTML = `
                    <div style="font-family: Arial; padding: 40px; text-align: center; background: var(--av-background); color: var(--av-text); min-height: 100vh;">
                        <h2 style="color: var(--av-success);">✓ Token Captured Successfully!</h2>
                        <p>This window will close automatically...</p>
                        <p style="font-size: 12px; color: var(--av-text-muted); margin-top: 20px;">Token: ${token.substring(0, 30)}...</p>
                    </div>
                `;

                // Close window after brief delay
                setTimeout(() => {
                    console.log("[Age Verifier] Closing callback window");
                    window.close();
                }, 2000);

                return true;
            } else {
                console.log("[Age Verifier] No opener window found");

                // Fallback: Display token for manual copy
                document.body.innerHTML = `
                    <div style="font-family: Arial; padding: 40px; text-align: center; background: var(--av-background); color: var(--av-text); min-height: 100vh;">
                        <h2>Token Retrieved</h2>
                        <p>Copy this token and paste it into the Age Verifier:</p>
                        <input type="text" value="${token}" readonly
                               style="width: 80%; padding: 10px; font-family: monospace; font-size: 14px; background: var(--av-surface); color: var(--av-text); border: 1px solid var(--av-border);"
                               onclick="this.select()">
                        <br><br>
                        <button onclick="navigator.clipboard.writeText('${token}').then(() => alert('Copied!'))"
                                style="padding: 10px 20px; background: var(--av-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Copy to Clipboard
                        </button>
                    </div>
                `;
                return true;
            }
        } catch (error) {
            console.error("[Age Verifier] Error extracting token:", error);
            setTimeout(extractToken, 500);
            return false;
        }
    };

    // Start extraction immediately and retry if needed
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(extractToken, 100));
    } else {
        setTimeout(extractToken, 100);
    }
}

function showTokenModal(pendingUsername = null) {
    if (tokenModal) return; // Already showing

    // Store pending username for auto-resume after token capture
    if (pendingUsername) {
        GM_setValue('pendingAgeCheck', pendingUsername);
    }

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
                <li>Visit the <a href="${PUSHSHIFT_AUTH_URL}" target="_blank" style="color: var(--av-primary);">PushShift Authorization page</a></li>
                <li>Sign in with your Reddit account and authorize</li>
                <li>After authorization, copy the <code style="background: var(--av-surface); padding: 2px 6px; border-radius: 3px;">access_token</code> from the callback page</li>
                <li>Paste it below</li>
            </ol>
            <p style="font-size: 12px; color: var(--av-text-muted);">Your token will be cached for 24 hours.</p>
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

    // Add auto-fetch button
    const autoFetchBtn = document.createElement('button');
    autoFetchBtn.className = 'age-modal-button';
    autoFetchBtn.textContent = 'Auto-Fetch Token (OAuth)';
    autoFetchBtn.style.marginTop = '10px';
    autoFetchBtn.onclick = () => {
        attemptAutoFetchToken();
        modal.querySelector('.age-token-input').placeholder = 'Waiting for OAuth flow...';
    };

    const modalContent = modal.querySelector('.age-modal-content');
    modalContent.appendChild(autoFetchBtn);

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

    // Poll for OAuth completion flag
    const checkInterval = setInterval(() => {
        const completionTime = GM_getValue('oauthFlowComplete', 0);

        if (completionTime > 0) {
            logDebug("Age Verifier: Detected OAuth completion flag");

            // Clear the flag
            GM_setValue('oauthFlowComplete', 0);

            // Stop polling
            clearInterval(checkInterval);

            // Reload the token into memory
            loadToken();

            // Close the token modal
            closeModal();

            // Get the pending username
            const userToCheck = GM_getValue('pendingAgeCheck', null);
            GM_setValue('pendingAgeCheck', null);

            // Check for pending restoration
            const pendingRestorationStr = GM_getValue('pendingRestoration', null);
            GM_setValue('pendingRestoration', null);

            // If there was a pending username, automatically continue the age check
            if (userToCheck) {
                logDebug("Age Verifier: Continuing with pending check for:", userToCheck);
                setTimeout(() => {
                    handleAgeCheck(userToCheck);
                }, 100);
            }

            // If there was a pending restoration, automatically continue
            if (pendingRestorationStr) {
                try {
                    const pendingRestoration = JSON.parse(pendingRestorationStr);
                    logDebug("Age Verifier: Continuing with pending restoration for:", pendingRestoration.thingId);
                    setTimeout(() => {
                        resumeRestoration(pendingRestoration.thingId);
                    }, 100);
                } catch (e) {
                    logDebug("Age Verifier: Failed to parse pending restoration:", e);
                }
            }
        }
    }, 500); // Check every 500ms

    // Cleanup: stop polling after 5 minutes
    setTimeout(() => {
        clearInterval(checkInterval);
        logDebug("Age Verifier: OAuth polling timeout");
    }, 5 * 60 * 1000);

    input.focus();
}

function showIgnoredUsersModal() {
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.width = '500px';
    modal.style.maxWidth = '500px';
    modal.style.maxHeight = '900px';
    modal.style.zIndex = ++zIndexCounter;

    const ignoredList = userSettings.ignoredUsers;
    const commonBots = Object.keys(userSettings.commonBots).filter(bot => userSettings.commonBots[bot]);

    let ignoredUsersHTML = '';
    if (ignoredList.length === 0) {
        ignoredUsersHTML = '<p style="color: var(--av-text-muted); text-align: center; padding: 20px;">No manually ignored users</p>';
    } else {
        ignoredUsersHTML = `<div class="age-ignored-users-list" style="max-height: none;">
            ${ignoredList.map(user => `
                <div class="age-ignored-user-item">
                    <span class="age-ignored-user-name">u/${escapeHtml(user)}</span>
                    <button class="age-ignored-user-remove" data-username="${escapeHtml(user)}">Remove</button>
                </div>
            `).join('')}
        </div>`;
    }

    let botsHTML = '';
    if (commonBots.length > 0) {
        botsHTML = `
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--av-border);">
                <div style="font-weight: bold; margin-bottom: 10px; color: var(--av-text);">Common Bots (from settings)</div>
                <div style="color: var(--av-text-muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${commonBots.map(bot => `<span style="background: var(--av-surface); padding: 4px 8px; border-radius: 3px;">${bot}</span>`).join('')}
                </div>
                <p style="color: var(--av-text-muted); font-size: 11px; margin-top: 8px;">Configure in Settings</p>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Ignored Users (${ignoredList.length})</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <p style="color: var(--av-text-muted); margin-bottom: 15px;">
                Users on this list won't have age check buttons. Click "Remove" to restore their buttons.
            </p>

            <div style="margin-bottom: 20px; padding: 15px; background-color: var(--av-surface); border-radius: 6px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: var(--av-text);">Add User to Ignore List</div>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="ignore-username-input" class="age-settings-input"
                           placeholder="Enter username (with or without u/)"
                           style="flex: 1; font-family: monospace;">
                    <button class="age-modal-button" id="add-ignore-user-btn">Add User</button>
                </div>
            </div>

            ${ignoredUsersHTML}
            ${botsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="open-full-settings">Open Full Settings</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username: 'ignored-users' });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-buttons .secondary');
    const settingsBtn = modal.querySelector('#open-full-settings');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    settingsBtn.onclick = () => {
        closeModal();
        showSettingsModal();
    };

    // Define remove handler function first (so addUser can use it)
    const attachRemoveHandler = (btn) => {
        btn.onclick = () => {
            console.log('Remove button clicked!', btn.dataset.username);
            const username = btn.dataset.username;
            handleUnignoreUser(username);

            // Update the modal
            const userItem = btn.closest('.age-ignored-user-item');
            userItem.remove();

            // Update count in title
            const titleDiv = modal.querySelector('.age-modal-title');
            titleDiv.textContent = `Ignored Users (${userSettings.ignoredUsers.length})`;

            // If no more users, show empty message
            if (userSettings.ignoredUsers.length === 0) {
                const listContainer = modal.querySelector('.age-ignored-users-list');
                if (listContainer) {
                    listContainer.innerHTML = '<p style="color: var(--av-text-muted); text-align: center; padding: 20px;">No manually ignored users</p>';
                }
            }
        };
    };

    // Attach remove handlers for existing items
    const removeButtons = modal.querySelectorAll('.age-ignored-user-remove');
    console.log('Found remove buttons:', removeButtons.length);
    removeButtons.forEach((btn, idx) => {
        console.log(`Button ${idx}:`, btn.dataset.username);
        attachRemoveHandler(btn);
    });

    // Add user handler
    const addUserBtn = modal.querySelector('#add-ignore-user-btn');
    const usernameInput = modal.querySelector('#ignore-username-input');

    const addUser = () => {
        const username = usernameInput.value.trim().replace(/^u\/|^\/u\//i, '');
        if (!username) {
            alert('Please enter a username');
            return;
        }

        if (userSettings.ignoredUsers.some(u => u.toLowerCase() === username.toLowerCase())) {
            alert(`u/${username} is already in the ignored list`);
            usernameInput.value = '';
            return;
        }

        // Add to list
        userSettings.ignoredUsers.push(username);
        saveSettings(userSettings);

        // Remove buttons for this user
        document.querySelectorAll(`.age-check-button[data-username="${username}"]`).forEach(btn => {
            btn.remove();
        });

        // Add to modal display
        const listContainer = modal.querySelector('.age-ignored-users-list');
        if (!listContainer) {
            // Create list if it doesn't exist
            const emptyMsg = modal.querySelector('.age-modal-content p[style*="text-align: center"]');
            if (emptyMsg) {
                emptyMsg.remove();
            }

            const newList = document.createElement('div');
            newList.className = 'age-ignored-users-list';
            newList.style.maxHeight = 'none';
            const botsSection = modal.querySelector('.age-modal-content > div[style*="border-top"]');
            if (botsSection) {
                botsSection.parentNode.insertBefore(newList, botsSection);
            } else {
                modal.querySelector('.age-modal-content').appendChild(newList);
            }
        }

        const listContainer2 = modal.querySelector('.age-ignored-users-list');
        const newItem = document.createElement('div');
        newItem.className = 'age-ignored-user-item';
        newItem.innerHTML = `
            <span class="age-ignored-user-name">u/${escapeHtml(username)}</span>
            <button class="age-ignored-user-remove" data-username="${escapeHtml(username)}">Remove</button>
        `;
        listContainer2.appendChild(newItem);

        // Attach remove handler
        attachRemoveHandler(newItem.querySelector('.age-ignored-user-remove'));

        // Update count
        const titleDiv = modal.querySelector('.age-modal-title');
        titleDiv.textContent = `Ignored Users (${userSettings.ignoredUsers.length})`;

        // Clear input
        usernameInput.value = '';

        // Show notification
        showNotificationBanner(`Added u/${username} to ignored users`, 2000);
    };

    addUserBtn.onclick = addUser;
    usernameInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            addUser();
        }
    };
}

function showTrackedSubredditsModal() {
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.width = '500px';
    modal.style.maxWidth = '500px';
    modal.style.maxHeight = '900px';
    modal.style.zIndex = ++zIndexCounter;

    const trackedSubs = userSettings.trackedSubreddits || [];

    let subsHTML = '';
    if (trackedSubs.length === 0) {
        subsHTML = '<p style="color: var(--av-text-muted); text-align: center; padding: 20px;">No tracked subreddits configured</p>';
    } else {
        subsHTML = `<div class="age-ignored-users-list" style="max-height: none;">
            ${trackedSubs.map(sub => `
                <div class="age-ignored-user-item">
                    <span class="age-ignored-user-name">r/${escapeHtml(sub)}</span>
                    <button class="age-ignored-user-remove" data-subreddit="${escapeHtml(sub)}">Remove</button>
                </div>
            `).join('')}
        </div>`;
    }

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Tracked Subreddits (${trackedSubs.length})</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <p style="color: var(--av-text-muted); margin-bottom: 15px;">
                Tracked subreddits are used in Deep Analysis to compare if users post different ages on your subs vs elsewhere.
            </p>

            <div style="margin-bottom: 20px; padding: 15px; background-color: var(--av-surface); border-radius: 6px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: var(--av-text);">Add Subreddit to Track</div>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="track-subreddit-input" class="age-settings-input"
                           placeholder="Enter subreddit name (with or without r/)"
                           style="flex: 1; font-family: monospace;">
                    <button class="age-modal-button" id="add-track-sub-btn">Add Subreddit</button>
                </div>
            </div>

            ${subsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="open-full-settings-subs">Open Full Settings</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username: 'tracked-subreddits' });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-buttons .secondary');
    const settingsBtn = modal.querySelector('#open-full-settings-subs');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    settingsBtn.onclick = () => {
        closeModal();
        showSettingsModal();
    };

    // Define remove handler for subreddits
    const attachRemoveHandler = (btn) => {
        btn.onclick = () => {
            const subreddit = btn.dataset.subreddit;
            const idx = userSettings.trackedSubreddits.findIndex(s => s.toLowerCase() === subreddit.toLowerCase());
            if (idx !== -1) {
                userSettings.trackedSubreddits.splice(idx, 1);
                saveSettings(userSettings);
                showNotificationBanner(`Removed r/${subreddit} from tracked subreddits`, 2000);
            }

            // Update the modal
            const subItem = btn.closest('.age-ignored-user-item');
            subItem.remove();

            // Update count in title
            const titleDiv = modal.querySelector('.age-modal-title');
            titleDiv.textContent = `Tracked Subreddits (${userSettings.trackedSubreddits.length})`;

            // If no more subs, show empty message
            if (userSettings.trackedSubreddits.length === 0) {
                const listContainer = modal.querySelector('.age-ignored-users-list');
                if (listContainer) {
                    listContainer.innerHTML = '<p style="color: var(--av-text-muted); text-align: center; padding: 20px;">No tracked subreddits configured</p>';
                }
            }
        };
    };

    // Attach remove handlers for existing items
    modal.querySelectorAll('.age-ignored-user-remove').forEach(attachRemoveHandler);

    // Add subreddit handler
    const addSubBtn = modal.querySelector('#add-track-sub-btn');
    const subInput = modal.querySelector('#track-subreddit-input');

    const addSub = () => {
        let subreddit = subInput.value.trim().replace(/^r\/|^\/r\//i, '').toLowerCase();
        if (!subreddit) {
            alert('Please enter a subreddit name');
            return;
        }

        if (userSettings.trackedSubreddits.some(s => s.toLowerCase() === subreddit)) {
            alert(`r/${subreddit} is already in the tracked list`);
            subInput.value = '';
            return;
        }

        // Add to list
        userSettings.trackedSubreddits.push(subreddit);
        saveSettings(userSettings);

        // Add to modal display
        const listContainer = modal.querySelector('.age-ignored-users-list');
        if (!listContainer) {
            // Create list if it doesn't exist
            const emptyMsg = modal.querySelector('.age-modal-content p[style*="text-align: center"]');
            if (emptyMsg) {
                emptyMsg.remove();
            }

            const newList = document.createElement('div');
            newList.className = 'age-ignored-users-list';
            newList.style.maxHeight = 'none';
            modal.querySelector('.age-modal-content').appendChild(newList);
        }

        const listContainer2 = modal.querySelector('.age-ignored-users-list');
        const newItem = document.createElement('div');
        newItem.className = 'age-ignored-user-item';
        newItem.innerHTML = `
            <span class="age-ignored-user-name">r/${escapeHtml(subreddit)}</span>
            <button class="age-ignored-user-remove" data-subreddit="${escapeHtml(subreddit)}">Remove</button>
        `;
        listContainer2.appendChild(newItem);

        // Attach remove handler
        attachRemoveHandler(newItem.querySelector('.age-ignored-user-remove'));

        // Update count
        const titleDiv = modal.querySelector('.age-modal-title');
        titleDiv.textContent = `Tracked Subreddits (${userSettings.trackedSubreddits.length})`;

        // Clear input
        subInput.value = '';

        // Show notification
        showNotificationBanner(`Added r/${subreddit} to tracked subreddits`, 2000);
    };

    addSubBtn.onclick = addSub;
    subInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            addSub();
        }
    };

}

function showSettingsModal() {
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.minWidth = '565px';
    modal.style.width = '565px';
    modal.style.height = '80vh';
    modal.style.zIndex = ++zIndexCounter;

    let scriptVersion = getScriptVersion();

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
                <div class="age-modal-title">Settings - Ver. ${scriptVersion}</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <!-- Cache Statistics -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">📊 Cache Statistics</div>

                <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: var(--av-text);">Profile Cache (Age Data)</div>
                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Cached Users</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.userCount;
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Total Cache Size</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.sizeFormatted;
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Total Posts Cached</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.totalPosts.toLocaleString();
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Average Posts per User</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.userCount > 0 ? stats.averagePosts : 0;
                        })()}</span>
                    </div>

                    ${(() => {
                        const stats = getCacheStatistics();
                        return stats.oldestCache ? `
                            <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                                <span class="analysis-stat-label">Oldest Entry</span>
                                <span class="analysis-stat-value">${stats.oldestCache.toLocaleDateString()}</span>
                            </div>
                            <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                                <span class="analysis-stat-label">Newest Entry</span>
                                <span class="analysis-stat-value">${stats.newestCache.toLocaleDateString()}</span>
                            </div>
                        ` : '';
                    })()}
                </div>

                <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: var(--av-text);">Button Cache (Display Text)</div>
                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Cached Buttons</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.buttonCacheCount;
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Button Cache Size</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.buttonCacheSizeFormatted;
                        })()}</span>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: var(--av-text);">Deleted Content Cache</div>
                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Restored Authors</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.deletedAuthorCount;
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Restored Content</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.deletedContentCount;
                        })()}</span>
                    </div>

                    <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                        <span class="analysis-stat-label">Cache Size</span>
                        <span class="analysis-stat-value">${(() => {
                            const stats = getCacheStatistics();
                            return stats.deletedContentCacheSizeFormatted;
                        })()}</span>
                    </div>
                </div>

                <div class="analysis-stat-row" style="border-bottom: none; padding: 4px 0;">
                    <span class="analysis-stat-label">API Token Status</span>
                    <span class="analysis-stat-value ${(() => {
                        const stats = getCacheStatistics();
                        return stats.hasToken ? 'success' : 'danger';
                    })()}">${(() => {
                        const stats = getCacheStatistics();
                        return stats.hasToken ? `Active (${stats.tokenAge || 'unknown age'})` : 'Not Set';
                    })()}</span>
                </div>

                <!-- Cache Clear Buttons -->
                <div class="age-settings-buttons-row" style="margin-top: 15px;">
                    <button class="age-modal-button danger" id="clear-profile-cache-btn">Clear Profile Cache</button>
                    <button class="age-modal-button danger" id="clear-button-cache-btn">Clear Button Cache</button>
                    <button class="age-modal-button danger" id="clear-deleted-content-btn">Clear Cached Deleted Content</button>
                    <button class="age-modal-button danger" id="clear-token-btn">Clear API Token</button>
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: 8px;">
                    Profile cache stores full age data. Button cache stores display text only.
                </span>
            </div>

            <!-- Theme Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">🎨 Theme & Colors</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Theme Preset</label>
                    <select class="age-settings-input" id="setting-theme-preset" style="width: 180px;">
                        <option value="default" ${userSettings.themePreset === 'default' ? 'selected' : ''}>Default Dark</option>
                        <option value="light" ${userSettings.themePreset === 'light' ? 'selected' : ''}>Light Mode</option>
                        <option value="high-contrast" ${userSettings.themePreset === 'high-contrast' ? 'selected' : ''}>High Contrast</option>
                        <option value="custom" ${userSettings.themePreset === 'custom' ? 'selected' : ''}>Custom Colors</option>
                    </select>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Button Color (Default)</label>
                    <input type="color" class="age-settings-input" id="setting-button-default-color"
                           value="${userSettings.buttonDefaultColor}" style="width: 80px; height: 40px;">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Button Color (Cached)</label>
                    <input type="color" class="age-settings-input" id="setting-button-cached-color"
                           value="${userSettings.buttonCachedColor}" style="width: 80px; height: 40px;">
                </div>

                <div id="custom-colors-section" style="display: ${userSettings.themePreset === 'custom' ? 'block' : 'none'}; margin-top: 15px; padding: 15px; background-color: var(--av-surface); border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 10px;">Custom Theme Colors</div>
                    ${Object.keys(DEFAULT_SETTINGS.customColors).map(colorKey => `
                        <div class="age-settings-row">
                            <label class="age-settings-label">${colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}</label>
                            <input type="color" class="age-settings-input custom-color-input"
                                   data-color-key="${colorKey}"
                                   value="${userSettings.customColors[colorKey]}"
                                   style="width: 80px; height: 40px;">
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- General Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">General Settings</div>


                <div class="age-settings-row">
                    <label class="age-settings-label">Enable Debug Mode</label>
                    <input type="checkbox" class="age-settings-checkbox" id="setting-debug"
                           ${userSettings.debugMode ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Button Text</label>
                    <input type="text" class="age-settings-input" id="setting-button-text"
                           value="${escapeHtml(userSettings.defaultButtonText)}"
                           style="width: 150px;" placeholder="PushShift">
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
                    <label class="age-settings-label">Pagination Fetch Limit</label>
                    <input type="number" class="age-settings-numberinput" id="setting-pagination-limit"
                           value="${userSettings.paginationLimit}" min="50" max="1000" step="50">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Minimum Potential Age for Analysis (years)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-min-potential-age"
                           value="${userSettings.minPotentialAge}" min="20" max="35" step="1">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    Only potential ages (non-bracketed) at or above this threshold will be included in Deep Analysis. Lower values may include false positives.
                </span>

                <div class="age-settings-row">
                    <label class="age-settings-label">Minimum Age Gap for Couples Detection (years)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-min-couples-gap"
                           value="${userSettings.minCouplesAgeGap}" min="4" max="10" step="1">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    Lower values (4-6) detect closer-age couples, higher (8-10) reduce false positives. Minimum: 4 years.
                </span>

                <div class="age-settings-row">
                    <label class="age-settings-label">Timeline Compression Min Entries (30-200):</label>
                    <input type="number" class="age-settings-numberinput" id="setting-timeline-min-entries"
                           value="${userSettings.timelineCompressionMinEntries}" min="30" max="200">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    Minimum total timeline entries before compression is applied. Lower = compression starts sooner.
                </span>

                <div class="age-settings-row">
                    <label class="age-settings-label">Deep Analysis Timeline Context Posts (1-5):</label>
                    <input type="number" class="age-settings-numberinput" id="setting-timeline-context"
                           value="${userSettings.timelineContextPosts}" min="1" max="5">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    Number of posts to show before/after age changes in timeline
                </span>

                <div class="age-settings-row">
                    <label class="age-settings-label">Timeline Compression Threshold (5-20):</label>
                    <input type="number" class="age-settings-numberinput" id="setting-timeline-threshold"
                           value="${userSettings.timelineCompressionThreshold}" min="5" max="20">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    Minimum consecutive same-age posts before compressing. Lower = more aggressive compression.
                </span>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Sort Order</label>
                    <select class="age-settings-input" id="setting-sort-order" style="width: 120px;">
                        <option value="oldest" ${userSettings.defaultSort === 'oldest' ? 'selected' : ''}>Oldest First</option>
                        <option value="newest" ${userSettings.defaultSort === 'newest' ? 'selected' : ''}>Newest First</option>
                    </select>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Show Restore Buttons for Deleted Authors</label>
                    <input type="checkbox" class="age-settings-checkbox"  id="showRestoreButtons"
                           ${userSettings.showRestoreButtons ? 'checked' : ''}>
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Auto-restore deleted authors (Future)</label>
                    <input type="checkbox" class="age-settings-checkbox"  id="autoRestoreDeletedAuthors"
                           ${userSettings.autoRestoreDeletedAuthors ? 'checked' : ''} disabled title="Future feature">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Restore All: Concurrent Workers</label>
                    <input type="number" class="age-settings-numberinput" id="setting-restore-workers"
                           value="${userSettings.restoreAllWorkers}" min="1" max="5">
                </div>

                <span class="age-settings-help-text" style="display: block; margin-top: -8px; margin-bottom: 12px;">
                    (1-5, higher = faster but more API load)
                </span>

            </div>

            <!-- Age Range Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Age Search Range</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Minimum Age</label>
                    <input type="number" class="age-settings-numberinput" id="setting-min-age"
                           value="${userSettings.minAge}" min="1" max="99">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Maximum Age</label>
                    <input type="number" class="age-settings-numberinput" id="setting-max-age"
                           value="${userSettings.maxAge}" min="1" max="99">
                </div>
            </div>

            <!-- Display Settings -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Display Settings</div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Title Snippet Length (characters)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-title-length"
                           value="${userSettings.titleSnippetLength}" min="50" max="500">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Body Snippet Length (characters)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-body-length"
                           value="${userSettings.bodySnippetLength}" min="50" max="1000">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Cache Expiration (days)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-cache-days"
                           value="${userSettings.cacheExpiration}" min="1" max="90">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Modal Width (pixels)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-modal-width"
                           value="${userSettings.modalWidth}" min="400" max="2000">
                </div>

                <div class="age-settings-row">
                    <label class="age-settings-label">Default Modal Height (pixels)</label>
                    <input type="number" class="age-settings-numberinput" id="setting-modal-height"
                           value="${userSettings.modalHeight}" min="300" max="2000">
                </div>
            </div>

            <!-- Tracked Subreddits -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">Tracked Subreddits</div>
                <p class="age-settings-help-text">Subreddits you moderate - used in Deep Analysis to detect if users post different ages on your subs vs elsewhere. Enter comma-separated names (with or without r/ prefix).</p>
                <textarea class="age-settings-input" id="setting-tracked-subs"
                          style="width: 100%; font-family: monospace; min-height: 80px; resize: vertical;"
                          placeholder="subreddit1, subreddit2, r/subreddit3">${(userSettings.trackedSubreddits || []).join(', ')}</textarea>
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
                ${ignoredUsersListHTML}<br />
                <p class="age-settings-help-text">Add usernames (one per line) to never show age check buttons for</p>
                <textarea class="age-settings-textarea" id="ignored-users-input"
                          placeholder="username1&#10;username2&#10;username3"></textarea>
                <div class="age-settings-buttons-row">
                    <button class="age-modal-button" id="add-ignored-users">Add Users</button>
                </div>
            </div>

            <!-- Custom Buttons -->
            <div class="age-settings-section">
                <div class="age-settings-section-title">🔘 Custom Action Buttons</div>
                <p class="age-settings-help-text">
                    Create custom buttons that appear in Results and Deep Analysis modals.<br>
                    Available placeholders: {{author}}, {{age_min}}, {{age_max}}, {{posted_ages}}, {{possible_ages}}
                </p>

                <div id="custom-buttons-list">
                    ${userSettings.customButtons.map((btn, idx) => `
                        <div class="custom-button-editor" data-index="${idx}" style="background-color: var(--av-surface); padding: 12px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid var(--av-primary);">
                            <!-- Header Row: Drag handle, checkboxes, and delete -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--av-border);">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <span class="custom-button-drag-handle" title="Drag to reorder">⋮⋮</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="checkbox" class="age-settings-checkbox custom-btn-enabled"
                                               ${btn.enabled ? 'checked' : ''} id="custombtn-enabled-${idx}">
                                        <label class="age-settings-label" for="custombtn-enabled-${idx}" style="flex: 0; margin: 0; font-size: 12px;">Enabled</label>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="checkbox" class="age-settings-checkbox custom-btn-context-menu"
                                               ${btn.showInContextMenu ? 'checked' : ''} id="custombtn-context-${idx}">
                                        <label class="age-settings-label" for="custombtn-context-${idx}" style="flex: 0; margin: 0; font-size: 12px;">Context Menu</label>
                                    </div>
                                </div>
                                <button class="age-modal-button danger" style="margin: 0; padding: 4px 12px; font-size: 11px;"
                                        onclick="this.closest('.custom-button-editor').remove()">Delete</button>
                            </div>

                            <!-- Row 1: Label and Type side-by-side -->
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Label</label>
                                    <input type="text" class="age-settings-input custom-btn-label"
                                           value="${escapeHtml(btn.label)}" style="width: 100%;">
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Type</label>
                                    <select class="age-settings-input custom-btn-type" style="width: 100%;">
                                        <option value="link" ${btn.type === 'link' || !btn.type ? 'selected' : ''}>Link (opens URL)</option>
                                        <option value="template" ${btn.type === 'template' ? 'selected' : ''}>Text Template (copy)</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Row 2: URL Template (full width, shown for link type) -->
                            <div class="custom-btn-url-row" style="display: ${btn.type === 'template' ? 'none' : 'flex'}; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                                <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">URL Template</label>
                                <input type="text" class="age-settings-input custom-btn-url"
                                       value="${escapeHtml(btn.urlTemplate || '')}" style="width: 100%; font-family: monospace; font-size: 11px;">
                            </div>

                            <!-- Row 2: Text Template (full width, shown for template type) -->
                            <div class="custom-btn-template-row" style="display: ${btn.type === 'template' ? 'flex' : 'none'}; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                                <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Text Template</label>
                                <textarea class="age-settings-input custom-btn-template"
                                          style="width: 100%; min-height: 100px; font-family: monospace; font-size: 11px; resize: vertical;">${escapeHtml(btn.textTemplate || '')}</textarea>
                            </div>

                            <!-- Row 3: Button Style (compact) -->
                            <div style="display: flex; flex-direction: column; gap: 4px; width: 200px;">
                                <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Button Style</label>
                                <select class="age-settings-input custom-btn-style" style="width: 100%;">
                                    <option value="primary" ${btn.style === 'primary' ? 'selected' : ''}>Primary (Blue)</option>
                                    <option value="secondary" ${btn.style === 'secondary' ? 'selected' : ''}>Secondary (Gray)</option>
                                    <option value="danger" ${btn.style === 'danger' ? 'selected' : ''}>Danger (Red)</option>
                                </select>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="age-settings-buttons-row">
                    <button class="age-modal-button" id="add-custom-button">Add New Button</button>
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

    // Theme preset change handler
    const themePresetSelect = modal.querySelector('#setting-theme-preset');
    const customColorsSection = modal.querySelector('#custom-colors-section');

    themePresetSelect.addEventListener('change', () => {
        customColorsSection.style.display = themePresetSelect.value === 'custom' ? 'block' : 'none';
    });

    saveBtn.onclick = () => {
        const oldSortOrder = userSettings.defaultSort;

        // Parse tracked subreddits - normalize by removing r/ prefix and trimming
        const trackedSubsInput = modal.querySelector('#setting-tracked-subs').value;
        const trackedSubreddits = trackedSubsInput
            .split(',')
            .map(s => s.trim().replace(/^r\/|^\/r\//i, '').toLowerCase())
            .filter(s => s.length > 0);

        const minCouplesGapInput = parseInt(modal.querySelector('#setting-min-couples-gap').value);
        const minCouplesGapValidated = Math.max(4, Math.min(10, minCouplesGapInput)); // Clamp to 4-10

        const timelineContextInput = parseInt(modal.querySelector('#setting-timeline-context').value);
        const timelineContextValidated = Math.max(1, Math.min(5, timelineContextInput)); // Clamp to 1-5

        const timelineThresholdInput = parseInt(modal.querySelector('#setting-timeline-threshold').value);
        const timelineThresholdValidated = Math.max(5, Math.min(20, timelineThresholdInput)); // Clamp to 5-20

        const timelineMinEntriesInput = parseInt(modal.querySelector('#setting-timeline-min-entries').value);
        const timelineMinEntriesValidated = Math.max(30, Math.min(200, timelineMinEntriesInput)); // Clamp to 30-200

        const customColors = {};
        modal.querySelectorAll('.custom-color-input').forEach(input => {
            customColors[input.dataset.colorKey] = input.value;
        });

        const newSettings = {
            defaultButtonText: modal.querySelector('#setting-button-text').value.trim() || 'PushShift',
            debugMode: modal.querySelector('#setting-debug').checked,
            themePreset: modal.querySelector('#setting-theme-preset').value,
            buttonDefaultColor: modal.querySelector('#setting-button-default-color').value,
            buttonCachedColor: modal.querySelector('#setting-button-cached-color').value,
            customColors: customColors,
            minAge: parseInt(modal.querySelector('#setting-min-age').value),
            maxAge: parseInt(modal.querySelector('#setting-max-age').value),
            enableVeryLowConfidence: modal.querySelector('#setting-very-low-confidence').checked,
            titleSnippetLength: parseInt(modal.querySelector('#setting-title-length').value),
            bodySnippetLength: parseInt(modal.querySelector('#setting-body-length').value),
            cacheExpiration: parseInt(modal.querySelector('#setting-cache-days').value),
            modalWidth: parseInt(modal.querySelector('#setting-modal-width').value),
            modalHeight: parseInt(modal.querySelector('#setting-modal-height').value),
            paginationLimit: parseInt(modal.querySelector('#setting-pagination-limit').value),
            minPotentialAge: parseInt(modal.querySelector('#setting-min-potential-age').value),
            showAgeEstimation: modal.querySelector('#setting-show-estimation').checked,
            defaultSort: modal.querySelector('#setting-sort-order').value,
            autoFilterPosted: modal.querySelector('#setting-auto-filter').checked,
            ignoredUsers: userSettings.ignoredUsers, // Keep existing
            trackedSubreddits: trackedSubreddits,
            showRestoreButtons: modal.querySelector('#showRestoreButtons').checked,
            autoRestoreDeletedAuthors: modal.querySelector('#autoRestoreDeletedAuthors').checked,
            minCouplesAgeGap: minCouplesGapValidated,
            timelineContextPosts: timelineContextValidated,
            timelineCompressionThreshold: timelineThresholdValidated,
            timelineCompressionMinEntries: timelineMinEntriesValidated,
            customButtons: [],
            commonBots: {}
        };

        // Collect common bots settings
        modal.querySelectorAll('.common-bot-checkbox').forEach(checkbox => {
            newSettings.commonBots[checkbox.dataset.bot] = checkbox.checked;
        });

        // Collect custom buttons
        modal.querySelectorAll('.custom-button-editor').forEach((editor, idx) => {
            const btnType = editor.querySelector('.custom-btn-type').value;
            newSettings.customButtons.push({
                id: `custom_btn_${Date.now()}_${idx}`,
                label: editor.querySelector('.custom-btn-label').value,
                type: btnType,
                urlTemplate: btnType === 'link' ? editor.querySelector('.custom-btn-url').value : '',
                textTemplate: btnType === 'template' ? editor.querySelector('.custom-btn-template').value : '',
                enabled: editor.querySelector('.custom-btn-enabled').checked,
                showInContextMenu: editor.querySelector('.custom-btn-context-menu').checked,
                style: editor.querySelector('.custom-btn-style').value
            });
        });

        const oldButtonText = userSettings.defaultButtonText;
        saveSettings(newSettings);

        // Update existing non-cached buttons if default text changed
        if (oldButtonText !== newSettings.defaultButtonText) {
            document.querySelectorAll('.age-check-button:not(.cached)').forEach(btn => {
                if (btn.textContent === oldButtonText) {
                    btn.textContent = newSettings.defaultButtonText;
                }
            });
        }

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

        showNotificationBanner('Settings saved! Please refresh the page for all changes to take effect.', 4000);
        //closeModal();
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
            .map(u => u.trim().replace(/^u\/|^\/u\//i, ''))
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

    const addCustomButtonBtn = modal.querySelector('#add-custom-button');
    console.log('Add button found:', addCustomButtonBtn); // Debug log
    if (addCustomButtonBtn) {
        addCustomButtonBtn.onclick = () => {
            console.log('Add button clicked!'); // Debug log
            const buttonsList = modal.querySelector('#custom-buttons-list');
            const newIndex = modal.querySelectorAll('.custom-button-editor').length;

            const newButtonHTML = `
                <div class="custom-button-editor" data-index="${newIndex}" style="background-color: var(--av-surface); padding: 12px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid var(--av-primary);">
                    <!-- Header Row: Drag handle, checkboxes, and delete -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--av-border);">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <span class="custom-button-drag-handle" title="Drag to reorder">⋮⋮</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="checkbox" class="age-settings-checkbox custom-btn-enabled"
                                       checked id="custombtn-enabled-${newIndex}">
                                <label class="age-settings-label" for="custombtn-enabled-${newIndex}" style="flex: 0; margin: 0; font-size: 12px;">Enabled</label>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="checkbox" class="age-settings-checkbox custom-btn-context-menu"
                                       id="custombtn-context-${newIndex}">
                                <label class="age-settings-label" for="custombtn-context-${newIndex}" style="flex: 0; margin: 0; font-size: 12px;">In Menu</label>
                            </div>
                        </div>
                        <button class="age-modal-button danger" style="margin: 0; padding: 4px 12px; font-size: 11px;"
                                onclick="this.closest('.custom-button-editor').remove()">Delete</button>
                    </div>

                    <!-- Row 1: Label and Type side-by-side -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Label</label>
                            <input type="text" class="age-settings-input custom-btn-label"
                                   value="New Button" style="width: 100%;">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Type</label>
                            <select class="age-settings-input custom-btn-type" style="width: 100%;">
                                <option value="link" selected>Link (opens URL)</option>
                                <option value="template">Text Template (copy)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Row 2: URL Template (full width, shown for link type) -->
                    <div class="custom-btn-url-row" style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                        <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">URL Template</label>
                        <input type="text" class="age-settings-input custom-btn-url"
                               value="https://example.com/{{author}}" style="width: 100%; font-family: monospace; font-size: 11px;">
                    </div>

                    <!-- Row 2: Text Template (full width, shown for template type) -->
                    <div class="custom-btn-template-row" style="display: none; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                        <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Text Template</label>
                        <textarea class="age-settings-input custom-btn-template"
                                  style="width: 100%; min-height: 100px; font-family: monospace; font-size: 11px; resize: vertical;"></textarea>
                    </div>

                    <!-- Row 3: Button Style (compact) -->
                    <div style="display: flex; flex-direction: column; gap: 4px; width: 200px;">
                        <label class="age-settings-label" style="font-size: 11px; font-weight: bold;">Button Style</label>
                        <select class="age-settings-input custom-btn-style" style="width: 100%;">
                            <option value="primary" selected>Primary (Blue)</option>
                            <option value="secondary">Secondary (Gray)</option>
                            <option value="danger">Danger (Red)</option>
                        </select>
                    </div>
                </div>
            `;

            buttonsList.insertAdjacentHTML('beforeend', newButtonHTML);
        };
    }

    const clearProfileCacheBtn = modal.querySelector('#clear-profile-cache-btn');
    clearProfileCacheBtn.onclick = () => {
        if (confirm('Clear all cached age verification data? This will remove full profile data for all users but keep button cache.')) {
            clearAllCache();

            // Refresh the settings modal to update statistics
            closeModal();
            showSettingsModal();
        }
    };

    const clearTokenBtn = modal.querySelector('#clear-token-btn');
    clearTokenBtn.onclick = () => {
        if (confirm('Clear stored API token? You will need to authorize again.')) {
            clearToken();
            closeModal();
            alert('API token cleared!');
        }
    };

    const clearButtonCacheBtn = modal.querySelector('#clear-button-cache-btn');
    clearButtonCacheBtn.onclick = () => {
        if (confirm('Clear all cached button text? Buttons will show "PushShift" until age is checked again.')) {
            clearButtonCache();

            // Update all cached buttons to show "PushShift"
            document.querySelectorAll('.age-check-button.cached').forEach(btn => {
                const username = btn.dataset.username;
                updateButtonForUser(username);
            });

            // Refresh the settings modal to update statistics
            closeModal();
            showSettingsModal();
        }
    };

    const clearDeletedContentBtn = modal.querySelector('#clear-deleted-content-btn');
    clearDeletedContentBtn.onclick = () => {
        if (confirm('Clear all restored deleted author usernames and content? This cannot be undone.')) {
            clearDeletedContentCache();
            showNotificationBanner('Deleted content cache cleared!', 2000);
            closeModal();
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

    // Drag and drop for custom buttons
    function setupDragAndDrop() {
        const buttonsList = modal.querySelector('#custom-buttons-list');
        if (!buttonsList) return;

        let draggedElement = null;

        // Make only the drag handle trigger drag
        modal.querySelectorAll('.custom-button-drag-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                const editor = handle.closest('.custom-button-editor');
                if (editor) {
                    editor.setAttribute('draggable', 'true');
                }
            });
        });

        buttonsList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('custom-button-editor')) {
                draggedElement = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.innerHTML);
            }
        });

        buttonsList.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('custom-button-editor')) {
                e.target.classList.remove('dragging');
                e.target.removeAttribute('draggable'); // Disable dragging after drop
            }
            buttonsList.querySelectorAll('.custom-button-editor').forEach(el => {
                el.classList.remove('drag-over');
            });
        });

        buttonsList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const afterElement = getDragAfterElement(buttonsList, e.clientY);
            const draggable = draggedElement;

            if (afterElement == null) {
                buttonsList.appendChild(draggable);
            } else {
                buttonsList.insertBefore(draggable, afterElement);
            }
        });

        buttonsList.addEventListener('dragenter', (e) => {
            if (e.target.classList.contains('custom-button-editor') && e.target !== draggedElement) {
                e.target.classList.add('drag-over');
            }
        });

        buttonsList.addEventListener('dragleave', (e) => {
            if (e.target.classList.contains('custom-button-editor')) {
                e.target.classList.remove('drag-over');
            }
        });

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.custom-button-editor:not(.dragging)')];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;

                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    setupDragAndDrop();

    // Type selector change handler
    function attachTypeChangeHandlers() {
        modal.querySelectorAll('.custom-btn-type').forEach(select => {
            select.addEventListener('change', function() {
                const editor = this.closest('.custom-button-editor');
                const urlRow = editor.querySelector('.custom-btn-url-row');
                const templateRow = editor.querySelector('.custom-btn-template-row');

                if (this.value === 'template') {
                    urlRow.style.display = 'none';
                    templateRow.style.display = 'flex';
                } else {
                    urlRow.style.display = 'flex';
                    templateRow.style.display = 'none';
                }
            });
        });
    }

    attachTypeChangeHandlers();

    // Re-setup drag and drop when adding new buttons
    const originalAddButtonHandler = addCustomButtonBtn.onclick;
    addCustomButtonBtn.onclick = () => {
        originalAddButtonHandler();
        setupDragAndDrop();
        attachTypeChangeHandlers();
    };

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
    delete buttonCache[username];
    GM_setValue('ageVerifierCache', JSON.stringify(ageCache));
    GM_setValue('ageVerifierButtonCache', JSON.stringify(buttonCache));
}

function clearAllCache() {
    GM_setValue('ageVerifierCache', '{}');
    Object.keys(ageCache).forEach(key => delete ageCache[key]);
}

function getButtonCacheText(username) {
    const cached = buttonCache[username];
    if (cached && Date.now() - cached.timestamp < BUTTON_CACHE_EXPIRATION) {
        return cached.text;
    }
    return null;
}

function setButtonCacheText(username, displayText) {
    buttonCache[username] = {
        text: displayText,
        timestamp: Date.now()
    };
    GM_setValue('ageVerifierButtonCache', JSON.stringify(buttonCache));
}

function clearButtonCache() {
    GM_setValue('ageVerifierButtonCache', '{}');
    Object.keys(buttonCache).forEach(key => delete buttonCache[key]);
}

function clearDeletedContentCache() {
    GM_setValue(DELETED_CONTENT_CACHE_KEY, '{}');
    logDebug('Deleted author cache cleared');
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
        params.append('size', userSettings.paginationLimit);
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

        // Calculate anomaly ratio for confidence determination
        const anomalyRatio = dataPoints.length > 1 ? anomalies.length / (dataPoints.length - 1) : 0;

        // Determine confidence - heavily penalize if major jump was detected
        if (hasMajorJump) {
            // Major jump detected = maximum Low confidence
            confidence = 'Low';
        } else if (dataPoints.length >= 10 && yearSpan >= 2 && rate >= 0.6 && rate <= 1.6 && consistencyScore >= 0.7 && anomalyRatio <= 0.05) {
            // High confidence: 10+ points, 2+ years, good rate, high consistency, <5% anomalies
            confidence = 'High';
        } else if (dataPoints.length >= 3 && yearSpan >= 2 && rate >= 0.7 && rate <= 1.5 && anomalyRatio <= 0.1) {
            // High confidence: 3+ points, 2+ years, good rate, <10% anomalies
            confidence = 'High';
        } else if (dataPoints.length >= 2 && yearSpan >= 1 && rate >= 0.6 && rate <= 1.6) {
            // Medium or Low based on anomaly ratio
            if (anomalyRatio > 0.2) {
                confidence = 'Low';  // >20% anomalies
            } else if (anomalyRatio > 0.1) {
                confidence = 'Medium';  // 10-20% anomalies
            } else {
                confidence = 'Medium';  // <10% anomalies
            }
        } else if (rate >= 0.5 && rate <= 2.0) {
            confidence = 'Low';
        } else {
            if (!ENABLE_VERY_LOW_CONFIDENCE) return null;
            confidence = 'Very Low';
        }

        // Note: We no longer downgrade High to Medium just because anomalies exist
        // The anomaly ratio is already factored into the confidence determination above
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
        filteredPossibleAges: ageData.possibleAges.filter(age => age >= userSettings.minPotentialAge),
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

    // Build timeline from results (posted + filtered potential ages)
    const timelinePoints = [];
    ageData.results.forEach(result => {
        // Add confirmed posted ages
        if (result.postedAges && result.postedAges.length > 0) {
            result.postedAges.forEach(age => {
                timelinePoints.push({
                    timestamp: result.timestamp,
                    date: result.date,
                    age: age,
                    isPotential: false,
                    subreddit: result.subreddit.toLowerCase(),
                    permalink: result.permalink
                });
            });
        }
        // Add potential ages if they meet threshold and aren't already posted
        if (result.possibleAges && result.possibleAges.length > 0) {
            result.possibleAges.forEach(age => {
                if (age >= userSettings.minPotentialAge && !result.postedAges.includes(age)) {
                    timelinePoints.push({
                        timestamp: result.timestamp,
                        date: result.date,
                        age: age,
                        isPotential: true,
                        subreddit: result.subreddit.toLowerCase(),
                        permalink: result.permalink
                    });
                }
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

    // Detect stale ages (same age for >1 year)
    analysis.staleAges = detectStaleAges(analysis.ageExtremes);

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

function detectStaleAges(ageExtremes) {
    const staleAges = [];

    if (!ageExtremes || !ageExtremes.ageOccurrences) {
        return staleAges;
    }

    const ONE_YEAR = 365.25 * 24 * 60 * 60; // seconds in a year

    Object.keys(ageExtremes.ageOccurrences).forEach(age => {
        const occurrence = ageExtremes.ageOccurrences[age];
        const timeSpan = occurrence.last.timestamp - occurrence.first.timestamp;
        const daysSpan = timeSpan / (24 * 60 * 60);
        const monthsSpan = daysSpan / 30.44; // average month length

        // Only flag if span is over 1 year (365 days)
        if (timeSpan > ONE_YEAR) {
            let severity;
            if (monthsSpan < 14) {
                severity = 'Low'; // 13-14 months - might be fudging birthday
            } else if (monthsSpan < 15) {
                severity = 'Medium'; // 14-15 months - getting suspicious
            } else {
                severity = 'High'; // 15+ months - major red flag
            }

            staleAges.push({
                age: parseInt(age),
                firstDate: occurrence.first.date,
                lastDate: occurrence.last.date,
                firstTimestamp: occurrence.first.timestamp,
                lastTimestamp: occurrence.last.timestamp,
                daysSpan: Math.round(daysSpan),
                monthsSpan: Math.round(monthsSpan * 10) / 10,
                postCount: occurrence.count,
                severity: severity,
                firstSubreddit: occurrence.first.subreddit,
                lastSubreddit: occurrence.last.subreddit,
                firstPermalink: occurrence.first.permalink,
                lastPermalink: occurrence.last.permalink
            });
        }
    });

    // Sort by severity and then by duration
    staleAges.sort((a, b) => {
        const severityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.monthsSpan - a.monthsSpan;
    });

    return staleAges;
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

    // Helper to extract numeric age from string (handles "~25" and "25")
    const extractNumericAge = (ageStr) => parseInt(ageStr.toString().replace('~', ''));

    if (trackedLower.length === 0) {
        // No tracked subs configured
        timelinePoints.forEach(point => {
            const ageKey = point.isPotential ? `~${point.age}` : `${point.age}`;
            result.other.ages.add(ageKey);
            result.other.posts.push(point);
            result.other.subreddits.add(point.subreddit);
        });
        return result;
    }

    timelinePoints.forEach(point => {
        const isTracked = trackedLower.includes(point.subreddit);
        const ageKey = point.isPotential ? `~${point.age}` : `${point.age}`;

        if (isTracked) {
            result.tracked.ages.add(ageKey);
            result.tracked.subreddits.add(point.subreddit);
            result.tracked.posts.push(point);
        } else {
            result.other.ages.add(ageKey);
            result.other.subreddits.add(point.subreddit);
            result.other.posts.push(point);
        }
    });

    // Convert Sets to arrays for comparison
    const trackedAges = Array.from(result.tracked.ages).sort((a, b) => extractNumericAge(a) - extractNumericAge(b));
    const otherAges = Array.from(result.other.ages).sort((a, b) => extractNumericAge(a) - extractNumericAge(b));

    if (trackedAges.length > 0) {
        result.trackedAgeRange = {
            min: Math.min(...trackedAges.map(extractNumericAge)),
            max: Math.max(...trackedAges.map(extractNumericAge)),
            ages: trackedAges
        };
    }

    if (otherAges.length > 0) {
        result.otherAgeRange = {
            min: Math.min(...otherAges.map(extractNumericAge)),
            max: Math.max(...otherAges.map(extractNumericAge)),
            ages: otherAges
        };
    }

    // Check for discrepancies
    if (trackedAges.length > 0 && otherAges.length > 0) {
        const trackedMin = Math.min(...trackedAges.map(extractNumericAge));
        const trackedMax = Math.max(...trackedAges.map(extractNumericAge));
        const otherMin = Math.min(...otherAges.map(extractNumericAge));
        const otherMax = Math.max(...otherAges.map(extractNumericAge));

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

    // If age gap is less than configured threshold, unlikely to be couples (could just be inconsistent posting)
    const minGapThreshold = userSettings.minCouplesAgeGap || 10;
    if (avgAgeGap < minGapThreshold) {
        result.explanation = `Age gap between clusters (${avgAgeGap.toFixed(1)} years) too small for couples detection (threshold: ${minGapThreshold} years)`;
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
                // Calculate how long they stayed at the NEW age
                let newAgeSpan = 0;
                for (let j = i; j < sorted.length && sorted[j].age === sorted[i].age; j++) {
                    newAgeSpan = sorted[j].timestamp - sorted[i].timestamp;
                }

                // Only count as birthday if they stayed at new age for 7+ days
                // (filters out 0-day typos but allows real birthdays)
                const MIN_AGE_DURATION = 7 * 24 * 60 * 60; // 7 days
                if (newAgeSpan >= MIN_AGE_DURATION || i === sorted.length - 1) {
                    // Also accept if this is their current/latest age
                    birthdayTransitions.push({
                        age: sorted[i].age,
                        timestamp: sorted[i].timestamp,
                        prevEnd: sorted[i - 1].timestamp,
                        gap: sorted[i].timestamp - sorted[i - 1].timestamp
                    });
                }
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
        return estimateBirthdayFromPatterns(sorted, ageSpans);
    }

    // Calculate estimated birthday months AND day ranges from transitions
    const birthdayEstimates = birthdayTransitions.map(t => {
        // Birthday likely occurred between prevEnd and timestamp
        const startDate = new Date(t.prevEnd * 1000);
        const endDate = new Date(t.timestamp * 1000);

        return {
            month: startDate.getMonth(), // Use start of range for month
            year: startDate.getFullYear(),
            startDay: startDate.getDate(),
            endDay: endDate.getDate(),
            startDate: startDate,
            endDate: endDate,
            gapDays: Math.round(t.gap / (24 * 60 * 60)),
            confidence: t.gap < (30 * 24 * 60 * 60) ? 'High' :
            t.gap < (90 * 24 * 60 * 60) ? 'Medium' : 'Low'
        };
    });

    // Legacy: keep birthdayMonths for month-level logic
    const birthdayMonths = birthdayEstimates.map(e => ({
        month: e.month,
        year: e.year,
        confidence: e.confidence
    }));

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

    // Calculate day range if High confidence and enough tight transitions
    let dayRange = null;
    if (confidence === 'High' && peakMonths.length === 1) {
        const targetMonth = peakMonths[0];

        // Get estimates for the target month with gaps < 30 days
        const tightEstimates = birthdayEstimates.filter(e =>
                                                        e.month === targetMonth && e.gapDays <= 30
                                                       );

        if (tightEstimates.length >= 2) {
            // Find overlapping day ranges
            const dayRanges = tightEstimates.map(e => ({
                start: e.startDay,
                end: e.endDay
            }));

            // Find the intersection or tight cluster
            const allDays = new Set();
            dayRanges.forEach(range => {
                for (let day = range.start; day <= range.end; day++) {
                    allDays.add(day);
                }
            });

            // Count how many ranges include each day
            const dayCounts = {};
            Array.from(allDays).forEach(day => {
                dayCounts[day] = dayRanges.filter(r =>
                                                  day >= r.start && day <= r.end
                                                 ).length;
            });

            // Find days that appear in multiple ranges (consensus)
            const threshold = Math.max(2, Math.floor(tightEstimates.length * 0.5));
            const consensusDays = Object.keys(dayCounts)
            .filter(d => dayCounts[d] >= threshold)
            .map(d => parseInt(d))
            .sort((a, b) => a - b);

            if (consensusDays.length > 0 && consensusDays.length <= 15) {
                // Use consensus range if it's reasonable (≤15 days)
                dayRange = {
                    start: Math.min(...consensusDays),
                    end: Math.max(...consensusDays),
                    transitionsUsed: tightEstimates.length
                };
            } else if (tightEstimates.length >= 3) {
                // Fall back to tightest range if we have 3+ transitions
                const sortedByGap = tightEstimates.sort((a, b) => a.gapDays - b.gapDays);
                const tightest = sortedByGap[0];
                if (tightest.gapDays <= 14) {
                    dayRange = {
                        start: tightest.startDay,
                        end: tightest.endDay,
                        transitionsUsed: 1,
                        note: 'Based on tightest transition'
                    };
                }
            }
        }
    }

    return formatBirthdayEstimate(peakMonths, confidence, birthdayTransitions.length, dayRange);
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

function formatBirthdayEstimate(monthData, confidence, transitionCount = 1, dayRange = null) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    if (Array.isArray(monthData)) {
        // Multiple months
        if (monthData.length === 1) {
            let rangeText = monthNames[monthData[0]];
            if (dayRange && dayRange.start && dayRange.end) {
                if (dayRange.start === dayRange.end) {
                    rangeText = `${monthNames[monthData[0]]} ${dayRange.start}`;
                } else {
                    rangeText = `${monthNames[monthData[0]]} ${dayRange.start}-${dayRange.end}`;
                }
            }

            return {
                confidence,
                month: monthNames[monthData[0]],
                range: rangeText,
                transitionCount,
                dayRange: dayRange
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

    const sorted = [...timelinePoints].sort((a, b) => a.timestamp - b.timestamp);
    const totalTransitions = sorted.length - 1;

    if (totalTransitions === 0) return 100;

    let anomalyCount = 0;

    // Count backwards aging anomalies
    anomalyCount += backwardsAging.length;

    // Count unrealistic aging rate anomalies
    let unrealisticRates = 0;
    for (let i = 1; i < sorted.length; i++) {
        const timeDiff = (sorted[i].timestamp - sorted[i-1].timestamp) / (365.25 * 24 * 60 * 60);
        const ageDiff = sorted[i].age - sorted[i-1].age;

        if (timeDiff > 0) {
            const rate = ageDiff / timeDiff;
            // Flag unrealistic rates (aging faster than 2x or backwards)
            if (rate > 2 || rate < -0.5) {
                unrealisticRates++;
            }
        }
    }

    // Total anomalies (but don't double-count backwards aging)
    // Backwards aging will also be caught by unrealistic rates, so use the max
    const totalAnomalies = Math.max(backwardsAging.length, unrealisticRates);

    // Calculate anomaly percentage
    const anomalyPercentage = (totalAnomalies / totalTransitions) * 100;

    // Score based on percentage of clean transitions
    let score;
    if (anomalyPercentage === 0) {
        score = 100;  // Perfect
    } else if (anomalyPercentage < 1) {
        score = 95;   // Excellent (>99% consistent)
    } else if (anomalyPercentage < 5) {
        score = 85;   // Very good (95-99% consistent)
    } else if (anomalyPercentage < 10) {
        score = 70;   // Good (90-95% consistent)
    } else if (anomalyPercentage < 20) {
        score = 50;   // Fair (80-90% consistent)
    } else if (anomalyPercentage < 30) {
        score = 30;   // Poor (70-80% consistent)
    } else {
        score = 10;   // Very poor (<70% consistent)
    }

    // Additional penalty for extreme age spread (likely multiple people or falsification)
    const ages = timelinePoints.map(p => p.age);
    const spread = Math.max(...ages) - Math.min(...ages);
    if (spread > 10) {
        score = Math.max(0, score - 20);  // Large age spread is suspicious
    } else if (spread > 5) {
        score = Math.max(0, score - 10);  // Moderate spread
    }

    return Math.round(score);
}

function getCacheStatistics() {
    const stats = {
        userCount: 0,
        totalSize: 0,
        sizeFormatted: '0 KB',
        totalPosts: 0,
        oldestCache: null,
        newestCache: null,
        averagePosts: 0,
        buttonCacheCount: 0,
        buttonCacheSize: 0,
        buttonCacheSizeFormatted: '0 KB',
        hasToken: apiToken !== null,
        tokenAge: null
    };

    const users = Object.keys(ageCache);
    stats.userCount = users.length;

    if (stats.userCount > 0) {
        let oldestTimestamp = Date.now();
        let newestTimestamp = 0;
        let totalPosts = 0;

        users.forEach(username => {
            const cached = ageCache[username];
            if (cached.timestamp < oldestTimestamp) {
                oldestTimestamp = cached.timestamp;
            }
            if (cached.timestamp > newestTimestamp) {
                newestTimestamp = cached.timestamp;
            }
            if (cached.data && cached.data.results) {
                totalPosts += cached.data.results.length;
            }
        });

        stats.oldestCache = new Date(oldestTimestamp);
        stats.newestCache = new Date(newestTimestamp);
        stats.totalPosts = totalPosts;
        stats.averagePosts = Math.round(totalPosts / stats.userCount);
    }

    // Calculate cache size
    const cacheString = JSON.stringify(ageCache);
    stats.totalSize = cacheString.length;

    // Calculate button cache stats
    const buttonCacheUsers = Object.keys(buttonCache);
    stats.buttonCacheCount = buttonCacheUsers.length;
    const buttonCacheString = JSON.stringify(buttonCache);
    stats.buttonCacheSize = buttonCacheString.length;

    if (stats.buttonCacheSize < 1024) {
        stats.buttonCacheSizeFormatted = stats.buttonCacheSize + ' B';
    } else if (stats.buttonCacheSize < 1024 * 1024) {
        stats.buttonCacheSizeFormatted = (stats.buttonCacheSize / 1024).toFixed(2) + ' KB';
    } else {
        stats.buttonCacheSizeFormatted = (stats.buttonCacheSize / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // Format size
    if (stats.totalSize < 1024) {
        stats.sizeFormatted = stats.totalSize + ' B';
    } else if (stats.totalSize < 1024 * 1024) {
        stats.sizeFormatted = (stats.totalSize / 1024).toFixed(2) + ' KB';
    } else {
        stats.sizeFormatted = (stats.totalSize / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // Check token age
    const tokenData = JSON.parse(GM_getValue('pushShiftToken', 'null'));
    if (tokenData && tokenData.timestamp) {
        const tokenAge = Date.now() - tokenData.timestamp;
        const hoursOld = Math.floor(tokenAge / (1000 * 60 * 60));
        const minutesOld = Math.floor((tokenAge % (1000 * 60 * 60)) / (1000 * 60));
        stats.tokenAge = `${hoursOld}h ${minutesOld}m`;
    }

    // Deleted author cache stats
    const deletedContentCache = getDeletedContentCache();
    const cacheEntries = Object.values(deletedContentCache);

    // Count unique authors (deduplicate by username)
    const uniqueAuthors = new Set();
    cacheEntries.forEach(entry => {
        const username = typeof entry === 'string' ? entry : entry?.username;
        if (username && username !== '[deleted]') {
            uniqueAuthors.add(username);
        }
    });
    stats.deletedAuthorCount = uniqueAuthors.size;

    // Count restored content (body or selftext that's not deleted/removed)
    stats.deletedContentCount = cacheEntries.filter(entry => {
        if (typeof entry !== 'object') return false;
        const hasBody = entry.body && entry.body !== '[deleted]' && entry.body !== '[removed]';
        const hasSelftext = entry.selftext && entry.selftext !== '[deleted]' && entry.selftext !== '[removed]';
        return hasBody || hasSelftext;
    }).length;

    const deletedContentCacheString = JSON.stringify(deletedContentCache);
    stats.deletedContentCacheSize = deletedContentCacheString.length;

    if (stats.deletedContentCacheSize < 1024) {
        stats.deletedContentCacheSizeFormatted = stats.deletedContentCacheSize + ' B';
    } else if (stats.deletedContentCacheSize < 1024 * 1024) {
        stats.deletedContentCacheSizeFormatted = (stats.deletedContentCacheSize / 1024).toFixed(2) + ' KB';
    } else {
        stats.deletedContentCacheSizeFormatted = (stats.deletedContentCacheSize / (1024 * 1024)).toFixed(2) + ' MB';
    }

    return stats;
}

// ============================================================================
// POST FREQUENCY ANALYSIS - NEW FEATURE
// ============================================================================
// Insert this section after the "PAGINATION SUPPORT" section

// Fetch user posting frequency data
function searchUserFrequency(username, kind = 'comment') {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const params = new URLSearchParams();
        params.append('author', username);
        params.append('exact_author', 'true');
        params.append('html_decode', 'True');
        params.append('size', '500');
        params.append('sort', 'created_utc');
        params.append('order', 'desc'); // Newest first

        const endpoint = kind === 'comment' ? 'comment' : 'submission';
        const url = `${PUSHSHIFT_API_BASE}/reddit/search/${endpoint}/?${params}`;

        logDebug(`Frequency request for ${username} (${kind})`);

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
                    logDebug(`Frequency returned ${results.length} ${kind}s`);
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

// Detect consecutive posting streaks
function detectPostingStreaks(sortedItems, intervals) {
    if (!intervals || intervals.length === 0) {
        return [];
    }

    const streaks = [];
    let currentStreak = {
        startIndex: 0,
        endIndex: 0,
        posts: 1,
        intervals: [],
        totalDuration: 0
    };

    const RAPID_THRESHOLD = 120; // 2 minutes - posting faster than this = rapid
    const BREAK_THRESHOLD = 600; // 10 minutes - gap longer than this = streak break

    for (let i = 0; i < intervals.length; i++) {
        const interval = intervals[i];

        if (interval <= RAPID_THRESHOLD) {
            // Continue streak
            currentStreak.endIndex = i + 1;
            currentStreak.posts++;
            currentStreak.intervals.push(interval);
            currentStreak.totalDuration += interval;
        } else if (interval > BREAK_THRESHOLD) {
            // Streak broken - save if significant
            if (currentStreak.posts >= 10) { // At least 10 posts in streak
                const avgInterval = currentStreak.totalDuration / currentStreak.intervals.length;
                const durationMinutes = currentStreak.totalDuration / 60;

                streaks.push({
                    posts: currentStreak.posts,
                    duration: currentStreak.totalDuration,
                    durationMinutes: durationMinutes,
                    avgInterval: avgInterval,
                    startIndex: currentStreak.startIndex,
                    endIndex: currentStreak.endIndex,
                    breakDuration: interval
                });
            }

            // Start new streak
            currentStreak = {
                startIndex: i + 1,
                endIndex: i + 1,
                posts: 1,
                intervals: [],
                totalDuration: 0
            };
        } else {
            // Medium-speed posting (2-10 min) - continue streak but don't count as rapid
            currentStreak.endIndex = i + 1;
            currentStreak.posts++;
            currentStreak.intervals.push(interval);
            currentStreak.totalDuration += interval;
        }
    }

    // Check final streak
    if (currentStreak.posts >= 10) {
        const avgInterval = currentStreak.intervals.length > 0
            ? currentStreak.totalDuration / currentStreak.intervals.length
            : 0;
        const durationMinutes = currentStreak.totalDuration / 60;

        streaks.push({
            posts: currentStreak.posts,
            duration: currentStreak.totalDuration,
            durationMinutes: durationMinutes,
            avgInterval: avgInterval,
            startIndex: currentStreak.startIndex,
            endIndex: currentStreak.endIndex,
            breakDuration: null
        });
    }

    return streaks;
}

// Analyze frequency patterns
function analyzeFrequency(items) {
    if (!items || items.length === 0) {
        return null;
    }

    // Sort by timestamp (newest first)
    const sorted = [...items].sort((a, b) => b.created_utc - a.created_utc);

    // Calculate intervals (in seconds)
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i - 1].created_utc - sorted[i].created_utc);
    }

    if (intervals.length === 0) {
        return {
            count: sorted.length,
            intervals: [],
            stats: null,
            bursts: { within5m: 0, within15m: 0, within1hr: 0 },
            timePatterns: { hourly: [], daily: [] },
            suspiciousPatterns: [],
            subredditDist: {}
        };
    }

    // Basic statistics
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const median = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    // Regularity score (0-100, higher = more regular/bot-like)
    const regularityScore = Math.max(0, Math.min(100, 100 * (1 - Math.min(coefficientOfVariation, 1))));

    // Burst detection (exclusive buckets with finer granularity)
    const within10s = intervals.filter(i => i <= 10).length;
    const within30s = intervals.filter(i => i > 10 && i <= 30).length;
    const within60s = intervals.filter(i => i > 30 && i <= 60).length;
    const within5m = intervals.filter(i => i > 60 && i <= 300).length;
    const within15m = intervals.filter(i => i > 300 && i <= 900).length;
    const within1hr = intervals.filter(i => i > 900 && i <= 3600).length;

    const bursts = {
        within10s: within10s,
        within30s: within30s,
        within60s: within60s,
        within5m: within5m,
        between5and15m: within15m,
        between15mand1hr: within1hr,
        total10s: within10s,
        total30s: within10s + within30s,
        total60s: within10s + within30s + within60s,
        total5m: within10s + within30s + within60s + within5m,
        total15m: within10s + within30s + within60s + within5m + within15m,
        total1hr: within10s + within30s + within60s + within5m + within15m + within1hr
    };

    // Time patterns (hour of day, day of week)
    const hourly = new Array(24).fill(0);
    const daily = new Array(7).fill(0);
    sorted.forEach(item => {
        const date = new Date(item.created_utc * 1000);
        hourly[date.getUTCHours()]++;
        daily[date.getUTCDay()]++;
    });

    // Detect consecutive posting streaks
    const streaks = detectPostingStreaks(sorted, intervals);

    // Suspicious patterns
    const suspiciousPatterns = [];

    // Check for interval clustering (many posts within tight range)
    const clusterRanges = [
        { min: 0, max: 15, label: '0-15s' },
        { min: 15, max: 30, label: '15-30s' },
        { min: 30, max: 60, label: '30-60s' },
        { min: 60, max: 120, label: '1-2m' }
    ];

    clusterRanges.forEach(range => {
        const count = intervals.filter(i => i >= range.min && i < range.max).length;
        const percentage = (count / intervals.length) * 100;

        // Lower threshold: flag if 20+ posts OR 5%+ of total
        if (count >= 20 && percentage >= 5) {
            suspiciousPatterns.push({
                type: 'interval_clustering',
                description: `${count} posts clustered in ${range.label} range (${percentage.toFixed(1)}%)`,
                severity: percentage >= 30 ? 'high' : percentage >= 15 ? 'medium' : 'low'
            });
        }
    });

    // Check for very high burst percentage
    const rapidBurstPct = ((within10s + within30s + within60s) / intervals.length) * 100;
    if (rapidBurstPct >= 50) {
        suspiciousPatterns.push({
            type: 'extreme_bursting',
            description: `${rapidBurstPct.toFixed(1)}% of posts within 60 seconds of previous post`,
            severity: rapidBurstPct >= 70 ? 'high' : 'medium'
        });
    }

    // Check for marathon streaks
    const marathonStreaks = streaks.filter(s => s.posts >= 50 || s.durationMinutes >= 60);
    if (marathonStreaks.length > 0) {
        const longest = marathonStreaks.reduce((max, s) => s.posts > max.posts ? s : max);
        suspiciousPatterns.push({
            type: 'marathon_posting',
            description: `Marathon streak: ${longest.posts} posts over ${longest.durationMinutes.toFixed(0)} minutes (avg ${longest.avgInterval.toFixed(0)}s apart)`,
            severity: longest.posts >= 100 ? 'high' : 'medium'
        });
    }

    // Check for exact interval repetition
    const intervalCounts = {};
    intervals.forEach(interval => {
        // For intervals < 60s, don't round (keep exact seconds)
        // For intervals >= 60s, round to nearest 10 seconds
        let rounded;
        if (interval < 60) {
            rounded = Math.round(interval); // Keep exact seconds
        } else {
            rounded = Math.round(interval / 10) * 10; // Round to nearest 10s
        }
        intervalCounts[rounded] = (intervalCounts[rounded] || 0) + 1;
    });

    Object.keys(intervalCounts).forEach(interval => {
        const count = intervalCounts[interval];
        const percentage = (count / intervals.length) * 100;
        if (count >= 5 && percentage >= 10) {
            const intVal = parseInt(interval);
            let displayInterval;

            if (intVal < 60) {
                displayInterval = `${intVal}s`;
            } else if (intVal < 3600) {
                const mins = Math.floor(intVal / 60);
                const secs = intVal % 60;
                displayInterval = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
            } else {
                displayInterval = `${(intVal / 3600).toFixed(1)}h`;
            }

            suspiciousPatterns.push({
                type: 'exact_interval',
                description: `${count} posts at ~${displayInterval} intervals (${percentage.toFixed(1)}%)`,
                severity: percentage >= 30 ? 'high' : percentage >= 20 ? 'medium' : 'low'
            });
        }
    });

    // Check for no sleep hours (2am-7am UTC)
    const sleepHours = hourly.slice(2, 7);
    const sleepTotal = sleepHours.reduce((a, b) => a + b, 0);
    const sleepPercentage = (sleepTotal / sorted.length) * 100;
    if (sleepPercentage < 5 && sorted.length >= 50) {
        suspiciousPatterns.push({
            type: 'no_sleep',
            description: `Only ${sleepPercentage.toFixed(1)}% of posts during 2am-7am UTC (sleep hours)`,
            severity: sleepPercentage < 2 ? 'high' : 'medium'
        });
    }

    // Subreddit distribution
    const subredditDist = {};
    sorted.forEach(item => {
        const sub = item.subreddit || 'unknown';
        subredditDist[sub] = (subredditDist[sub] || 0) + 1;
    });

    // Sort subreddits by frequency
    const sortedSubs = Object.entries(subredditDist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20); // Top 20

    // Time span
    const timeSpan = sorted[0].created_utc - sorted[sorted.length - 1].created_utc;
    const timeSpanDays = timeSpan / (24 * 60 * 60);

    return {
        count: sorted.length,
        intervals: intervals,
        timeSpan: timeSpan,
        timeSpanDays: timeSpanDays,
        stats: {
            mean: mean,
            median: median,
            stdDev: stdDev,
            min: Math.min(...intervals),
            max: Math.max(...intervals),
            coefficientOfVariation: coefficientOfVariation,
            regularityScore: regularityScore
        },
        bursts: bursts,
        streaks: streaks,
        timePatterns: {
            hourly: hourly,
            daily: daily
        },
        suspiciousPatterns: suspiciousPatterns,
        subredditDist: sortedSubs
    };
}

// Build frequency modal sections
function buildFrequencyOverview(analysis, kind) {
    if (!analysis) {
        return `<p style="color: var(--av-text-muted);">No ${kind}s found.</p>`;
    }

    const kindLabel = kind === 'comment' ? 'Comments' : 'Posts';

    return `
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Total ${kindLabel}</span>
            <span class="analysis-stat-value">${analysis.count}</span>
        </div>
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Time Span</span>
            <span class="analysis-stat-value">${analysis.timeSpanDays.toFixed(1)} days</span>
        </div>
        ${analysis.stats ? `
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Mean Interval</span>
            <span class="analysis-stat-value">${formatDuration(analysis.stats.mean)}</span>
        </div>
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Median Interval</span>
            <span class="analysis-stat-value">${formatDuration(analysis.stats.median)}</span>
        </div>
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Std Deviation</span>
            <span class="analysis-stat-value">${formatDuration(analysis.stats.stdDev)}</span>
        </div>
        <div class="analysis-stat-row">
            <span class="analysis-stat-label">Regularity Score</span>
            <span class="analysis-stat-value ${
                analysis.stats.regularityScore >= 70 ? 'warning' :
                analysis.stats.regularityScore >= 50 ? 'info' : 'success'
            }">${analysis.stats.regularityScore.toFixed(0)}/100 ${
                analysis.stats.regularityScore >= 70 ? '⚠️ Bot-like' : ''
            }</span>
        </div>
        ` : ''}
    `;
}

function buildFrequencyBursts(analysis) {
    if (!analysis || !analysis.bursts) {
        return '';
    }

    const pct10s = analysis.intervals.length > 0
        ? ((analysis.bursts.within10s / analysis.intervals.length) * 100).toFixed(1) : '0.0';
    const pct30s = analysis.intervals.length > 0
        ? ((analysis.bursts.within30s / analysis.intervals.length) * 100).toFixed(1) : '0.0';
    const pct60s = analysis.intervals.length > 0
        ? ((analysis.bursts.within60s / analysis.intervals.length) * 100).toFixed(1) : '0.0';
    const pct5m = analysis.intervals.length > 0
        ? ((analysis.bursts.within5m / analysis.intervals.length) * 100).toFixed(1) : '0.0';
    const pct15m = analysis.intervals.length > 0
        ? ((analysis.bursts.between5and15m / analysis.intervals.length) * 100).toFixed(1) : '0.0';
    const pct1hr = analysis.intervals.length > 0
        ? ((analysis.bursts.between15mand1hr / analysis.intervals.length) * 100).toFixed(1) : '0.0';

    // Highlight dangerous levels
    const danger10s = analysis.bursts.within10s > 50;
    const danger30s = analysis.bursts.total30s > 100;
    const danger60s = analysis.bursts.total60s > 200;

    return `
        <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: var(--av-text);">Seconds-Level Bursts (Bot Indicators)</div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">≤ 10 seconds apart</span>
                <span class="analysis-stat-value ${danger10s ? 'danger' : ''}">${analysis.bursts.within10s} (${pct10s}%)${danger10s ? ' ⚠️' : ''}</span>
            </div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">10-30 seconds apart</span>
                <span class="analysis-stat-value ${danger30s ? 'warning' : ''}">${analysis.bursts.within30s} (${pct30s}%)${danger30s && !danger10s ? ' ⚠️' : ''}</span>
            </div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">30-60 seconds apart</span>
                <span class="analysis-stat-value ${danger60s ? 'warning' : ''}">${analysis.bursts.within60s} (${pct60s}%)${danger60s && !danger30s ? ' ⚠️' : ''}</span>
            </div>
            <div class="analysis-stat-row" style="border-top: 1px solid var(--av-border); margin-top: 4px; padding-top: 4px;">
                <span class="analysis-stat-label">Total ≤ 60 seconds</span>
                <span class="analysis-stat-value ${danger60s ? 'danger' : 'info'}">${analysis.bursts.total60s} (${((analysis.bursts.total60s / analysis.intervals.length) * 100).toFixed(1)}%)</span>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: var(--av-text);">Minute-Level Bursts</div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">1-5 minutes apart</span>
                <span class="analysis-stat-value">${analysis.bursts.within5m} (${pct5m}%)</span>
            </div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">5-15 minutes apart</span>
                <span class="analysis-stat-value">${analysis.bursts.between5and15m} (${pct15m}%)</span>
            </div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">15-60 minutes apart</span>
                <span class="analysis-stat-value">${analysis.bursts.between15mand1hr} (${pct1hr}%)</span>
            </div>
            <div class="analysis-stat-row" style="border-top: 1px solid var(--av-border); margin-top: 4px; padding-top: 4px;">
                <span class="analysis-stat-label">Total ≤ 1 hour</span>
                <span class="analysis-stat-value info">${analysis.bursts.total1hr} (${((analysis.bursts.total1hr / analysis.intervals.length) * 100).toFixed(1)}%)</span>
            </div>
        </div>
    `;
}

function buildFrequencyTimePatterns(analysis) {
    if (!analysis || !analysis.timePatterns) {
        return '';
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxHourly = Math.max(...analysis.timePatterns.hourly);
    const maxDaily = Math.max(...analysis.timePatterns.daily);

    // Find peak hours
    const peakHour = analysis.timePatterns.hourly.indexOf(maxHourly);
    const peakDay = analysis.timePatterns.daily.indexOf(maxDaily);

    // Simple bar chart using unicode blocks
    const hourlyBars = analysis.timePatterns.hourly.map((count, hour) => {
        const barLength = maxHourly > 0 ? Math.round((count / maxHourly) * 20) : 0;
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        const percentage = analysis.count > 0 ? ((count / analysis.count) * 100).toFixed(1) : '0.0';
        return `<div style="font-family: monospace; font-size: 11px; line-height: 1.4;">
            ${hour.toString().padStart(2, '0')}:00 ${bar} ${count.toString().padStart(4)} (${percentage}%)
        </div>`;
    }).join('');

    const dailyBars = analysis.timePatterns.daily.map((count, day) => {
        const barLength = maxDaily > 0 ? Math.round((count / maxDaily) * 20) : 0;
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        const percentage = analysis.count > 0 ? ((count / analysis.count) * 100).toFixed(1) : '0.0';
        return `<div style="font-family: monospace; font-size: 11px; line-height: 1.4;">
            ${days[day]} ${bar} ${count.toString().padStart(4)} (${percentage}%)
        </div>`;
    }).join('');

    return `
        <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Peak Activity</div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">Peak Hour</span>
                <span class="analysis-stat-value info">${peakHour}:00 UTC (${maxHourly} posts)</span>
            </div>
            <div class="analysis-stat-row">
                <span class="analysis-stat-label">Peak Day</span>
                <span class="analysis-stat-value info">${days[peakDay]} (${maxDaily} posts)</span>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Posts by Hour (UTC)</div>
            ${hourlyBars}
        </div>

        <div>
            <div style="font-weight: bold; margin-bottom: 8px;">Posts by Day of Week</div>
            ${dailyBars}
        </div>
    `;
}

function buildFrequencyStreaks(analysis) {
    if (!analysis || !analysis.streaks || analysis.streaks.length === 0) {
        return '<p style="color: var(--av-success);">✓ No extended rapid-posting marathons detected.</p>';
    }

    const streaksHTML = analysis.streaks.map((streak, idx) => {
        const durationHours = (streak.durationMinutes / 60).toFixed(1);
        const durationDisplay = streak.durationMinutes < 60
            ? `${streak.durationMinutes.toFixed(0)} minutes`
            : `${durationHours} hours`;

        const postsPerHour = (streak.posts / (streak.durationMinutes / 60)).toFixed(0);

        // Severity based on posts and speed
        let severity = 'info';
        let severityLabel = 'Normal';
        if (streak.posts >= 100 || postsPerHour >= 100) {
            severity = 'danger';
            severityLabel = 'EXTREME';
        } else if (streak.posts >= 50 || postsPerHour >= 50) {
            severity = 'warning';
            severityLabel = 'High';
        }

        return `
            <div style="background-color: var(--av-analysis-header); padding: 12px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid var(--av-${severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'primary'});">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: var(--av-text);">Streak #${idx + 1}</span>
                    <span style="color: var(--av-${severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'success'}); font-weight: bold;">${severityLabel}</span>
                </div>
                <div class="analysis-stat-row" style="border: none; padding: 4px 0;">
                    <span class="analysis-stat-label">Posts in Streak</span>
                    <span class="analysis-stat-value">${streak.posts}</span>
                </div>
                <div class="analysis-stat-row" style="border: none; padding: 4px 0;">
                    <span class="analysis-stat-label">Duration</span>
                    <span class="analysis-stat-value">${durationDisplay}</span>
                </div>
                <div class="analysis-stat-row" style="border: none; padding: 4px 0;">
                    <span class="analysis-stat-label">Avg Interval</span>
                    <span class="analysis-stat-value">${streak.avgInterval.toFixed(0)}s</span>
                </div>
                <div class="analysis-stat-row" style="border: none; padding: 4px 0;">
                    <span class="analysis-stat-label">Posts/Hour</span>
                    <span class="analysis-stat-value ${severity}">${postsPerHour}</span>
                </div>
                ${streak.breakDuration ? `
                <div class="analysis-stat-row" style="border: none; padding: 4px 0;">
                    <span class="analysis-stat-label">Break After</span>
                    <span class="analysis-stat-value">${formatDuration(streak.breakDuration)}</span>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');

    const totalStreakPosts = analysis.streaks.reduce((sum, s) => sum + s.posts, 0);
    const streakPercentage = ((totalStreakPosts / analysis.count) * 100).toFixed(1);

    return `
        <div style="margin-bottom: 15px; padding: 10px; background-color: var(--av-anomaly-bg); border-radius: 4px;">
            <strong style="color: #ff6b6b;">⚠️ ${analysis.streaks.length} rapid-posting marathon${analysis.streaks.length > 1 ? 's' : ''} detected</strong>
            <div style="color: var(--av-text-muted); font-size: 12px; margin-top: 4px;">
                ${totalStreakPosts} posts (${streakPercentage}%) were made during marathon sessions
            </div>
        </div>
        ${streaksHTML}
    `;
}

function buildFrequencySuspicious(analysis) {
    if (!analysis || !analysis.suspiciousPatterns || analysis.suspiciousPatterns.length === 0) {
        return '<p style="color: var(--av-success);">✓ No obvious suspicious patterns detected.</p>';
    }

    const patternsHTML = analysis.suspiciousPatterns.map(pattern => {
        const severityColors = {
            high: '#ff6b6b',
            medium: 'var(--av-warning)',
            low: '#ffa500'
        };

        return `
            <div class="anomaly-item" style="border-left-color: ${severityColors[pattern.severity]};">
                <div class="anomaly-description" style="color: ${severityColors[pattern.severity]};">
                    <strong>${pattern.severity.toUpperCase()}:</strong> ${pattern.description}
                </div>
                <div class="anomaly-date" style="font-size: 11px;">
                    Type: ${pattern.type}
                </div>
            </div>
        `;
    }).join('');

    return patternsHTML;
}

function buildFrequencySubreddits(analysis) {
    if (!analysis || !analysis.subredditDist || analysis.subredditDist.length === 0) {
        return '<p style="color: var(--av-text-muted);">No subreddit data available.</p>';
    }

    const maxCount = analysis.subredditDist[0][1];
    const maxSubLength = 30; // Fixed width for subreddit names

    const subsHTML = analysis.subredditDist.map(([sub, count]) => {
        const barLength = maxCount > 0 ? Math.round((count / maxCount) * 30) : 0;
        const bar = '█'.repeat(barLength) + '░'.repeat(30 - barLength);
        const percentage = analysis.count > 0 ? ((count / analysis.count) * 100).toFixed(1) : '0.0';

        // Truncate or pad subreddit name to fixed width
        const displaySub = sub.length > maxSubLength
            ? sub.substring(0, maxSubLength - 3) + '...'
            : sub.padEnd(maxSubLength);

        return `<div style="font-family: monospace; font-size: 11px; line-height: 1.4; margin-bottom: 2px;">
            <span class="subreddit-filter-link" data-subreddit="${escapeHtml(sub)}" style="color: var(--av-link); cursor: pointer; text-decoration: none; display: inline-block; width: ${maxSubLength}ch;">r/${displaySub}</span> ${bar} ${count.toString().padStart(4)} (${percentage.padStart(5)}%)
        </div>`;
    }).join('');

    return subsHTML;
}

function buildFrequencyRawOutput(items, kind) {
    if (!items || items.length === 0) {
        return '<p style="color: var(--av-text-muted);">No data available.</p>';
    }

    // Sort newest first
    const sorted = [...items].sort((a, b) => b.created_utc - a.created_utc);

    const rows = sorted.map((item, index) => {
        let delta = '';
        if (index > 0) {
            const secondsDelta = sorted[index - 1].created_utc - item.created_utc;
            delta = secondsDelta.toString().padStart(10);
        } else {
            delta = ''.padStart(10);
        }

        const date = new Date(item.created_utc * 1000);
        const timestamp = date.toISOString().replace('T', ' ').substring(0, 19);

        const id = item.id || '';
        const permalink = kind === 'comment'
            ? `https://reddit.com${item.permalink}`
            : `https://reddit.com${item.permalink}`;

        const subreddit = item.subreddit || '';

        return `${delta} ${id.padEnd(10)} ${timestamp} /r/${subreddit}/${kind}s/${id}/`;
    }).join('\n');

    return `<pre style="font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.3; overflow-x: auto; background-color: var(--av-analysis-header); padding: 15px; border-radius: 4px;">${rows}</pre>`;
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds.toFixed(0)}s`;
    } else if (seconds < 3600) {
        return `${(seconds / 60).toFixed(1)}m`;
    } else if (seconds < 86400) {
        return `${(seconds / 3600).toFixed(1)}h`;
    } else {
        return `${(seconds / 86400).toFixed(1)}d`;
    }
}

// Show frequency modal
async function showFrequencyModal(username) {
    // Check for token
    if (!apiToken) {
        attemptAutoFetchToken();
        showTokenModal(username);
        return;
    }

    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.dataset.username = username;
    modal.style.width = '900px';
    modal.style.height = '90vh';
    modal.style.zIndex = ++zIndexCounter;

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Post Frequency: u/${username}</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <div class="age-loading">Fetching posting frequency data...</div>
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="freq-fetch-more">Fetch More (500 each)</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-buttons .secondary');
    const fetchMoreBtn = modal.querySelector('#freq-fetch-more');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    // Store data for fetch more
    let allComments = [];
    let allSubmissions = [];

    const updateDisplay = (comments, submissions) => {
        const commentAnalysis = analyzeFrequency(comments);
        const submissionAnalysis = analyzeFrequency(submissions);

        // Store references in modal info for subreddit filtering
        const modalInfo = resultsModals.find(m => m.modalId === modalId);
        if (modalInfo) {
            modalInfo.allComments = comments;
            modalInfo.allSubmissions = submissions;
        }

        const content = modal.querySelector('.age-modal-content');
        const currentView = content.querySelector('[id^="freq-"][style*="block"]')?.id || 'freq-comments-view';

        content.innerHTML = `
            <div style="margin-bottom: 15px; display: flex; gap: 10px;">
                <button class="age-modal-button" id="freq-toggle-comments" data-active="${currentView === 'freq-comments-view'}" style="flex: 1;">
                    Comments (${comments.length})
                </button>
                <button class="age-modal-button ${currentView === 'freq-comments-view' ? 'secondary' : ''}" id="freq-toggle-posts" data-active="${currentView === 'freq-posts-view'}" style="flex: 1;">
                    Posts (${submissions.length})
                </button>
            </div>

            <div id="freq-comments-view" style="display: ${currentView === 'freq-comments-view' ? 'block' : 'none'};">
                ${buildFrequencyView(commentAnalysis, comments, 'comment', username)}
            </div>

            <div id="freq-posts-view" style="display: ${currentView === 'freq-posts-view' ? 'block' : 'none'};">
                ${buildFrequencyView(submissionAnalysis, submissions, 'submission', username)}
            </div>
        `;

        // Re-attach toggle handlers
        const commentsBtn = modal.querySelector('#freq-toggle-comments');
        const postsBtn = modal.querySelector('#freq-toggle-posts');
        const commentsView = modal.querySelector('#freq-comments-view');
        const postsView = modal.querySelector('#freq-posts-view');

        commentsBtn.onclick = () => {
            commentsBtn.classList.remove('secondary');
            commentsBtn.dataset.active = 'true';
            postsBtn.classList.add('secondary');
            postsBtn.dataset.active = 'false';
            commentsView.style.display = 'block';
            postsView.style.display = 'none';
        };

        postsBtn.onclick = () => {
            postsBtn.classList.remove('secondary');
            postsBtn.dataset.active = 'true';
            commentsBtn.classList.add('secondary');
            commentsBtn.dataset.active = 'false';
            postsView.style.display = 'block';
            commentsView.style.display = 'none';
        };

        attachFrequencyHandlers(modal);
    };

    // Fetch More handler
    fetchMoreBtn.onclick = async () => {
        fetchMoreBtn.disabled = true;
        fetchMoreBtn.textContent = 'Fetching...';

        try {
            // Get oldest timestamp from current data
            const oldestComment = allComments.length > 0
                ? Math.min(...allComments.map(c => c.created_utc))
                : null;
            const oldestSubmission = allSubmissions.length > 0
                ? Math.min(...allSubmissions.map(s => s.created_utc))
                : null;

            // Fetch more with before parameter
            const [newComments, newSubmissions] = await Promise.all([
                searchUserFrequencyPaginated(username, 'comment', oldestComment),
                searchUserFrequencyPaginated(username, 'submission', oldestSubmission)
            ]);

            // Merge and deduplicate
            const commentIds = new Set(allComments.map(c => c.id));
            const submissionIds = new Set(allSubmissions.map(s => s.id));

            newComments.forEach(c => {
                if (!commentIds.has(c.id)) {
                    allComments.push(c);
                    commentIds.add(c.id);
                }
            });

            newSubmissions.forEach(s => {
                if (!submissionIds.has(s.id)) {
                    allSubmissions.push(s);
                    submissionIds.add(s.id);
                }
            });

            updateDisplay(allComments, allSubmissions);

            // Update any open subreddit filter modals
            refreshSubredditModals(modalId, allComments, allSubmissions);

            fetchMoreBtn.disabled = false;
            fetchMoreBtn.textContent = `Fetch More (500 each)`;

            if (newComments.length === 0 && newSubmissions.length === 0) {
                fetchMoreBtn.textContent = 'No More Data Available';
                fetchMoreBtn.disabled = true;
            }

        } catch (error) {
            console.error('Fetch more error:', error);
            fetchMoreBtn.textContent = `Error: ${error.message}`;
        }
    };

    try {
        // Initial fetch
        const [comments, submissions] = await Promise.all([
            searchUserFrequency(username, 'comment'),
            searchUserFrequency(username, 'submission')
        ]);

        allComments = comments;
        allSubmissions = submissions;

        updateDisplay(comments, submissions);

    } catch (error) {
        console.error('Frequency fetch error:', error);
        const content = modal.querySelector('.age-modal-content');
        content.innerHTML = `
            <div class="age-error">
                <strong>Error:</strong> ${error.message}
            </div>
        `;

        if (error.message.includes('token') || error.message.includes('Token')) {
            setTimeout(() => {
                closeModal();
                showTokenModal(username);
            }, 2000);
        }
    }
}

function showSubredditFilteredModal(username, subreddit, allItems, kind, parentModalId) {
    // Filter items to only this subreddit
    const filteredItems = allItems.filter(item =>
        (item.subreddit || '').toLowerCase() === subreddit.toLowerCase()
    );

    if (filteredItems.length === 0) {
        return; // Shouldn't happen, but just in case
    }

    const modalId = `age-modal-${modalCounter++}`;
    const kindLabel = kind === 'comment' ? 'Comments' : 'Posts';

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.dataset.username = username;
    modal.dataset.subreddit = subreddit;
    modal.dataset.kind = kind;
    modal.dataset.parentModalId = parentModalId; // Link to parent frequency modal
    modal.style.width = '800px';
    modal.style.height = '80vh';
    modal.style.zIndex = ++zIndexCounter;

    // Sort newest first by default
    const sortedItems = [...filteredItems].sort((a, b) => b.created_utc - a.created_utc);

    const resultsHTML = buildSubredditResultsHTML(sortedItems, kind, username);

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">${kindLabel} in r/${subreddit} - u/${username} (${filteredItems.length})</div>
                <button class="age-modal-close">&times;</button>
            </div>
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                <button class="age-modal-button secondary" id="subreddit-toggle-sort">
                    Sort: Newest First
                </button>
            </div>
        </div>
        <div class="age-modal-content">
            ${resultsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username, subreddit, kind, parentModalId });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-buttons .secondary');
    const sortButton = modal.querySelector('#subreddit-toggle-sort');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    // Sort toggle
    sortButton.onclick = () => {
        const container = modal.querySelector('.age-modal-content');
        const items = Array.from(container.querySelectorAll('.manual-result-item'));
        items.reverse().forEach(item => container.appendChild(item));

        const currentText = sortButton.textContent;
        sortButton.textContent = currentText.includes('Newest')
            ? 'Sort: Oldest First'
            : 'Sort: Newest First';

        container.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

function refreshSubredditModals(parentModalId, allComments, allSubmissions) {
    // Find all subreddit modals that are children of this frequency modal
    const subredditModals = resultsModals.filter(m =>
        m.parentModalId === parentModalId && m.subreddit
    );

    subredditModals.forEach(modalInfo => {
        const items = modalInfo.kind === 'comment' ? allComments : allSubmissions;
        const filteredItems = items.filter(item =>
            (item.subreddit || '').toLowerCase() === modalInfo.subreddit.toLowerCase()
        );

        if (filteredItems.length === 0) return;

        // Get current sort order
        const sortButton = modalInfo.modal.querySelector('#subreddit-toggle-sort');
        const isNewestFirst = sortButton && sortButton.textContent.includes('Newest');

        // Sort accordingly
        const sortedItems = isNewestFirst
            ? [...filteredItems].sort((a, b) => b.created_utc - a.created_utc)
            : [...filteredItems].sort((a, b) => a.created_utc - b.created_utc);

        // Update title count
        const titleDiv = modalInfo.modal.querySelector('.age-modal-title');
        const kindLabel = modalInfo.kind === 'comment' ? 'Comments' : 'Posts';
        titleDiv.textContent = `${kindLabel} in r/${modalInfo.subreddit} - u/${modalInfo.username} (${filteredItems.length})`;

        // Update content
        const content = modalInfo.modal.querySelector('.age-modal-content');
        content.innerHTML = buildSubredditResultsHTML(sortedItems, modalInfo.kind, modalInfo.username);
    });
}

function buildSubredditResultsHTML(items, kind, username) {
    if (items.length === 0) {
        return '<p style="color: var(--av-text-muted);">No results found.</p>';
    }

    return items.map(item => {
        const isComment = kind === 'comment';

        // Format date
        const postDate = new Date(item.created_utc * 1000);
        const formattedDate = postDate.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Build content
        let contentHTML = '';
        if (isComment) {
            const body = item.body || '';
            contentHTML = `<div class="manual-result-body">${escapeHtml(body)}</div>`;
        } else {
            const title = item.title || '';
            const selftext = item.selftext || '';
            contentHTML = `
                <div class="manual-result-title">${escapeHtml(title)}</div>
                ${selftext ? `<div class="manual-result-body">${escapeHtml(selftext)}</div>` : ''}
            `;
        }

        // Build permalink
        const permalink = isComment
            ? `https://reddit.com${item.permalink}`
            : `https://reddit.com${item.permalink}`;

        return `
            <div class="manual-result-item">
                <div class="manual-result-header">
                    <div class="manual-result-meta">
                        <a href="https://reddit.com/user/${item.author}" target="_blank" class="manual-result-author">u/${item.author}</a>
                        <span class="manual-result-score">Score: ${item.score || 0}</span>
                    </div>
                    <span class="age-result-date">${formattedDate}</span>
                </div>
                ${contentHTML}
                <a href="${permalink}" target="_blank" class="age-result-link">View ${isComment ? 'Comment' : 'Post'} →</a>
            </div>
        `;
    }).join('');
}

// Fetch with pagination support
function searchUserFrequencyPaginated(username, kind = 'comment', beforeTimestamp = null) {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const params = new URLSearchParams();
        params.append('author', username);
        params.append('exact_author', 'true');
        params.append('html_decode', 'True');
        params.append('size', '500');
        params.append('sort', 'created_utc');
        params.append('order', 'desc');

        if (beforeTimestamp) {
            params.append('before', beforeTimestamp.toString());
        }

        const endpoint = kind === 'comment' ? 'comment' : 'submission';
        const url = `${PUSHSHIFT_API_BASE}/reddit/search/${endpoint}/?${params}`;

        logDebug(`Frequency pagination request for ${username} (${kind}, before: ${beforeTimestamp})`);

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
                    logDebug(`Frequency pagination returned ${results.length} ${kind}s`);
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

function buildFrequencyView(analysis, items, kind, username) {
    const kindLabel = kind === 'comment' ? 'Comments' : 'Posts';

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📊 Overview</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencyOverview(analysis, kind)}
            </div>
        </div>

        ${analysis && analysis.stats ? `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">💥 Burst Activity</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencyBursts(analysis)}
            </div>
        </div>

        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">🕐 Time Patterns</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencyTimePatterns(analysis)}
            </div>
        </div>

        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">🔥 Posting Streaks</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencyStreaks(analysis)}
            </div>
        </div>

        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">⚠️ Suspicious Patterns</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencySuspicious(analysis)}
            </div>
        </div>

        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📍 Subreddit Distribution</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${buildFrequencySubreddits(analysis)}
            </div>
        </div>
        ` : ''}

        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📋 Raw Output (${items.length} ${kindLabel})</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content" style="max-height: 600px; overflow-y: auto;">
                ${buildFrequencyRawOutput(items, kind)}
            </div>
        </div>
    `;
}

function attachFrequencyHandlers(modal) {
    modal.querySelectorAll('.deep-analysis-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.deep-analysis-toggle');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▶ Show' : '▼ Hide';
        });
    });

    // Attach subreddit filter click handlers
    modal.querySelectorAll('.subreddit-filter-link').forEach(link => {
        link.addEventListener('click', () => {
            const subreddit = link.dataset.subreddit;
            const username = modal.dataset.username;
            const modalId = modal.dataset.modalId;

            // Get current view (comments or posts)
            const commentsView = modal.querySelector('#freq-comments-view');
            const postsView = modal.querySelector('#freq-posts-view');
            const isCommentsView = commentsView && commentsView.style.display !== 'none';
            const kind = isCommentsView ? 'comment' : 'submission';

            // Get all items for current view from parent modal
            const modalInfo = resultsModals.find(m => m.modalId === modalId);
            if (!modalInfo) return;

            // Determine which dataset to use
            const allItems = isCommentsView ? modalInfo.allComments : modalInfo.allSubmissions;
            if (!allItems || allItems.length === 0) return;

            showSubredditFilteredModal(username, subreddit, allItems, kind, modalId);
        });
    });
}

// ============================================================================
// PAGINATION SUPPORT
// ============================================================================

function searchUserAgesWithPagination(username, beforeTimestamp = null, limit = null) {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const searchQuery = buildAgeSearchQuery();
        const actualLimit = limit || userSettings.paginationLimit; // Use setting as default

        const params = new URLSearchParams();
        params.append('author', username);
        params.append('exact_author', 'true');
        params.append('html_decode', 'True');
        params.append('q', searchQuery);
        params.append('size', actualLimit.toString());
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

function performManualSearch(params) {
    return new Promise((resolve, reject) => {
        if (!apiToken) {
            reject(new Error('No API token available'));
            return;
        }

        const searchParams = new URLSearchParams();

        // Add author if provided
        if (params.author) {
            searchParams.append('author', params.author);
            if (params.exactAuthorMatch) {
                searchParams.append('exact_author', 'true');
            }
        }

        // Add subreddit if provided
        if (params.subreddit) {
            searchParams.append('subreddit', params.subreddit);
        }

        // Add search query if provided
        if (params.query) {
            searchParams.append('q', params.query);
        }

        // Add limit
        searchParams.append('size', params.limit || 100);

        // Add date filters
        if (params.since) {
            const sinceTimestamp = Math.floor(new Date(params.since).getTime() / 1000);
            searchParams.append('after', sinceTimestamp);
        }

        if (params.until) {
            const untilTimestamp = Math.floor(new Date(params.until).getTime() / 1000);
            searchParams.append('before', untilTimestamp);
        }

        // Add score filters
        if (params.minScore) {
            searchParams.append('score', `>${params.minScore}`);
        }
        if (params.maxScore) {
            searchParams.append('score', `<${params.maxScore}`);
        }

        // Add sorting
        searchParams.append('sort', 'created_utc');
        searchParams.append('order', 'desc');
        searchParams.append('html_decode', 'True');

        const endpoint = params.kind === 'comment' ? 'comment' : 'submission';
        const url = `${PUSHSHIFT_API_BASE}/reddit/search/${endpoint}/?${searchParams}`;

        logDebug('Manual search request:', params);

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
                    logDebug(`Manual search returned ${results.length} results`);
                    resolve({ results, params });
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

function highlightSearchTerms(text, searchTerms) {
    if (!text || !searchTerms || searchTerms.length === 0) {
        return escapeHtml(text || '');
    }

    let highlighted = escapeHtml(text);

    // Split search terms by spaces and highlight each
    searchTerms.forEach(term => {
        if (term.length < 2) return; // Skip very short terms

        const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
        highlighted = highlighted.replace(regex, '<span class="highlight-search-term">$1</span>');
    });

    return highlighted;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract submission title and subreddit from the DOM context of a button
 * @param {HTMLElement} buttonElement - The age check button element
 * @returns {Object|null} - {title: string, subreddit: string} or null if extraction fails
 */
function extractSubmissionContext(buttonElement) {
    try {
        let thingContainer = buttonElement.closest('div.thing');

        if (!thingContainer) {
            console.warn('Could not find thing container for submission context');
            return null;
        }

        const titleElement = thingContainer.querySelector('p.title > a.title');
        let title = titleElement ? titleElement.textContent.trim() : null;

        if (!title) {
            console.warn('Could not extract submission title');
            return null;
        }

        // Strip punctuation to improve search matching
        title = title.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?]/g, ' ')
                     .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                     .trim();

        const commentsLink = thingContainer.querySelector('ul.flat-list.buttons > li.first > a');

        if (!commentsLink || !commentsLink.href) {
            console.warn('Could not find comments link for subreddit extraction');
            return null;
        }

        const subredditMatch = commentsLink.href.match(/\/r\/([^\/]+)\//);
        const subreddit = subredditMatch ? subredditMatch[1] : null;

        if (!subreddit) {
            console.warn('Could not extract subreddit from comments link');
            return null;
        }

        return { title, subreddit };

    } catch (error) {
        console.error('Error extracting submission context:', error);
        return null;
    }
}

function showManualSearchModal(options = {}) {
    const prefillOptions = typeof options === 'string'
        ? { username: options }
        : options;

    const {
        username = null,
        subreddit = null,
        searchType = 'comment',
        searchInput = null,
        autoExecute = false
    } = prefillOptions;

    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.width = '700px';
    modal.style.height = '600px';
    modal.style.zIndex = ++zIndexCounter;

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Manual PushShift Search</div>
                <button class="age-modal-close">&times;</button>
            </div>
        </div>
        <div class="age-modal-content">
            <form class="manual-search-form" id="manual-search-form">
                <div class="manual-search-row">
                    <div class="manual-search-field">
                        <label class="manual-search-label">Username</label>
                        <input type="text" class="manual-search-input" id="ms-author"
                               value="${username || ''}" placeholder="Enter username">
                    </div>
                    <div class="manual-search-field">
                        <label class="manual-search-label">Subreddit</label>
                        <input type="text" class="manual-search-input" id="ms-subreddit"
                               value="${subreddit || ''}" placeholder="Enter subreddit">
                    </div>
                </div>

                <div class="manual-search-row" style="grid-template-columns: 1.2fr 1.5fr 1fr 1fr;">
                    <div class="manual-search-field">
                        <label class="manual-search-label">Search For</label>
                        <select class="manual-search-select" id="ms-kind">
                            <option value="comment" ${searchType === 'comment' ? 'selected' : ''}>Comments</option>
                            <option value="submission" ${searchType === 'submission' ? 'selected' : ''}>Posts</option>
                        </select>
                    </div>
                    <div class="manual-search-field">
                        <label class="manual-search-label">Number To Request</label>
                        <input type="number" class="manual-search-input" id="ms-limit"
                               value="250" min="1">
                    </div>
                    <div class="manual-search-field">
                        <label class="manual-search-label">Min Score</label>
                        <input type="number" class="manual-search-input" id="ms-min-score"
                               placeholder="Optional">
                    </div>
                    <div class="manual-search-field">
                        <label class="manual-search-label">Max Score</label>
                        <input type="number" class="manual-search-input" id="ms-max-score"
                               placeholder="Optional">
                    </div>
                </div>

                <div class="manual-search-row">
                    <div class="manual-search-field">
                        <label class="manual-search-label">Since</label>
                        <input type="datetime-local" class="manual-search-input" id="ms-since">
                    </div>
                    <div class="manual-search-field">
                        <label class="manual-search-label">Until</label>
                        <input type="datetime-local" class="manual-search-input" id="ms-until">
                    </div>
                </div>

                <div class="manual-search-field">
                    <label class="manual-search-label">Search Input</label>
                    <input type="text" class="manual-search-input" id="ms-query"
                               value="${searchInput || ''}" placeholder="Keywords to search for">
                </div>

                <div class="manual-search-checkbox-group">
                    <div class="manual-search-checkbox-item">
                        <input type="checkbox" id="ms-exact-author" checked>
                        <label for="ms-exact-author">Exact Author Match</label>
                    </div>
                    <div class="manual-search-checkbox-item">
                        <input type="checkbox" id="ms-highlight" checked>
                        <label for="ms-highlight">Highlight Search Term(s)</label>
                    </div>
                </div>
            </form>
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="execute-manual-search">Search</button>
            <button class="age-modal-button secondary">Cancel</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username: 'manual-search' });

    const closeBtn = modal.querySelector('.age-modal-close');
    const cancelBtn = modal.querySelector('.age-modal-buttons .secondary');
    const searchBtn = modal.querySelector('#execute-manual-search');
    const form = modal.querySelector('#manual-search-form');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // Handle form submission
    const executeSearch = async (e) => {
        if (e) e.preventDefault();

        const params = {
            author: modal.querySelector('#ms-author').value.trim(),
            subreddit: modal.querySelector('#ms-subreddit').value.trim(),
            kind: modal.querySelector('#ms-kind').value,
            limit: parseInt(modal.querySelector('#ms-limit').value) || 100,
            minScore: modal.querySelector('#ms-min-score').value.trim(),
            maxScore: modal.querySelector('#ms-max-score').value.trim(),
            since: modal.querySelector('#ms-since').value,
            until: modal.querySelector('#ms-until').value,
            query: modal.querySelector('#ms-query').value.trim(),
            exactAuthorMatch: modal.querySelector('#ms-exact-author').checked,
            highlight: modal.querySelector('#ms-highlight').checked
        };

        // Validation
        if (!params.author && !params.subreddit && !params.query) {
            alert('Please enter at least one search criterion (Username, Subreddit, or Search Query)');
            return;
        }

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';

        try {
            const searchResults = await performManualSearch(params);
            closeModal();
            showManualSearchResults(searchResults);
        } catch (error) {
            console.error('Manual search error:', error);
            alert(`Search failed: ${error.message}`);
            searchBtn.disabled = false;
            searchBtn.textContent = 'PushShift';
        }
    };

    searchBtn.onclick = executeSearch;
    form.onsubmit = executeSearch;

    // Auto-execute search if requested
    if (autoExecute) {
        setTimeout(() => executeSearch(), 100); // Small delay to ensure modal is fully rendered
    }

    const newSearchBtn = modal.querySelector('#new-manual-search');
    newSearchBtn.onclick = () => {
        const currentAuthor = modal.querySelector('#ms-author').value.trim();
        showManualSearchModal({ username: currentAuthor || params.author });
    };
}

function showManualSearchResults(searchData) {
    const { results, params } = searchData;
    const modalId = `age-modal-${modalCounter++}`;

    const modal = document.createElement('div');
    modal.className = 'age-modal resizable';
    modal.dataset.modalId = modalId;
    modal.style.width = `${userSettings.modalWidth}px`;
    modal.style.height = `${userSettings.modalHeight}px`;
    modal.style.zIndex = ++zIndexCounter;

    const kindLabel = params.kind === 'comment' ? 'Comments' : 'Posts';

    // Parse search terms for highlighting
    const searchTerms = params.highlight && params.query
        ? params.query.split(/\s+/).filter(t => t.length > 1)
        : [];

    // Build results HTML
    let resultsHTML = '';
    if (results.length === 0) {
        resultsHTML = `<div class="age-summary">
            <div class="age-summary-title">No Results Found</div>
            <p>Your search returned no results. Try adjusting your search criteria.</p>
        </div>`;
    } else {
        resultsHTML = `<div style="color: var(--av-success); font-weight: bold; margin-bottom: 15px; padding: 10px; background-color: var(--av-surface); border-radius: 4px;">
            Found ${results.length} ${results.length === 1 ? 'result' : 'results'}
        </div>`;

        resultsHTML += '<div class="age-results-container">';
        results.forEach(result => {
            const isComment = params.kind === 'comment';

            // Format date
            const postDate = new Date(result.created_utc * 1000);
            const formattedDate = postDate.toLocaleString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Build content
            let contentHTML = '';
            if (isComment) {
                const body = result.body || '';
                const highlightedBody = params.highlight
                    ? highlightSearchTerms(body, searchTerms)
                    : escapeHtml(body);

                contentHTML = `<div class="manual-result-body">${highlightedBody}</div>`;
            } else {
                const title = result.title || '';
                const selftext = result.selftext || '';

                const highlightedTitle = params.highlight
                    ? highlightSearchTerms(title, searchTerms)
                    : escapeHtml(title);

                const highlightedBody = params.highlight && selftext
                    ? highlightSearchTerms(selftext, searchTerms)
                    : escapeHtml(selftext);

                contentHTML = `
                    <div class="manual-result-title">${highlightedTitle}</div>
                    ${selftext ? `<div class="manual-result-body">${highlightedBody}</div>` : ''}
                `;
            }

            // Build permalink
            const permalink = isComment
                ? `https://reddit.com${result.permalink}`
                : `https://reddit.com${result.permalink}`;

            resultsHTML += `
                <div class="manual-result-item">
                    <div class="manual-result-header">
                        <div class="manual-result-meta">
                            <a href="https://reddit.com/user/${result.author}" target="_blank" class="manual-result-author">u/${result.author}</a>
                            <a href="https://reddit.com/r/${result.subreddit}" target="_blank" style="color: var(--av-primary);">r/${result.subreddit}</a>
                            <span class="manual-result-score">Score: ${result.score || 0}</span>
                        </div>
                        <span class="age-result-date">${formattedDate}</span>
                    </div>
                    ${contentHTML}
                    <a href="${permalink}" target="_blank" class="age-result-link">View on Reddit →</a>
                </div>
            `;
        });
        resultsHTML += '</div>';
    }

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Manual Search Results</div>
                <button class="age-modal-close">&times;</button>
            </div>
            <div class="age-modal-topbar" style="margin-top: 12px;">
                <form class="manual-search-form" id="manual-search-form-results">
                    <div class="manual-search-row">
                        <div class="manual-search-field">
                            <label class="manual-search-label">Username</label>
                            <input type="text" class="manual-search-input" id="ms-author"
                                   value="${params.author || ''}" placeholder="Enter username">
                        </div>
                        <div class="manual-search-field">
                            <label class="manual-search-label">Subreddit</label>
                            <input type="text" class="manual-search-input" id="ms-subreddit"
                                   value="${params.subreddit || ''}" placeholder="Enter subreddit">
                        </div>
                    </div>

                    <div class="manual-search-row" style="grid-template-columns: 1.2fr 1.5fr 1fr 1fr;">
                        <div class="manual-search-field">
                            <label class="manual-search-label">Search For</label>
                            <select class="manual-search-select" id="ms-kind">
                                <option value="comment" ${params.kind === 'comment' ? 'selected' : ''}>Comments</option>
                                <option value="submission" ${params.kind === 'submission' ? 'selected' : ''}>Posts</option>
                            </select>
                        </div>
                        <div class="manual-search-field">
                            <label class="manual-search-label">Number To Request</label>
                            <input type="number" class="manual-search-input" id="ms-limit"
                                   value="${params.limit}" min="1">
                        </div>
                        <div class="manual-search-field">
                            <label class="manual-search-label">Min Score</label>
                            <input type="number" class="manual-search-input" id="ms-min-score"
                                   value="${params.minScore || ''}" placeholder="Optional">
                        </div>
                        <div class="manual-search-field">
                            <label class="manual-search-label">Max Score</label>
                            <input type="number" class="manual-search-input" id="ms-max-score"
                                   value="${params.maxScore || ''}" placeholder="Optional">
                        </div>
                    </div>

                    <div class="manual-search-row">
                        <div class="manual-search-field">
                            <label class="manual-search-label">Since</label>
                            <input type="datetime-local" class="manual-search-input" id="ms-since"
                                   value="${params.since || ''}">
                        </div>
                        <div class="manual-search-field">
                            <label class="manual-search-label">Until</label>
                            <input type="datetime-local" class="manual-search-input" id="ms-until"
                                   value="${params.until || ''}">
                        </div>
                    </div>

                    <div class="manual-search-field">
                        <label class="manual-search-label">Search Input</label>
                        <input type="text" class="manual-search-input" id="ms-query"
                               value="${params.query || ''}" placeholder="Query or Reddit Object Fullname">
                    </div>

                    <div class="manual-search-checkbox-group">
                        <div class="manual-search-checkbox-item">
                            <input type="checkbox" id="ms-exact-author" ${params.exactAuthorMatch ? 'checked' : ''}>
                            <label for="ms-exact-author">Exact Author Match</label>
                        </div>
                        <div class="manual-search-checkbox-item">
                            <input type="checkbox" id="ms-highlight" ${params.highlight ? 'checked' : ''}>
                            <label for="ms-highlight">Highlight Search Term(s)</label>
                        </div>
                    </div>
                </form>
            </div>
        </div>
        <div class="age-modal-content">
            ${resultsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button" id="execute-manual-search-again">Search</button>
            <button class="age-modal-button secondary" id="new-manual-search">New Search</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    resultsModals.push({ modalId, modal, overlay: null, username: 'manual-results' });

    const closeBtn = modal.querySelector('.age-modal-close');
    const closeButton = modal.querySelector('.age-modal-buttons .secondary');
    const searchBtn = modal.querySelector('#execute-manual-search-again');
    const form = modal.querySelector('#manual-search-form-results');

    const closeModal = () => {
        document.body.removeChild(modal);
        resultsModals = resultsModals.filter(m => m.modalId !== modalId);
    };

    closeBtn.onclick = closeModal;
    closeButton.onclick = closeModal;

    // Handle form submission
    const executeSearch = async (e) => {
        if (e) e.preventDefault();

        const newParams = {
            author: modal.querySelector('#ms-author').value.trim(),
            subreddit: modal.querySelector('#ms-subreddit').value.trim(),
            kind: modal.querySelector('#ms-kind').value,
            limit: parseInt(modal.querySelector('#ms-limit').value) || 100,
            minScore: modal.querySelector('#ms-min-score').value.trim(),
            maxScore: modal.querySelector('#ms-max-score').value.trim(),
            since: modal.querySelector('#ms-since').value,
            until: modal.querySelector('#ms-until').value,
            query: modal.querySelector('#ms-query').value.trim(),
            exactAuthorMatch: modal.querySelector('#ms-exact-author').checked,
            highlight: modal.querySelector('#ms-highlight').checked
        };

        // Validation
        if (!newParams.author && !newParams.subreddit && !newParams.query) {
            alert('Please enter at least one search criterion (Username, Subreddit, or Search Query)');
            return;
        }

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';

        try {
            const searchResults = await performManualSearch(newParams);
            closeModal();
            showManualSearchResults(searchResults);
        } catch (error) {
            console.error('Manual search error:', error);
            alert(`Search failed: ${error.message}`);
            searchBtn.disabled = false;
            searchBtn.textContent = 'PushShift';
        }
    };

    searchBtn.onclick = executeSearch;
    form.onsubmit = executeSearch;

    const newSearchBtn = modal.querySelector('#new-manual-search');
    newSearchBtn.onclick = () => {
        const currentAuthor = modal.querySelector('#ms-author').value.trim();
        showManualSearchModal(currentAuthor || params.author);
    };
}

function showResultsModal(username, ageData) {
    // Update button cache since we're displaying this data
    updateButtonCacheForUser(username, ageData);

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
                estimateHTML = `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--av-border);">
                    <strong style="color: #ff6b6b;">⚠ Age Anomaly Detected</strong>
                    <br>
                    <span style="color: #ff6b6b; font-size: 12px;">${ageEstimate.message}</span>
                </p>`;
            } else {
                // Show estimate
                const confidenceColors = {
                    'High': 'var(--av-success)',
                    'Medium': 'var(--av-warning)',
                    'Low': '#ffa500',
                    'Very Low': '#ff6b6b'
                };
                const confidenceColor = confidenceColors[ageEstimate.confidence] || 'var(--av-text-muted)';

                let anomalyNote = '';
                if (ageEstimate.anomaliesDetected || ageEstimate.majorJump) {
                    anomalyNote = '<br><span style="color: var(--av-warning); font-size: 11px;">⚠ Age inconsistencies detected in data</span>';
                }

                let couplesNote = '';
                if (ageEstimate.couplesAccount) {
                    couplesNote = '<br><span style="color: var(--av-warning); font-size: 11px;">👥 Couples/Shared Account Detected - see Deep Analysis for details</span>';
                }

                estimateHTML = `<p style="margin-top: 8px; padding-top: 4px; border-top: 1px solid var(--av-border);">
                    <strong>Estimated Current Age:</strong>
                    <span style="color: ${confidenceColor}; font-weight: bold; font-size: 16px;">${ageEstimate.estimatedAge}</span>
                    <span style="color: var(--av-text-muted); font-size: 12px;"> (${ageEstimate.confidence} Confidence)</span>
                    ${ageEstimate.couplesAccount ? '<span style="color: var(--av-warning); font-size: 12px;"> 👥 Couples Account</span>' : ''}
                    <br>
                    <span style="color: var(--av-text-muted); font-size: 11px;">Based on ${ageEstimate.dataPoints} data point${ageEstimate.dataPoints > 1 ? 's' : ''} spanning ${ageEstimate.yearSpan} year${ageEstimate.yearSpan !== 1 ? 's' : ''}</span>
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
                ? `<span style="color: var(--av-success);">✓ ${result.postedAges.join(', ')}</span>`
                : '';
            const possibleBadge = result.possibleAges.length > 0
                ? `<span style="color: var(--av-text-muted);">? ${result.possibleAges.join(', ')}</span>`
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

    const customButtonsHTML = renderCustomButtons(username, ageData);

    modal.innerHTML = `
        <div class="age-modal-header">
            <div class="age-modal-title-row">
                <div class="age-modal-title">Age Verification: u/${username}</div>
                <div style="display: flex; align-items: center;">
                    <button class="age-settings-gear" title="Settings">⚙</button>
                    <button class="age-modal-close">&times;</button>
                </div>
            </div>
            ${customButtonsHTML}
            ${topbarHTML}
        </div>
        <div class="age-modal-content">
            ${resultsHTML}
        </div>
        <div class="age-modal-buttons">
            <button class="age-modal-button post-frequency">Post Frequency</button>
            <button class="age-modal-button deep-analysis">Deep Analysis</button>
            <button class="age-modal-button recheck-age">Recheck Age</button>
            <button class="age-modal-button danger clear-user">Clear This User Cache</button>
            <button class="age-modal-button manual-search">Manual Search</button>
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

    // Update all buttons for this user on the page
    updateButtonForUser(username);

    // Store modal reference
    resultsModals.push({ modalId, modal, overlay, username });

    const ageChips = modal.querySelectorAll('.age-chip');
    const resultItems = modal.querySelectorAll('.age-result-item');
    const filterStatusContainer = modal.querySelector('.age-filter-status-container');
    const contentContainer = modal.querySelector('.age-modal-content');

    // Attach custom button handlers
    attachCustomButtonHandlers(modal);

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

    const closeBtn = modal.querySelector('.age-modal-close');
    closeBtn.addEventListener('click', (e) => {
        console.log('X button clicked');
        closeModal();
    });

    const closeButton = modal.querySelector('.age-modal-buttons .age-modal-button.secondary');
    closeButton.addEventListener('click', (e) => {
        console.log('Bottom close button clicked');
        closeModal();
    });

    logDebug('Close button (X):', closeBtn);
    logDebug('Close button (bottom):', closeButton);
    logDebug('Both buttons found:', closeBtn !== null && closeButton !== null);

    const recheckBtn = modal.querySelector('.recheck-age');
    recheckBtn.onclick = () => {
        clearUserCache(username);
        closeModal();
        handleAgeCheck(username);
    };

    const clearUserBtn = modal.querySelector('.clear-user');
    clearUserBtn.onclick = () => {
        if (confirm(`Clear cached data for u/${username}?`)) {
            clearUserCache(username);
            closeModal();
            updateButtonForUser(username);
        }
    };

    const deepAnalysisBtn = modal.querySelector('.deep-analysis');
    deepAnalysisBtn.onclick = () => {
        const analysis = performDeepAnalysis(ageData, username);
        showDeepAnalysisModal(username, ageData, analysis);
    };

    const postFreqBtn = modal.querySelector('.post-frequency');
    postFreqBtn.onclick = () => {
        showFrequencyModal(username);
    };

    const manualSearchBtn = modal.querySelector('.manual-search');
    manualSearchBtn.onclick = () => {
        showManualSearchModal(username);
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

function copyDeepAnalysisSectionAsMarkdown(sectionType, analysis, username) {
    let markdown = '';

    switch (sectionType) {
        case 'overview':
            markdown += `#### Overview - u/${username}\n\n`;
            markdown += `- **Posts with Age Mentions:** ${analysis.totalPosts}\n`;
            markdown += `- **Posted Ages:** ${analysis.postedAges.length > 0 ? analysis.postedAges.join(', ') : 'None'}\n`;
            markdown += `- **Possible Ages:** ${analysis.possibleAges.length > 0 ? analysis.possibleAges.join(', ') : 'None'}\n`;
            if (analysis.ageExtremes) {
                markdown += `- **Age Range:** ${analysis.ageExtremes.min} - ${analysis.ageExtremes.max} (spread: ${analysis.ageExtremes.spread})\n`;
                markdown += `- **Mean Age / Std Dev:** ${analysis.ageExtremes.mean} / ±${analysis.ageExtremes.stdDev}\n`;
            }
            markdown += `- **Consistency Score:** ${analysis.consistencyScore}/100\n`;
            if (analysis.recentAgeChange) {
                const rc = analysis.recentAgeChange;
                markdown += `- **Recent Age Change:** ${rc.fromAge} → ${rc.toAge} (${rc.daysAgo} days ago)\n`;
            }
            if (analysis.couplesAnalysis && analysis.couplesAnalysis.isCouplesAccount) {
                markdown += `- **Account Type:** Likely Couples/Shared Account (${analysis.couplesAnalysis.confidence} confidence)\n`;
            }
            break;

        case 'anomalies':
            markdown += `#### Anomalies & Age Inconsistencies - u/${username}\n\n`;
            if (analysis.backwardsAging.length === 0 && (!analysis.staleAges || analysis.staleAges.length === 0)) {
                markdown += '✓ No age anomalies detected.\n';
            } else {
                if (analysis.backwardsAging.length > 0) {
                    markdown += `### Backwards Aging (${analysis.backwardsAging.length} instances)\n\n`;
                    analysis.backwardsAging.forEach(a => {
                        markdown += `- Age dropped from **${a.fromAge}** to **${a.toAge}** (${a.ageDrop} years younger)\n`;
                        markdown += `  - ${a.fromDate} (r/${a.fromSubreddit}) → ${a.toDate} (r/${a.toSubreddit})\n`;
                        markdown += `  - ${a.daysBetween} days between posts\n`;
                        markdown += `  - [View Post](${a.permalink})\n\n`;
                    });
                }
                if (analysis.staleAges && analysis.staleAges.length > 0) {
                    markdown += `### Stale Age Detection (${analysis.staleAges.length} instances)\n\n`;
                    analysis.staleAges.forEach(s => {
                        markdown += `- **${s.severity} Severity:** Posted as age **${s.age}** for ${s.monthsSpan} months (${s.postCount} posts)\n`;
                        markdown += `  - First: ${s.firstDate} (r/${s.firstSubreddit}) - [View](${s.firstPermalink})\n`;
                        markdown += `  - Last: ${s.lastDate} (r/${s.lastSubreddit}) - [View](${s.lastPermalink})\n\n`;
                    });
                }
            }
            break;

        case 'subreddit':
            markdown += `#### Subreddit Age Comparison - u/${username}\n\n`;
            const comparison = analysis.subredditComparison;
            const trackedSubs = userSettings.trackedSubreddits || [];

            if (trackedSubs.length === 0) {
                markdown += 'No tracked subreddits configured.\n';
            } else {
                if (comparison.ageDiscrepancy) {
                    markdown += '⚠️ **Age Discrepancy Detected**\n\n';
                    if (comparison.onlyOlderOnTracked) {
                        markdown += `User posts **older ages** on tracked subreddits!\n`;
                        markdown += `- Tracked: ${comparison.trackedAgeRange.ages.join(', ')}\n`;
                        markdown += `- Other: ${comparison.otherAgeRange.ages.join(', ')}\n\n`;
                    } else if (comparison.onlyYoungerOnTracked) {
                        markdown += `User posts **younger ages** on tracked subreddits.\n`;
                        markdown += `- Tracked: ${comparison.trackedAgeRange.ages.join(', ')}\n`;
                        markdown += `- Other: ${comparison.otherAgeRange.ages.join(', ')}\n\n`;
                    } else {
                        markdown += 'Age discrepancy detected between tracked and other subreddits.\n\n';
                    }
                }

                markdown += '| Category | Ages Posted | Post Count | Subreddits |\n';
                markdown += '|----------|-------------|------------|------------|\n';
                markdown += `| Your Tracked Subs | ${comparison.trackedAgeRange ? comparison.trackedAgeRange.ages.join(', ') : 'N/A'} | ${comparison.tracked.posts.length} | ${Array.from(comparison.tracked.subreddits).map(s => `r/${s}`).join(', ') || 'None'} |\n`;
                markdown += `| Other Subreddits | ${comparison.otherAgeRange ? comparison.otherAgeRange.ages.join(', ') : 'N/A'} | ${comparison.other.posts.length} | ${Array.from(comparison.other.subreddits).slice(0, 5).map(s => `r/${s}`).join(', ')}${comparison.other.subreddits.size > 5 ? '...' : ''} |\n`;
            }
            break;

        case 'birthday':
            markdown += `#### Birthday Estimate - u/${username}\n\n`;
            const birthday = analysis.birthdayEstimate;
            if (!birthday || birthday.confidence === 'None') {
                markdown += birthday && birthday.reason ? birthday.reason : 'Unable to estimate birthday from available data.\n';
            } else {
                markdown += `- **Estimated Birthday:** ${birthday.range}\n`;
                markdown += `- **Confidence:** ${birthday.confidence}\n`;
                if (birthday.transitionCount) {
                    markdown += `- **Based on:** ${birthday.transitionCount} age transition${birthday.transitionCount > 1 ? 's' : ''}\n`;
                }
                if (birthday.dayRange && birthday.dayRange.transitionsUsed) {
                    markdown += `- **Day Precision:** ${birthday.dayRange.transitionsUsed} transition${birthday.dayRange.transitionsUsed > 1 ? 's' : ''} used\n`;
                }
            }
            break;

        case 'couples':
            markdown += `#### Couples Account Detection - u/${username}\n\n`;
            const couples = analysis.couplesAnalysis;
            if (!couples || !couples.isCouplesAccount) {
                markdown += '✓ No couples/shared account pattern detected.\n';
            } else {
                markdown += `⚠️ **Likely Couples/Shared Account** (${couples.confidence} Confidence)\n\n`;
                markdown += `- **Detection Method:** ${couples.detectionMethod || 'Multiple signals'}\n`;

                const track1Avg = couples.tracks[0] ? (couples.tracks[0].ageRange.min + couples.tracks[0].ageRange.max) / 2 : 0;
                const track2Avg = couples.tracks[1] ? (couples.tracks[1].ageRange.min + couples.tracks[1].ageRange.max) / 2 : 0;
                const avgGap = Math.abs(track1Avg - track2Avg);

                markdown += `- **Average Age Gap:** ${avgGap.toFixed(0)} years\n`;
                markdown += `- **Gap Consistency:** ${(couples.ageGapConsistency * 100).toFixed(0)}%\n`;
                markdown += `- **Post Interleaving:** ${(couples.interleaveRatio * 100).toFixed(0)}%\n\n`;

                couples.tracks.forEach(track => {
                    markdown += `### ${track.name}\n`;
                    markdown += `- Age Range: ${track.ageRange.min} - ${track.ageRange.max}\n`;
                    markdown += `- Estimated Current Age: ${track.currentAgeEstimate ? `~${track.currentAgeEstimate}` : 'Unknown'}\n`;
                    if (track.birthdayEstimate && track.birthdayEstimate.confidence !== 'None') {
                        markdown += `- Birthday: ${track.birthdayEstimate.range} (${track.birthdayEstimate.confidence})\n`;
                    }
                    markdown += `- Post Count: ${track.postCount}\n\n`;
                });
            }
            break;

        case 'timeline':
            markdown += `#### Age Timeline - u/${username}\n\n`;
            if (analysis.timeline.length === 0) {
                markdown += 'No timeline data available.\n';
            } else {
                // Get the displayed entries from the DOM (includes compression info)
                const timelineContent = document.querySelector(`[data-section="timeline"]`)
                    ?.closest('.deep-analysis-section')
                    ?.querySelector('.deep-analysis-content');

                const entriesData = timelineContent?.dataset.timelineEntries
                    ? JSON.parse(timelineContent.dataset.timelineEntries)
                    : null;

                markdown += '| Date | Age | Change | Subreddit |\n';
                markdown += '|------|-----|--------|-----------|\n';

                if (entriesData && entriesData.length > 0) {
                    // Use the compressed display data
                    entriesData.forEach((entry, idx) => {
                        if (entry.isCompressed) {
                            const compressedText = entry.trackedInCompressed > 0
                                ? `[Compressed: ${entry.compressedCount + entry.trackedInCompressed} posts]`
                                : `[Compressed: ${entry.compressedCount} posts]`;
                            markdown += `| ${entry.startDate} - ${entry.endDate} | ${entry.age} | — | ${compressedText} |\n`;
                        } else {
                            // Extract info from the timeline point
                            const point = analysis.timeline[entry.index];
                            if (point) {
                                const date = new Date(point.timestamp * 1000).toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'short', day: 'numeric'
                                });
                                const prevAge = entry.index > 0 ? analysis.timeline[entry.index - 1].age : null;
                                let changeText = '';

                                if (entry.index === 0 || prevAge === null) {
                                    changeText = '(First)';
                                } else if (point.age > prevAge) {
                                    const ageDiff = point.age - prevAge;
                                    const emoji = ageDiff === 1 ? '📈' : '🛑';
                                    changeText = `${emoji} +${ageDiff}`;
                                } else if (point.age < prevAge) {
                                    changeText = `⚠️ ${point.age - prevAge}`;
                                } else {
                                    changeText = '—';
                                }

                                markdown += `| ${date} | ${point.age} | ${changeText} | /r/${point.subreddit} |\n`;
                            }
                        }
                    });
                } else {
                    // Fallback to old behavior if no compressed data
                    const displayTimeline = analysis.timeline.slice(-50);
                    let prevAge = null;
                    displayTimeline.forEach((point, idx) => {
                        const date = new Date(point.timestamp * 1000).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        });
                        let changeText = '';

                        if (idx === 0 || prevAge === null) {
                            changeText = '(First)';
                        } else if (point.age > prevAge) {
                            const ageDiff = point.age - prevAge;
                            const emoji = ageDiff === 1 ? '📈' : '🛑';
                            changeText = `${emoji} +${ageDiff}`;
                        } else if (point.age < prevAge) {
                            changeText = `⚠️ ${point.age - prevAge}`;
                        } else {
                            changeText = '—';
                        }

                        markdown += `| ${date} | ${point.age} | ${changeText} | /r/${point.subreddit} |\n`;
                        prevAge = point.age;
                    });

                    const hiddenCount = analysis.timeline.length - displayTimeline.length;
                    if (hiddenCount > 0) {
                        markdown += `\n*Showing most recent 50 entries. ${hiddenCount} older entries hidden.*\n`;
                    }
                }
            }
            break;
    }

    return markdown;
}

function showDeepAnalysisModal(username, ageData, analysis) {
    // Update button cache since we're displaying this data
    updateButtonCacheForUser(username, ageData);

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
    const customButtonsHTML = renderCustomButtons(username, ageData);
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
            ${customButtonsHTML}
            ${overviewHTML}
            ${anomaliesHTML}
            ${birthdayHTML}
            ${couplesHTML}
            ${subredditHTML}
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
            <button class="age-modal-button" id="fetch-more-data">Fetch More Data (${userSettings.paginationLimit} posts)</button>
            <button class="age-modal-button manual-search-deep">Manual Search</button>
            <button class="age-modal-button secondary">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    makeDraggable(modal);
    modal.addEventListener('mousedown', () => {
        bringToFront(modal);
        normalizeModalPosition(modal);
    });

    // Update all buttons for this user on the page
    updateButtonForUser(username);

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

    const manualSearchBtn = modal.querySelector('.manual-search-deep');
    manualSearchBtn.onclick = () => {
        showManualSearchModal({ username });
    };

    // Attach custom button handlers
    attachCustomButtonHandlers(modal);

    // Collapsible sections
    modal.querySelectorAll('.deep-analysis-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking the copy button
            if (e.target.classList.contains('deep-analysis-copy')) {
                return;
            }
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.deep-analysis-toggle');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▶ Show' : '▼ Hide';
        });
    });

    // Copy buttons
    modal.querySelectorAll('.deep-analysis-copy').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent header toggle
            const sectionType = btn.dataset.section;
            const markdown = copyDeepAnalysisSectionAsMarkdown(sectionType, analysis, username);

            try {
                await navigator.clipboard.writeText(markdown);

                // Visual feedback
                const originalText = btn.textContent;
                btn.textContent = '✓';
                btn.classList.add('copied');

                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('copied');
                }, 1500);
            } catch (err) {
                console.error('Copy failed:', err);
                btn.textContent = '✗';
                setTimeout(() => {
                    btn.textContent = '📋';
                }, 1500);
            }
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

            const newResults = await searchUserAgesWithPagination(username, earliestTimestamp, userSettings.paginationLimit);

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

            // Update button cache
            updateButtonCacheForUser(username, mergedAgeData);

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
            fetchMoreBtn.textContent = `Fetch More Data (${userSettings.paginationLimit} posts)`;

            // Re-attach event handlers for collapsible sections
            attachDeepAnalysisHandlers(modal, modalId, username);

            // Notify any open results modals for this user
            notifyResultsModalOfNewData(username);

        } catch (error) {
            console.error('Fetch more error:', error);
            fetchMoreBtn.textContent = `Error: ${error.message}`;
        }
    };
}

function notifyResultsModalOfNewData(username) {
    // Find any results modals for this username
    const resultsModal = resultsModals.find(m =>
        m.username === username &&
        m.modal.querySelector('.age-results-container') // Ensure it's a results modal, not deep analysis
    );

    if (!resultsModal) return;

    // Check if banner already exists
    if (resultsModal.modal.querySelector('.age-new-data-banner')) return;

    // Create notification banner
    const banner = document.createElement('div');
    banner.className = 'age-new-data-banner';
    banner.innerHTML = `
        <span>📊 New data available (click to refresh with updated results)</span>
    `;
    banner.style.cssText = `
        background-color: var(--av-primary);
        color: white;
        padding: 10px 15px;
        margin-bottom: 10px;
        border-radius: 4px;
        cursor: pointer;
        text-align: center;
        font-weight: bold;
        animation: pulse 2s infinite;
    `;

    // Add click handler to refresh the modal
    banner.onclick = () => {
        const cachedData = getCachedAgeData(username);
        if (cachedData) {
            // Close current modal
            closeModalById(resultsModal.modalId);
            // Open fresh modal with new data
            showResultsModal(username, cachedData);
        }
    };

    // Insert banner at the top of modal content
    const modalContent = resultsModal.modal.querySelector('.age-modal-content');
    if (modalContent) {
        modalContent.insertBefore(banner, modalContent.firstChild);
    }
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

                const newResults = await searchUserAgesWithPagination(username, earliestTimestamp, userSettings.paginationLimit);

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
                fetchMoreBtn.textContent = `Fetch More Data (${userSettings.paginationLimit} posts)`;

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
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="deep-analysis-copy" data-section="overview" title="Copy as Markdown">📋</button>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
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
                    <span class="analysis-stat-value">${analysis.filteredPossibleAges.length > 0 ? analysis.filteredPossibleAges.map(age => `~${age}`).join(', ') : 'None'}</span>
                </div>
                ${analysis.possibleAges.length > analysis.filteredPossibleAges.length ? `
                <div class="analysis-stat-row">
                    <span class="analysis-stat-label" style="font-size: 11px; color: var(--av-text-muted);">Excluded (below threshold)</span>
                    <span class="analysis-stat-value" style="font-size: 11px; color: var(--av-text-muted);">${analysis.possibleAges.filter(age => age < userSettings.minPotentialAge).join(', ')}</span>
                </div>
                ` : ''}
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
    const staleAges = analysis.staleAges || [];

    if (backwardsAging.length === 0 && staleAges.length === 0) {
        return `
            <div class="deep-analysis-section">
                <div class="deep-analysis-header">
                    <span class="deep-analysis-title">⚠️ Anomalies & Age Inconsistencies</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="deep-analysis-copy" data-section="anomalies" title="Copy as Markdown">📋</button>
                        <span class="deep-analysis-toggle">▼ Hide</span>
                    </div>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: var(--av-success);">✓ No age anomalies detected. User ages normally over time.</p>
                </div>
            </div>
        `;
    }

    let backwardsHTML = '';
    if (backwardsAging.length > 0) {
        const anomaliesHTML = backwardsAging.map(a => `
            <div class="anomaly-item">
                <div class="anomaly-description">
                    Age dropped from <strong>${a.fromAge}</strong> to <strong>${a.toAge}</strong>
                    (${a.ageDrop} year${a.ageDrop !== 1 ? 's' : ''} younger)
                </div>
                <div class="anomaly-date">
                    ${a.fromDate} (r/${a.fromSubreddit}) → ${a.toDate} (r/${a.toSubreddit})
                    <br>${a.daysBetween} days between posts
                    <a href="${a.permalink}" target="_blank" style="margin-left: 10px; color: var(--av-primary);">View Post →</a>
                </div>
            </div>
        `).join('');

        backwardsHTML = `
            <div style="margin-bottom: 20px;">
                <p style="color: #ff6b6b; font-weight: bold; margin-bottom: 10px;">
                    🔴 Backwards Aging Detected (${backwardsAging.length} instance${backwardsAging.length > 1 ? 's' : ''})
                </p>
                <p style="color: #ff6b6b; margin-bottom: 15px; font-size: 13px;">
                    User posted as a younger age AFTER claiming to be older. This indicates age falsification or a couples account.
                </p>
                ${anomaliesHTML}
            </div>
        `;
    }

    let staleHTML = '';
    if (staleAges.length > 0) {
        const severityColors = {
            'High': '#ff6b6b',
            'Medium': 'var(--av-warning)',
            'Low': '#ffa500'
        };

        const staleAgesHTML = staleAges.map(s => `
            <div class="anomaly-item" style="border-left-color: ${severityColors[s.severity]};">
                <div class="anomaly-description" style="color: ${severityColors[s.severity]};">
                    <strong>${s.severity} Severity:</strong> Posted as age <strong>${s.age}</strong> for ${s.monthsSpan} months
                    (${s.daysSpan} days, ${s.postCount} post${s.postCount !== 1 ? 's' : ''})
                </div>
                <div class="anomaly-date">
                    First: ${s.firstDate} (r/${s.firstSubreddit})
                    <a href="${s.firstPermalink}" target="_blank" style="margin-left: 10px; color: var(--av-primary);">View →</a>
                    <br>
                    Last: ${s.lastDate} (r/${s.lastSubreddit})
                    <a href="${s.lastPermalink}" target="_blank" style="margin-left: 10px; color: var(--av-primary);">View →</a>
                </div>
            </div>
        `).join('');

        staleHTML = `
            <div style="margin-bottom: 20px;">
                <p style="color: var(--av-warning); font-weight: bold; margin-bottom: 10px;">
                    ⏰ Stale Age Detection (${staleAges.length} instance${staleAges.length > 1 ? 's' : ''})
                </p>
                <p style="color: var(--av-warning); margin-bottom: 15px; font-size: 13px;">
                    User posted the same age for over a year, indicating consistent age falsification.
                    <br><span style="font-size: 11px;">Severity: Low (13-14mo), Medium (14-15mo), High (15+mo)</span>
                </p>
                ${staleAgesHTML}
            </div>
        `;
    }

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">⚠️ Anomalies & Age Inconsistencies</span>
                <span class="deep-analysis-toggle">▼ Hide</span>
            </div>
            <div class="deep-analysis-content">
                ${backwardsHTML}
                ${staleHTML}
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
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="deep-analysis-copy" data-section="subreddit" title="Copy as Markdown">📋</button>
                        <span class="deep-analysis-toggle">▼ Hide</span>
                    </div>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: var(--av-text-muted);">No tracked subreddits configured. Add subreddits in Settings to compare age behavior.</p>
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
            warningHTML = `<p style="color: var(--av-warning); margin-bottom: 15px;">
                ⚠️ User posts younger ages on your subreddits.
                <br>Posts as ${comparison.trackedAgeRange.ages.join(', ')} on tracked subs, but ${comparison.otherAgeRange.ages.join(', ')} elsewhere.
            </p>`;
        } else {
            warningHTML = `<p style="color: var(--av-warning); margin-bottom: 15px;">
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
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="deep-analysis-copy" data-section="subreddit" title="Copy as Markdown">📋</button>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
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
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="deep-analysis-copy" data-section="birthday" title="Copy as Markdown">📋</button>
                        <span class="deep-analysis-toggle">▼ Hide</span>
                    </div>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: var(--av-text-muted);">
                        ${birthday && birthday.reason ? birthday.reason : 'Unable to estimate birthday from available data.'}
                    </p>
                    <p style="color: var(--av-text-muted); font-size: 12px; margin-top: 10px;">
                        Birthday estimation requires consistent age progression data (ideally seeing a user turn from one age to the next).
                    </p>
                </div>
            </div>
        `;
    }

    const confidenceColors = {
        'High': 'var(--av-success)',
        'Medium': 'var(--av-warning)',
        'Low': '#ffa500',
        'Very Low': '#ff6b6b'
    };

    const dayPrecisionNote = birthday.dayRange && birthday.dayRange.transitionsUsed ?
        `<div style="color: var(--av-text-muted); font-size: 11px; margin-top: 8px;">
            Day-level precision from ${birthday.dayRange.transitionsUsed} transition${birthday.dayRange.transitionsUsed > 1 ? 's' : ''}
            ${birthday.dayRange.note ? ` (${birthday.dayRange.note})` : ''}
        </div>` : '';

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
                    ${dayPrecisionNote}
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
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="deep-analysis-copy" data-section="couples" title="Copy as Markdown">📋</button>
                        <span class="deep-analysis-toggle">▼ Hide</span>
                    </div>
                </div>
                <div class="deep-analysis-content">
                    <p style="color: var(--av-success);">✓ No couples/shared account pattern detected.</p>
                    <p style="color: var(--av-text-muted); font-size: 12px; margin-top: 10px;">
                        ${couples ? couples.explanation : 'Couples detection looks for two distinct age groups that both age appropriately over time.'}
                    </p>
                    ${couples && couples.ageGapConsistency > 0 ? `
                    <p style="color: var(--av-text-muted); font-size: 11px; margin-top: 5px;">
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
                <p style="color: var(--av-warning); margin-bottom: 15px;">
                    ⚠️ This appears to be a shared/couples account with two people of different ages.
                </p>
                <div style="background-color: var(--av-surface); padding: 10px; border-radius: 4px; margin-bottom: 15px;">
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
                    <p style="color: var(--av-text-muted);">No timeline data available.</p>
                </div>
            </div>
        `;
    }

    const trackedSubs = (userSettings.trackedSubreddits || []).map(s => s.toLowerCase());
    const totalEntries = analysis.timeline.length;
    const minEntries = userSettings.timelineCompressionMinEntries || 50;

    // For small datasets, show all entries
    if (totalEntries <= minEntries) {
        return buildTimelineFull(analysis, trackedSubs);
    }

    // For larger datasets, use tiered compression
    return buildTimelineCompressed(analysis, trackedSubs);
}

function buildTimelineFull(analysis, trackedSubs) {
    const timelineEntries = [];
    let prevAge = null;

    analysis.timeline.forEach((point, idx) => {
        const entry = createTimelineEntry(point, idx, prevAge, trackedSubs);
        timelineEntries.push(entry.html);
        prevAge = point.age;
    });

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📅 Age Timeline (${analysis.timeline.length} entries)</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="deep-analysis-copy" data-section="timeline" title="Copy as Markdown">📋</button>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
            </div>
            <div class="deep-analysis-content">
                ${timelineEntries.join('')}
            </div>
        </div>
    `;
}

function buildTimelineCompressed(analysis, trackedSubs) {
    const timeline = analysis.timeline;
    const maxVisibleRows = 150;
    const contextPosts = userSettings.timelineContextPosts || 3;
    const shownIndices = new Set(); // Track which indices we've already displayed
    const displayEntries = [];

    let i = 0;

    while (i < timeline.length) {
        // Skip if already shown
        if (shownIndices.has(i)) {
            i++;
            continue;
        }

        const point = timeline[i];
        const prevAge = i > 0 ? timeline[i - 1].age : null;

        // Detect age change
        const isAgeChange = prevAge !== null && point.age !== prevAge;
        const isFirstPost = i === 0;

        if (isFirstPost || isAgeChange) {
            // Show context posts BEFORE the age change
            if (isAgeChange) {
                const contextStart = Math.max(0, i - contextPosts);
                for (let j = contextStart; j < i; j++) {
                    if (!shownIndices.has(j)) {
                        const contextPoint = timeline[j];
                        const contextPrevAge = j > 0 ? timeline[j - 1].age : null;
                        const entry = createTimelineEntry(contextPoint, j, contextPrevAge, trackedSubs);
                        displayEntries.push({ html: entry.html, index: j, isCompressed: false });
                        shownIndices.add(j);
                    }
                }
            }

            // Show the age change post (or first post)
            const entry = createTimelineEntry(point, i, prevAge, trackedSubs);
            displayEntries.push({ html: entry.html, index: i, isCompressed: false });
            shownIndices.add(i);
            i++;

            // Show context posts AFTER the age change
            const afterContextEnd = Math.min(i + contextPosts, timeline.length);
            for (let j = i; j < afterContextEnd; j++) {
                if (!shownIndices.has(j)) {
                    const contextPoint = timeline[j];
                    const contextPrevAge = timeline[j - 1].age;
                    const entry = createTimelineEntry(contextPoint, j, contextPrevAge, trackedSubs);
                    displayEntries.push({ html: entry.html, index: j, isCompressed: false });
                    shownIndices.add(j);
                }
            }
            i = afterContextEnd;
        } else {
            // We're in a stable age period - find its extent
            const stableAgeStart = i;
            let stableAgeEnd = i;

            while (stableAgeEnd < timeline.length && timeline[stableAgeEnd].age === point.age) {
                stableAgeEnd++;
            }

            const stableLength = stableAgeEnd - stableAgeStart;

            // If stable period is short, show all
            const compressionThreshold = userSettings.timelineCompressionThreshold || 10;
            if (stableLength < compressionThreshold) {
                for (let j = stableAgeStart; j < stableAgeEnd; j++) {
                    if (!shownIndices.has(j)) {
                        const p = timeline[j];
                        const pPrevAge = j > 0 ? timeline[j - 1].age : null;
                        const entry = createTimelineEntry(p, j, pPrevAge, trackedSubs);
                        displayEntries.push({ html: entry.html, index: j, isCompressed: false });
                        shownIndices.add(j);
                    }
                }
                i = stableAgeEnd;
            } else {
                // Long stable period - compress the middle
                const showFirst = 2; // Show first 2 posts of stable period
                const showLast = 2;  // Show last 2 posts of stable period

                // Show first N posts
                for (let j = stableAgeStart; j < Math.min(stableAgeStart + showFirst, stableAgeEnd); j++) {
                    if (!shownIndices.has(j)) {
                        const p = timeline[j];
                        const pPrevAge = j > 0 ? timeline[j - 1].age : null;
                        const entry = createTimelineEntry(p, j, pPrevAge, trackedSubs);
                        displayEntries.push({ html: entry.html, index: j, isCompressed: false });
                        shownIndices.add(j);
                    }
                }

                // Create compression row for the middle
                const compressStart = stableAgeStart + showFirst;
                const compressEnd = stableAgeEnd - showLast;
                const compressedCount = Math.max(0, compressEnd - compressStart);

                if (compressedCount > 0) {
                    // Count tracked subs in compressed section
                    let trackedInCompressed = 0;
                    for (let j = compressStart; j < compressEnd; j++) {
                        if (trackedSubs.includes(timeline[j].subreddit.toLowerCase())) {
                            trackedInCompressed++;
                        }
                    }

                    const startDate = new Date(timeline[compressStart].timestamp * 1000).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                    });
                    const endDate = new Date(timeline[compressEnd - 1].timestamp * 1000).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                    });

                    const compressedText = trackedInCompressed > 0
                        ? `[Compressed: ${compressedCount} posts, ${trackedInCompressed} in tracked subs]`
                        : `[Compressed: ${compressedCount} posts]`;

                    const compressedHtml = `
                        <div class="timeline-entry age-same" style="opacity: 0.6;">
                            <span class="timeline-date">${startDate} - ${endDate}</span>
                            <span class="timeline-age">Age: ${point.age}</span>
                            <span class="timeline-change">—</span>
                            <span class="timeline-subreddit">${compressedText}</span>
                        </div>
                    `;
                    displayEntries.push({
                        html: compressedHtml,
                        index: compressStart,
                        isCompressed: true,
                        compressedCount: compressedCount,
                        trackedInCompressed: trackedInCompressed,
                        age: point.age,
                        startDate: startDate,
                        endDate: endDate
                    });

                    // Mark compressed range as shown
                    for (let j = compressStart; j < compressEnd; j++) {
                        shownIndices.add(j);
                    }
                }

                // Show last N posts
                for (let j = Math.max(compressEnd, stableAgeStart + showFirst); j < stableAgeEnd; j++) {
                    if (!shownIndices.has(j)) {
                        const p = timeline[j];
                        const pPrevAge = timeline[j - 1].age;
                        const entry = createTimelineEntry(p, j, pPrevAge, trackedSubs);
                        displayEntries.push({ html: entry.html, index: j, isCompressed: false });
                        shownIndices.add(j);
                    }
                }

                i = stableAgeEnd;
            }
        }
    }

    // If still too many entries, trim from the beginning (keep most recent)
    const finalDisplay = displayEntries.length > maxVisibleRows
        ? displayEntries.slice(-maxVisibleRows)
        : displayEntries;

    const hiddenCount = displayEntries.length - finalDisplay.length;
    const compressionNote = hiddenCount > 0
        ? `<p style="color: var(--av-text-muted); margin-bottom: 10px; font-size: 12px;">Showing ${finalDisplay.length} entries. ${hiddenCount} older entries hidden.</p>`
        : '';

    return `
        <div class="deep-analysis-section">
            <div class="deep-analysis-header">
                <span class="deep-analysis-title">📅 Age Timeline (${analysis.timeline.length} entries)</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="deep-analysis-copy" data-section="timeline" title="Copy as Markdown">📋</button>
                    <span class="deep-analysis-toggle">▼ Hide</span>
                </div>
            </div>
            <div class="deep-analysis-content" data-timeline-entries='${JSON.stringify(finalDisplay)}'>
                ${compressionNote}
                ${finalDisplay.map(e => e.html).join('')}
            </div>
        </div>
    `;
}

function createTimelineEntry(point, idx, prevAge, trackedSubs) {
    let entryClass = 'age-same';
    let changeText = '';

    const agePrefix = point.isPotential ? '~' : '';
    const ageDisplay = `${agePrefix}${point.age}`;

    if (idx === 0 || prevAge === null) {
        entryClass = 'first-post';
        changeText = '(First)';
    } else if (point.age > prevAge) {
        entryClass = 'age-increase';
        const ageDiff = point.age - prevAge;
        const emoji = ageDiff === 1 ? '📈' : '🛑';
        changeText = `${emoji} +${ageDiff}`;
    } else if (point.age < prevAge) {
        entryClass = 'age-decrease';
        changeText = `⚠️ ${point.age - prevAge}`;
    } else {
        changeText = '—';
    }

    const isTracked = trackedSubs.includes(point.subreddit.toLowerCase());
    const trackedStyle = isTracked ? 'font-weight: bold;' : '';

    const potentialStyle = point.isPotential ? 'opacity: 0.75; font-style: italic;' : '';

    const html = `
        <div class="timeline-entry ${entryClass}">
            <span class="timeline-date">${new Date(point.timestamp * 1000).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            })}</span>
            <span class="timeline-age" style="color: ${entryClass === 'age-decrease' ? '#ff6b6b' : 'var(--av-text)'}; ${potentialStyle}">
                Age: <a href="${point.permalink}" target="_blank" style="color: inherit; text-decoration: underline;">${ageDisplay}</a>
            </span>
            <span class="timeline-change">${changeText}</span>
            <span class="timeline-subreddit" style="${trackedStyle}"><a href="https://old.reddit.com/r/${point.subreddit}" target="_blank" style="color: var(--av-link);">r/${point.subreddit}</a></span>
        </div>
    `;

    return { html, isTracked };
}

// ============================================================================
// DELETED AUTHOR RESTORATION MODULE
// ============================================================================

// Get deleted author cache
function getDeletedContentCache() {
    const cached = GM_getValue(DELETED_CONTENT_CACHE_KEY, '{}');
    return JSON.parse(cached);
}

// Cache deleted author data (now includes full post content)
function cacheDeletedContent(thingId, data) {
    const cache = getDeletedContentCache();
    cache[thingId] = data;
    GM_setValue(DELETED_CONTENT_CACHE_KEY, JSON.stringify(cache));
}

// Get cached author for a thing ID
function getCachedDeletedAuthor(thingId) {
    const cache = getDeletedContentCache();
    return cache[thingId] || null;
}

// Store all restore buttons for "Restore All" functionality
const restoreButtonRegistry = [];

// Track which thing IDs we've already attempted to restore (prevents infinite loops)
const processedDeletedAuthors = new Set();

function initDeletedAuthorRestore() {
    logDebug('[DEBUG] initDeletedAuthorRestore() called at', new Date().toLocaleTimeString());
    if (!userSettings.showRestoreButtons) return;

    const cache = getDeletedContentCache();

    // Find all spans and em tags containing exactly "[deleted]" inside tagline paragraphs
    // This catches both expanded comments (span) and collapsed comments (em)
    const allElements = document.querySelectorAll('p.tagline span, p.tagline em, .entry .tagline span:first-of-type:not(.flair)');
    const deletedSpans = Array.from(allElements).filter(elem =>
        elem.textContent.trim() === '[deleted]' && !elem.classList.contains('edited-timestamp')
    );

    deletedSpans.forEach(deletedSpan => {
        // Extract thing ID from parent context FIRST (before other checks)
        const thingId = extractThingId(deletedSpan);
        if (!thingId) {
            return; // Silently skip if we can't get thing ID
        }

        // CRITICAL: Check global processed set to prevent infinite loops
        if (processedDeletedAuthors.has(thingId)) {
            return; // Already processed this thing ID, skip silently
        }

        // Mark as processed immediately to prevent reprocessing during DOM mutations
        processedDeletedAuthors.add(thingId);

        // Check if content is also deleted (for logging purposes)
        const hasDeletedContent = checkForDeletedContent(deletedSpan, thingId);
        if (hasDeletedContent) {
            logDebug(`Thing ${thingId} has deleted content as well as deleted author`);
        }

        // Check cache first
        const cachedResult = cache[thingId];

        if (cachedResult) {
            logDebug(`Cached result for ${thingId}:`, cachedResult);
            logDebug(`Cached result type: ${typeof cachedResult}`);
            if (typeof cachedResult === 'object') {
                logDebug(`Has body: ${!!cachedResult.body}, Body value: ${cachedResult.body}`);
                logDebug(`Has selftext: ${!!cachedResult.selftext}, Selftext value: ${cachedResult.selftext}`);
            }

            // CRITICAL: Get thing container BEFORE replacing deletedSpan
            const thingContainer = deletedSpan.closest('div.thing');

            // Handle both old string format and new object format
            const username = typeof cachedResult === 'string' ? cachedResult : cachedResult?.username;
            const fullname = typeof cachedResult === 'object' ? cachedResult?.fullname : null;

            // Always auto-restore from cache (no API call needed)
            if (username === '[deleted]') {
                // Confirmed deleted in archive
                displayConfirmedDeleted(deletedSpan);
            } else {
                // Valid restored username - skip button injection since Toolbox will add them
                displayRestoredAuthor(deletedSpan, username, fullname, false);

                // Also restore content from cache if available
                if (typeof cachedResult === 'object' && thingContainer) {
                    logDebug('Checking if cached content is restorable...');

                    const hasRestorableBody = cachedResult.body &&
                        cachedResult.body !== '[deleted]' &&
                        cachedResult.body !== '[removed]';
                    const hasRestorableSelftext = cachedResult.selftext &&
                        cachedResult.selftext !== '[deleted]' &&
                        cachedResult.selftext !== '[removed]';

                    logDebug(`hasRestorableBody: ${hasRestorableBody}`);
                    logDebug(`hasRestorableSelftext: ${hasRestorableSelftext}`);

                    if (hasRestorableBody || hasRestorableSelftext) {
                        logDebug('Restoring content from cache for', thingId);
                        displayRestoredContent(thingContainer, thingId, cachedResult);
                    } else {
                        logDebug('Content not restorable (already deleted in archive)');
                    }
                } else if (typeof cachedResult === 'object' && !thingContainer) {
                    logDebug('ERROR: Could not find thing container for content restoration');
                }
            }
        } else {
            // Not cached: show manual restore button
            injectRestoreButton(deletedSpan, thingId, null);
        }
    });

    // ALSO check for removed content where author still exists (only process unprocessed things)
    document.querySelectorAll('div.thing:not([data-removed-checked])').forEach(thing => {
        const thingId = thing.dataset.fullname || thing.id?.replace('thing_', '');
        if (!thingId) {
            // Mark as checked even if no thingId to avoid reprocessing
            thing.setAttribute('data-removed-checked', 'true');
            return;
        }

        // Mark as checked immediately to prevent reprocessing
        thing.setAttribute('data-removed-checked', 'true');

        // Check if author is NOT deleted
        const authorLink = thing.querySelector('.tagline a.author');
        if (!authorLink || authorLink.textContent === '[deleted]') return;

        // Check if content IS removed - need to check multiple possible locations
        let bodyMd = thing.querySelector('.entry .usertext-body > div.md');

        // For comments, might also be nested differently
        if (!bodyMd) {
            bodyMd = thing.querySelector('.entry div.md');
        }

        if (!bodyMd) return;

        const currentText = bodyMd.textContent.trim();
        logDebug(`[Removed Check] Thing ${thingId}: "${currentText}"`);

        if (currentText === '[removed]' || currentText === '[ Removed by Reddit ]') {
            logDebug('Found removed content with active author:', thingId);

            // Check cache
            const cachedResult = cache[thingId];
            if (cachedResult && typeof cachedResult === 'object' &&
                (cachedResult.body || cachedResult.selftext)) {
                // Auto-restore from cache
                logDebug('Auto-restoring removed content from cache for', thingId);
                displayRestoredContent(thing, thingId, cachedResult);
            } else {
                // Inject Restore button in the tagline after the PushShift button
                const tagline = thing.querySelector('.tagline');
                if (tagline && !tagline.querySelector('.restore-deleted-btn')) {
                    logDebug('Injecting Restore button for removed content');
                    injectRestoreButton(tagline, thingId, null);
                }
            }
        }
    });

}

// Check if the post/comment content is also deleted
function checkForDeletedContent(authorElement, thingId) {
    // Find the parent thing container
    const thing = authorElement.closest('div.thing');
    if (!thing) return false;

    // Check for deleted comment body
    if (thingId.startsWith('t1_')) {
        const commentBody = thing.querySelector('.entry .usertext-body > div.md > p');
        if (commentBody) {
            const bodyText = commentBody.textContent.trim();
            return bodyText === '[deleted]' || bodyText === '[removed]' || bodyText === '[ Removed by Reddit ]';
        }
    }

    // Check for deleted submission body
    if (thingId.startsWith('t3_')) {
        const submissionBody = thing.querySelector('.entry .usertext-body > div.md');
        if (submissionBody) {
            const bodyText = submissionBody.textContent.trim();
            return bodyText === '[deleted]' || bodyText === '[removed]' || bodyText === '[ Removed by Reddit ]';
        }
    }

    return false;
}

// Extract thing ID from various Reddit DOM structures
function extractThingId(authorElement) {
    logDebug('=== EXTRACT THING ID ===');
    logDebug('Author element:', authorElement);

    // PRIORITY: For comments, always try to find the direct parent thing first
    // Strategy 1: Look for closest parent div with id="thing_t1_xxx" (comment)
    let parent = authorElement.closest('div.thing[id^="thing_t1_"]');
    if (parent && parent.id) {
        const thingId = parent.id.replace('thing_', '');
        logDebug('Strategy 1 (thing_t1_ id - COMMENT) found:', thingId);
        logDebug('Parent element:', parent);
        return thingId;
    }

    // Strategy 2: Look for parent with data-fullname starting with t1_ (comment)
    parent = authorElement.closest('[data-fullname^="t1_"]');
    if (parent && parent.dataset.fullname) {
        logDebug('Strategy 2 (data-fullname t1_ - COMMENT) found:', parent.dataset.fullname);
        logDebug('Parent element:', parent);
        return parent.dataset.fullname;
    }

    // Strategy 3: Look for ANY parent thing with id
    parent = authorElement.closest('div.thing[id^="thing_"]');
    if (parent && parent.id) {
        const thingId = parent.id.replace('thing_', '');
        logDebug('Strategy 3 (thing_ id - FALLBACK) found:', thingId);
        logDebug('Parent element:', parent);
        return thingId;
    }

    // Strategy 4: Look for parent with any data-fullname
    parent = authorElement.closest('[data-fullname]');
    if (parent && parent.dataset.fullname) {
        logDebug('Strategy 4 (data-fullname - FALLBACK) found:', parent.dataset.fullname);
        logDebug('Parent element:', parent);
        return parent.dataset.fullname;
    }

    // Strategy 5: Parse from permalink (LAST RESORT - often gets submission ID)
    parent = authorElement.closest('[data-permalink]');
    if (parent && parent.dataset.permalink) {
        // Try to extract comment ID from permalink first
        const commentMatch = parent.dataset.permalink.match(/\/comments\/[^\/]+\/[^\/]+\/([^\/]+)/);
        if (commentMatch) {
            const thingId = 't1_' + commentMatch[1];
            logDebug('Strategy 5 (permalink - COMMENT) found:', thingId);
            return thingId;
        }

        // Fall back to submission ID
        const submissionMatch = parent.dataset.permalink.match(/\/comments\/([^\/]+)/);
        if (submissionMatch) {
            const thingId = 't3_' + submissionMatch[1];
            logDebug('Strategy 5 (permalink - SUBMISSION) found:', thingId);
            return thingId;
        }
    }

    logDebug('ERROR: No thing ID found!');
    return null;
}

// Inject the restore button
function injectRestoreButton(authorElement, thingId, cachedUsername) {
    const button = document.createElement('button');
    button.textContent = 'Restore';
    button.className = 'restore-deleted-btn';
    button.dataset.thingId = thingId;
    button.style.cssText = 'margin-left: 5px; font-size: 10px; padding: 1px 4px; cursor: pointer;';

    button.onclick = async () => {
        // Check if we have a token first
        if (!apiToken) {
            button.disabled = true;
            button.textContent = 'Restoring...';

            // Store restoration context for auto-resume
            GM_setValue('pendingRestoration', JSON.stringify({
                thingId: thingId,
                timestamp: Date.now()
            }));

            attemptAutoFetchToken();
            showTokenModal();
            return;
        }

        // Proceed with restoration
        await performRestoration(authorElement, button, thingId, cachedUsername);
    };

    // Add right-click context menu
    button.oncontextmenu = (e) => {
        e.preventDefault();
        showRestoreContextMenu(e, button);
    };

    authorElement.parentNode.insertBefore(button, authorElement.nextSibling);

    // Register button for "Restore All" functionality
    restoreButtonRegistry.push({
        button: button,
        thingId: thingId,
        authorElement: authorElement,
        cachedUsername: cachedUsername
    });
}

// Show context menu for restore button
function showRestoreContextMenu(event, button) {
    // Remove any existing context menu
    const existingMenu = document.getElementById('restore-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.id = 'restore-context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.clientX}px;
        top: ${event.clientY}px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        padding: 5px 0;
        min-width: 180px;
    `;

    const restoreAllOption = document.createElement('div');
    restoreAllOption.textContent = 'Restore/Undelete All';
    restoreAllOption.style.cssText = `
        padding: 8px 15px;
        cursor: pointer;
        font-size: 12px;
    `;
    restoreAllOption.onmouseover = () => restoreAllOption.style.background = '#f0f0f0';
    restoreAllOption.onmouseout = () => restoreAllOption.style.background = 'white';
    restoreAllOption.onclick = () => {
        menu.remove();
        restoreAll();
    };

    menu.appendChild(restoreAllOption);
    document.body.appendChild(menu);

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

// Restore all deleted authors and content on the page
async function restoreAll() {
    if (!apiToken) {
        showNotificationBanner('Fetching API token... Please authorize when prompted.', 4000);
        attemptAutoFetchToken();
        showTokenModal();
        return;
    }

    if (restoreButtonRegistry.length === 0) {
        showNotificationBanner('No deleted content found on this page.', 3000);
        return;
    }

    logDebug(`=== RESTORE ALL - Processing ${restoreButtonRegistry.length} items ===`);

    const totalItems = restoreButtonRegistry.length;
    let successCount = 0;
    let deletedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    // Show initial notification (no auto-hide)
    showNotificationBanner(`Processing 0/${totalItems} items...`, 0);

    // Filter out already processed items
    const itemsToProcess = restoreButtonRegistry.filter(entry => {
        if (entry.button.disabled || entry.button.textContent === 'Failed') {
            skippedCount++;
            return false;
        }
        return true;
    });

    // Validate and clamp worker count
    const workerCount = Math.min(Math.max(1, userSettings.restoreAllWorkers || 2), 5);
    logDebug(`Using ${workerCount} concurrent workers`);

    // Process items with limited concurrency
    const processItem = async (entry) => {
        processedCount++;

        // Update progress notification
        showNotificationBanner(`Restoring ${processedCount}/${totalItems}...`, 0, true);

        logDebug(`Restoring: ${entry.thingId}`);
        const result = await performRestoration(entry.authorElement, entry.button, entry.thingId, entry.cachedUsername);

        if (result === 'success') {
            successCount++;
        } else if (result === 'deleted') {
            deletedCount++;
        } else if (result === 'failed') {
            failedCount++;
        }

        // Small delay between requests to be respectful to API
        await new Promise(resolve => setTimeout(resolve, 500));
    };

    // Create worker pools that process items concurrently
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        const workerItems = itemsToProcess.filter((_, index) => index % workerCount === i);
        workers.push(
            (async () => {
                for (const entry of workerItems) {
                    await processItem(entry);
                }
            })()
        );
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    const totalProcessed = successCount + deletedCount;

    logDebug('=== RESTORE ALL COMPLETE ===');
    logDebug(`Success: ${successCount}, Deleted: ${deletedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);

    // Build final notification message
    let message = `✓ Processed ${totalProcessed}/${totalItems} items successfully.`;
    if (deletedCount > 0) {
        message += ` ${deletedCount} item${deletedCount !== 1 ? 's were' : ' was'} confirmed deleted.`;
    }
    if (failedCount > 0) {
        message += ` Unable to restore ${failedCount} item${failedCount !== 1 ? 's' : ''}.`;
    }

    // Show final completion notification (10 second auto-hide), updating the existing banner
    showNotificationBanner(message, 10000, true);
}

// Perform the actual restoration (called by both direct click and resume flow)
// Returns: 'success' if restored, 'deleted' if confirmed deleted, 'failed' if error
async function performRestoration(authorElement, button, thingId, cachedUsername) {
    button.disabled = true;
    button.textContent = 'Restoring...';

    logDebug('=== PERFORM RESTORATION ===');
    logDebug('Thing ID:', thingId);
    logDebug('Author element:', authorElement);

    // If cached, use that; otherwise query PushShift
    const result = cachedUsername || await fetchDeletedAuthor(thingId);

    logDebug('Fetch result:', result);
    logDebug('Result type:', typeof result);

    const username = typeof result === 'string' ? result : result?.username;
    const fullname = typeof result === 'object' ? result?.fullname : null;

    logDebug('Extracted username:', username);
    logDebug('Extracted fullname:', fullname);

    if (username === '[deleted]') {
        // PushShift archived it but author was already deleted
        displayConfirmedDeleted(authorElement);
        cacheDeletedContent(thingId, username);
        button.remove();
        return 'deleted';
    } else if (username) {
        // CRITICAL: Get thing container BEFORE replacing authorElement
        const thingContainer = authorElement.closest('div.thing');

        displayRestoredAuthor(authorElement, username, fullname);
        cacheDeletedContent(thingId, typeof result === 'string' ? result : result);

        // Also restore content if available
        if (result && typeof result === 'object') {
            logDebug('Attempting to restore content...');
            logDebug('Has body:', !!result.body);
            logDebug('Has selftext:', !!result.selftext);
            logDebug('Body content:', result.body);
            logDebug('Selftext content:', result.selftext);
            // Pass the thing container directly instead of authorElement
            displayRestoredContent(thingContainer, thingId, result);
        } else {
            logDebug('No content to restore - result is not an object or is null');
        }

        button.remove();
        return 'success';
    } else {
        button.textContent = 'Failed';
        button.disabled = false;
        return 'failed';
    }
}

// Resume a pending restoration after OAuth completes
async function resumeRestoration(thingId) {
    logDebug('=== RESUME RESTORATION FLOW START ===');
    logDebug(`Resuming restoration for thingId: ${thingId}`);

    // Find the button for this thingId
    const button = document.querySelector(`.restore-deleted-btn[data-thing-id="${thingId}"]`);
    if (!button) {
        logDebug('ERROR: Could not find restore button to resume');
        return;
    }
    logDebug('Button found:', button);

    // Get the parent tagline paragraph
    const tagline = button.closest('p.tagline');
    if (!tagline) {
        logDebug('ERROR: Could not find parent tagline');
        return;
    }
    logDebug('Tagline found:', tagline);

    // Find the [deleted] span with data-restore-processed attribute
    let authorElement = tagline.querySelector('[data-restore-processed="true"]');

    // If not found by attribute, search for any span with [deleted] text
    if (!authorElement) {
        const allSpans = tagline.querySelectorAll('span');
        for (const span of allSpans) {
            if (span.textContent.trim() === '[deleted]') {
                authorElement = span;
                break;
            }
        }
    }

    if (!authorElement) {
        logDebug('ERROR: Could not find [deleted] span in tagline');
        return;
    }

    logDebug('authorElement found:', authorElement);
    logDebug('authorElement.textContent:', authorElement.textContent);

    // Now execute the exact same logic as the original onclick handler
    button.disabled = true;
    button.textContent = 'Restoring...';

    // If cached, use that; otherwise query PushShift
    const cachedResult = getCachedDeletedAuthor(thingId);
    const result = cachedResult || await fetchDeletedAuthor(thingId);

    // Handle both old string format and new object format
    const username = typeof result === 'string' ? result : result?.username;
    const fullname = typeof result === 'object' ? result?.fullname : null;

    logDebug('Username returned:', username, 'Fullname:', fullname);

    if (username === '[deleted]') {
        displayConfirmedDeleted(authorElement);
        cacheDeletedContent(thingId, result);
        button.remove();
    } else if (username) {
        displayRestoredAuthor(authorElement, username, fullname);
        cacheDeletedContent(thingId, result);
        button.remove();
    } else {
        button.textContent = 'Failed';
        button.disabled = false;
    }
    logDebug('=== RESUME RESTORATION FLOW END ===');
}

// Query PushShift for deleted author
async function fetchDeletedAuthor(thingId) {
    try {
        if (!apiToken) {
            logDebug('No API token available for deleted author restoration');
            return null;
        }

        const type = thingId.startsWith('t3_') ? 'submission' : 'comment';
        const id = thingId.substring(3); // Remove 't3_' or 't1_' prefix

        const fields = 'author,author_fullname,body,selftext,title,created_utc,permalink';
        const url = `https://api.pushshift.io/reddit/${type}/search?ids=${id}&fields=${fields}`;

        logDebug(`Fetching deleted author for ${thingId}: ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        logDebug(`Response status: ${response.status} ${response.statusText}`);

        // Handle expired/invalid token
        if (response.status === 401 || response.status === 403) {
            logDebug('Token expired or invalid for deleted author restoration');
            clearToken();
            throw new Error('Token expired or invalid');
        }

        if (!response.ok) {
            logDebug(`Failed to fetch deleted author: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        logDebug(`API response data:`, data);

        if (data.data && data.data.length > 0 && data.data[0].author) {
            const post = data.data[0];
            const author = post.author;
            const authorFullname = post.author_fullname || null; // May not always be present

            // Build full data object including content
            const fullData = {
                username: author,
                fullname: authorFullname,
                body: post.body || null,  // For comments
                selftext: post.selftext || null,  // For submissions
                title: post.title || null,  // For submissions
                created_utc: post.created_utc || null,
                permalink: post.permalink || null,
                author: author  // Store original author for content display
            };

            // Return [deleted] as-is - it means PushShift archived it but author was already deleted
            if (author === '[deleted]') {
                logDebug(`Author was already deleted in PushShift archive, returning '[deleted]'`);
                fullData.username = author;
                fullData.fullname = null;
                return fullData;
            } else {
                logDebug(`Successfully restored author: ${author}, fullname: ${authorFullname}`);
                return fullData;
            }
        }

        logDebug(`No author found in response (empty data array or missing author field)`);
        return null;
    } catch (error) {
        console.error('Error fetching deleted author:', error);
        logDebug(`Exception in fetchDeletedAuthor:`, error);
        return null;
    }
}

// Display confirmed deleted (PushShift archived as [deleted])
function displayConfirmedDeleted(authorElement) {
    const deletedSpan = document.createElement('span');
    deletedSpan.className = 'confirmed-deleted';
    deletedSpan.textContent = '[deleted]';
    deletedSpan.style.cssText = 'color: #ff4444; font-weight: normal; cursor: default;';
    deletedSpan.title = 'Confirmed: Author was already deleted when archived by PushShift';

    // Replace the [deleted] element
    authorElement.parentNode.replaceChild(deletedSpan, authorElement);
}

// Display the restored username
function displayRestoredAuthor(authorElement, username, fullname = null, injectButtons = true) {
    // CRITICAL: Replace the [deleted] span with a proper <a class="author"> element
    // This is what toolbox expects to find
    const restoredLink = document.createElement('a');
    let className = 'author may-blank restored-author';
    if (fullname) {
        // Extract just the ID part from fullname (e.g., "t2_abc123" -> "abc123")
        const userId = fullname.startsWith('t2_') ? fullname.substring(3) : fullname;
        className += ` id-t2_${userId}`;
        logDebug('Added user fullname class:', fullname);
    }
    restoredLink.className = className;
    // Note: We can't get the user's t2_ fullname for deleted accounts, so we can't add id-t2_xxx class
    restoredLink.textContent = username;
    restoredLink.href = `https://old.reddit.com/user/${username}`;
    restoredLink.target = '_blank';
    restoredLink.style.cssText = 'color: darkgreen; font-weight: bold;';
    restoredLink.title = 'Restored from archive (post or profile deleted)';

    // Replace the [deleted] span with our new author link
    authorElement.parentNode.replaceChild(restoredLink, authorElement);

    // CRITICAL: Add data-author, data-author-fullname, data-subreddit AND data-permalink back to the parent div.thing
    // Toolbox needs all of these to build thingDetails for usernotes
    const thing = restoredLink.closest('div.thing');
    if (thing) {
        thing.setAttribute('data-author', username);
        if (fullname) {
            thing.setAttribute('data-author-fullname', fullname);
        }

        // Get subreddit for the thing element
        const subreddit = extractSubredditFromContext(restoredLink);
        if (subreddit) {
            thing.setAttribute('data-subreddit', subreddit);
            thing.setAttribute('data-subreddit-prefixed', `r/${subreddit}`);
            logDebug('Added data-subreddit to div.thing:', subreddit);
        }

        // CRITICAL: Toolbox needs data-permalink to build thingDetails
        // Try to get existing permalink or construct it from the thing's fullname
        if (!thing.dataset.permalink) {
            const thingFullname = thing.dataset.fullname;
            if (thingFullname) {
                // Construct permalink based on thing type
                if (thingFullname.startsWith('t1_')) {
                    // Comment - try to get from parent post or data-context
                    const contextAttr = thing.dataset.context;
                    if (contextAttr) {
                        thing.setAttribute('data-permalink', contextAttr);
                        logDebug('Set data-permalink from data-context:', contextAttr);
                    }
                } else if (thingFullname.startsWith('t3_')) {
                    // Submission - construct from URL or data-url
                    const submissionId = thingFullname.substring(3);
                    if (subreddit) {
                        const permalink = `/r/${subreddit}/comments/${submissionId}/`;
                        thing.setAttribute('data-permalink', permalink);
                        logDebug('Set data-permalink for submission:', permalink);
                    }
                }
            } else {
                logDebug('WARNING: Could not set data-permalink - no data-fullname on thing');
            }
        }

        logDebug('Thing attributes set:', {
            author: username,
            fullname: fullname || 'none',
            subreddit: thing.dataset.subreddit || 'none',
            permalink: thing.dataset.permalink || 'none',
            thingFullname: thing.dataset.fullname || 'none'
        });
    } else {
        logDebug('WARNING: Could not find parent div.thing to add data-author');
    }

    // Only inject buttons if requested (manual restoration needs them immediately,
    // but cached restoration on page load should skip them as Toolbox will add them)
    if (injectButtons) {
        // Create PushShift button
        const pushShiftBtn = document.createElement('button');
        pushShiftBtn.className = 'age-check-button';
        pushShiftBtn.dataset.username = username;
        pushShiftBtn.textContent = userSettings.defaultButtonText;
        pushShiftBtn.style.cssText = `background-color: ${userSettings.buttonDefaultColor}; margin-left: 5px;`;
        pushShiftBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAgeCheck(username);
        };

        // Right-click context menu
        pushShiftBtn.oncontextmenu = (e) => {
            e.preventDefault();
            showContextMenu(e, username, pushShiftBtn);
        };

        // Insert button after restored link
        restoredLink.parentNode.insertBefore(pushShiftBtn, restoredLink.nextSibling);

        // Extract subreddit and add toolbox buttons
        const subreddit = extractSubredditFromContext(restoredLink);
        if (subreddit) {
            const thingId = extractThingId(restoredLink);
            logDebug('Creating toolbox buttons - thingId:', thingId, 'subreddit:', subreddit);

            // CRITICAL: Don't replace toolbox placeholder nodes - mutate them in place
            const existingToolboxContainer = pushShiftBtn.parentNode.querySelector('.tb-jsapi-author-container');

            if (existingToolboxContainer) {
                logDebug('Found existing toolbox container, populating in place');
                let toolboxSpan = existingToolboxContainer.querySelector('span[data-name="toolbox"]');

                if (!toolboxSpan) {
                    // Create it if it doesn't exist
                    toolboxSpan = document.createElement('span');
                    toolboxSpan.setAttribute('data-name', 'toolbox');
                    existingToolboxContainer.appendChild(toolboxSpan);
                }

                // Mutate the existing span in place - don't replace it
                toolboxSpan.className = 'tb-frontend-container ut-thing';
                toolboxSpan.setAttribute('data-subreddit', subreddit);
                toolboxSpan.setAttribute('data-author', username);
                const tbType = thingId && thingId.startsWith('t3_') ? 'TBpostAuthor' : 'TBcommentAuthor';
                toolboxSpan.setAttribute('data-tb-type', tbType);

                // Clear existing content and append buttons
                toolboxSpan.textContent = '';
                const buttonsFragment = createToolboxButtonsFragment(username, subreddit, restoredLink, thingId);
                toolboxSpan.appendChild(buttonsFragment);

            } else {
                // No existing container - create new one
                logDebug('No existing toolbox container, creating new one');
                const toolboxContainer = createToolboxButtons(username, subreddit, restoredLink, thingId);
                pushShiftBtn.parentNode.insertBefore(toolboxContainer, pushShiftBtn.nextSibling);
            }
        }
    }
}

// Display restored content (comment body or submission selftext)
function displayRestoredContent(thingContainer, thingId, postData) {
    logDebug('=== DISPLAY RESTORED CONTENT ===');
    logDebug('Thing ID:', thingId);
    logDebug('Thing container:', thingContainer);
    logDebug('Post data:', postData);

    if (!thingContainer) {
        logDebug('Cannot restore content: thing container not found');
        return;
    }

    const thing = thingContainer;

    // Check if content is actually deleted before restoring
    let entry = thing.querySelector('.entry');
    if (!entry) {
        logDebug('Cannot restore content: entry container not found');
        return;
    }

    // Check if the content body shows [deleted] or [removed]
    const bodyMd = thing.querySelector('.entry .usertext-body > div.md');
    if (bodyMd) {
        const currentText = bodyMd.textContent.trim();
        if (currentText !== '[deleted]' && currentText !== '[removed]' && currentText !== '[ Removed by Reddit ]') {
            logDebug('Content is not deleted, skipping restoration to avoid duplication');
            return;
        }
    }

    // Determine if this is a comment or submission
    const isComment = thingId.startsWith('t1_');
    const contentText = isComment ? postData.body : postData.selftext;

    if (!contentText || contentText === '[deleted]' || contentText === '[removed]') {
        logDebug('No content to restore or content was already deleted in archive');
        return;
    }

    // Check if this is a collapsed comment
    const isCollapsed = thing.classList.contains('collapsed');

    // Find or create the body container
    let bodyContainer;

    if (!entry) {
        logDebug('Cannot restore content: entry container not found');
        return;
    }

    if (isComment) {
        // For collapsed comments, we need to expand them or inject differently
        if (isCollapsed) {
            // Expand the comment first
            thing.classList.remove('collapsed');
            thing.classList.add('noncollapsed');
            logDebug('Expanded collapsed comment for content restoration');
        }

        // Try to find existing body container
        bodyContainer = thing.querySelector('.entry .usertext-body > div.md');

        // If still not found, look for the usertext container and inject there
        if (!bodyContainer) {
            const usertext = thing.querySelector('.entry form.usertext');
            if (usertext) {
                // Create the missing structure
                const usertextBody = document.createElement('div');
                usertextBody.className = 'usertext-body';
                const md = document.createElement('div');
                md.className = 'md';
                usertextBody.appendChild(md);

                // Insert before the usertext form or at the end of entry
                entry.insertBefore(usertextBody, usertext);
                bodyContainer = md;
                logDebug('Created missing usertext-body structure for collapsed comment');
            }
        }
    } else {
        // For submissions
        bodyContainer = thing.querySelector('.entry .usertext-body > div.md');
    }

    if (!bodyContainer) {
        logDebug('Cannot restore content: body container not found even after expansion');
        return;
    }

    // Check if content was already restored
    if (bodyContainer.querySelector('.og.restored-content')) {
        logDebug('Content already restored, skipping');
        return;
    }

    // Create restored content element with yellow background
    const restoredContent = document.createElement('div');
    restoredContent.className = 'og restored-content';
    restoredContent.style.cssText = `
        background: rgb(255, 245, 157) !important;
        color: black !important;
        opacity: 0.96;
        padding: 5px;
        margin: 5px 0;
        border-radius: 3px;
        font-size: 14px;
        line-height: 1.5;
    `;

    // Convert markdown to HTML (basic conversion)
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = convertMarkdownToHTML(contentText);
    restoredContent.appendChild(contentDiv);

    // Add horizontal rule
    const hr = document.createElement('hr');
    hr.style.cssText = 'border: none; border-bottom: 1px solid #666; background: transparent; margin: 10px 0;';
    restoredContent.appendChild(hr);

    // Add metadata footer
    const metadataDiv = document.createElement('div');
    metadataDiv.style.cssText = 'font-size: 12px;';

    metadataDiv.appendChild(document.createTextNode('Posted by '));

    const authorLink = document.createElement('a');
    authorLink.href = `/user/${postData.author}`;
    authorLink.textContent = postData.author;
    authorLink.style.cssText = 'color: #3e88a0; text-decoration: underline;';
    metadataDiv.appendChild(authorLink);

    if (postData.created_utc) {
        const timeAgo = getRelativeTimeString(postData.created_utc);
        metadataDiv.appendChild(document.createTextNode(' · ' + timeAgo));
    }

    restoredContent.appendChild(metadataDiv);

    // Clear the [deleted]/[removed] text first if it exists
    const deletedMarkers = bodyContainer.querySelectorAll('p, em');
    deletedMarkers.forEach(marker => {
        const text = marker.textContent.trim();
        if (text === '[deleted]' || text === '[removed]' || text === '[ Removed by Reddit ]') {
            marker.style.display = 'none';
        }
    });

    // Insert the restored content at the beginning
    bodyContainer.insertBefore(restoredContent, bodyContainer.firstChild);

    logDebug('Content restored successfully');
}

// Convert relative timestamp to human-readable string
function getRelativeTimeString(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
}

// Basic markdown to HTML converter
function convertMarkdownToHTML(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Convert markdown formatting
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>'); // Bold + italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // Bold
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>'); // Italic
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>'); // Strikethrough
    html = html.replace(/`(.+?)`/g, '<code>$1</code>'); // Inline code

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #3e88a0; text-decoration: underline;">$1</a>');

    // Blockquotes
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote style="border-left: 4px solid #c5c1ad; padding: 0 8px; margin: 5px 0;">$1</blockquote>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// Extract subreddit from page context for toolbox buttons
function extractSubredditFromContext(authorElement) {
    // Strategy 1: Try to get from URL
    const urlMatch = window.location.pathname.match(/\/r\/([^\/]+)\//);
    if (urlMatch) {
        return urlMatch[1];
    }

    // Strategy 2: Try to get from parent element's permalink
    const parent = authorElement.closest('[data-permalink]');
    if (parent && parent.dataset.permalink) {
        const permalinkMatch = parent.dataset.permalink.match(/\/r\/([^\/]+)\//);
        if (permalinkMatch) {
            return permalinkMatch[1];
        }
    }

    // Strategy 3: Try to find comments link in the thing container
    const thingContainer = authorElement.closest('div.thing');
    if (thingContainer) {
        const commentsLink = thingContainer.querySelector('ul.flat-list.buttons > li.first > a');
        if (commentsLink && commentsLink.href) {
            const commentsMatch = commentsLink.href.match(/\/r\/([^\/]+)\//);
            if (commentsMatch) {
                return commentsMatch[1];
            }
        }
    }

    logDebug('Could not extract subreddit for toolbox buttons');
    return null;
}

// Create buttons as a document fragment (for appending to existing nodes)
function createToolboxButtonsFragment(username, subreddit, authorElement, thingId) {
    const fragment = document.createDocumentFragment();

    // Create M button (mod actions)
    const modBtn = document.createElement('a');
    modBtn.href = 'javascript:;';
    modBtn.title = 'Perform various mod actions on this user';
    modBtn.className = 'global-mod-button tb-bracket-button';
    modBtn.setAttribute('data-subreddit', subreddit);
    modBtn.setAttribute('data-author', username);
    if (thingId) {
        modBtn.setAttribute('data-parentid', thingId);
    }
    modBtn.textContent = 'M';

    // Create H button (history)
    const historyBtn = document.createElement('a');
    historyBtn.href = 'javascript:;';
    historyBtn.className = 'user-history-button tb-bracket-button';
    historyBtn.setAttribute('data-author', username);
    historyBtn.setAttribute('data-subreddit', subreddit);
    historyBtn.title = 'view & analyze user\'s submission and comment history';
    historyBtn.textContent = 'H';

    // Create N button (notes)
    const notesBtn = document.createElement('a');
    notesBtn.href = 'javascript:;';
    notesBtn.id = 'add-user-tag';  // CRITICAL: Toolbox expects this exact ID
    notesBtn.className = 'tb-bracket-button tb-usernote-button add-usernote-' + subreddit;
    notesBtn.setAttribute('data-author', username);
    notesBtn.setAttribute('data-subreddit', subreddit);
    notesBtn.setAttribute('data-default-text', 'N');
    notesBtn.textContent = 'N';

    // Create P button (profile)
    const profileBtn = document.createElement('a');
    profileBtn.href = 'javascript:;';
    profileBtn.className = 'tb-user-profile tb-bracket-button';
    profileBtn.setAttribute('data-listing', 'overview');
    profileBtn.setAttribute('data-user', username);
    profileBtn.setAttribute('data-subreddit', subreddit);
    profileBtn.title = 'view & filter user\'s profile in toolbox overlay';
    profileBtn.textContent = 'P';

    // Append all buttons to fragment
    fragment.appendChild(modBtn);
    fragment.appendChild(historyBtn);
    fragment.appendChild(notesBtn);
    fragment.appendChild(profileBtn);

    return fragment;
}

// Create just the inner toolbox span with buttons (for populating existing containers)
function createToolboxButtonsInner(username, subreddit, authorElement, thingId) {
    const tbInner = document.createElement('span');
    tbInner.setAttribute('data-name', 'toolbox');
    // Detect if this is a submission (t3_) or comment (t1_)
    const tbType = thingId && thingId.startsWith('t3_') ? 'TBpostAuthor' : 'TBcommentAuthor';
    tbInner.setAttribute('data-tb-type', tbType);
    tbInner.className = 'tb-frontend-container ut-thing';
    tbInner.setAttribute('data-subreddit', subreddit);
    tbInner.setAttribute('data-author', username);

    // Create M button (mod actions)
    const modBtn = document.createElement('a');
    modBtn.href = 'javascript:;';
    modBtn.title = 'Perform various mod actions on this user';
    modBtn.className = 'global-mod-button tb-bracket-button';
    modBtn.setAttribute('data-subreddit', subreddit);
    modBtn.setAttribute('data-author', username);
    if (thingId) {
        modBtn.setAttribute('data-parentid', thingId);
    }
    modBtn.textContent = 'M';

    // Create H button (history)
    const historyBtn = document.createElement('a');
    historyBtn.href = 'javascript:;';
    historyBtn.className = 'user-history-button tb-bracket-button';
    historyBtn.setAttribute('data-author', username);
    historyBtn.setAttribute('data-subreddit', subreddit);
    historyBtn.title = 'view & analyze user\'s submission and comment history';
    historyBtn.textContent = 'H';

    // Create N button (notes)
    const notesBtn = document.createElement('a');
    notesBtn.href = 'javascript:;';
    notesBtn.id = 'add-user-tag';
    notesBtn.className = 'tb-bracket-button tb-usernote-button add-usernote-' + subreddit;
    notesBtn.setAttribute('data-author', username);
    notesBtn.setAttribute('data-subreddit', subreddit);
    notesBtn.setAttribute('data-default-text', 'N');
    notesBtn.textContent = 'N';

    // Create P button (profile)
    const profileBtn = document.createElement('a');
    profileBtn.href = 'javascript:;';
    profileBtn.className = 'tb-user-profile tb-bracket-button';
    profileBtn.setAttribute('data-listing', 'overview');
    profileBtn.setAttribute('data-user', username);
    profileBtn.setAttribute('data-subreddit', subreddit);
    profileBtn.title = 'view & filter user\'s profile in toolbox overlay';
    profileBtn.textContent = 'P';

    // Append all buttons to inner container
    tbInner.appendChild(modBtn);
    tbInner.appendChild(historyBtn);
    tbInner.appendChild(notesBtn);
    tbInner.appendChild(profileBtn);

    return tbInner;
}

// Create toolbox buttons container (full container with inner span)
function createToolboxButtons(username, subreddit, authorElement, thingId) {
    const toolboxContainer = document.createElement('span');
    toolboxContainer.className = 'tb-jsapi-author-container';

    const tbInner = createToolboxButtonsInner(username, subreddit, authorElement, thingId);
    toolboxContainer.appendChild(tbInner);

    return toolboxContainer;
}

// ============================================================================
// CUSTOM BUTTONS
// ============================================================================

function renderCustomButtons(username, ageData) {
    const enabledButtons = userSettings.customButtons.filter(btn => btn.enabled);
    if (enabledButtons.length === 0) {
        return '';
    }

    const postedAges = ageData.postedAges || [];
    const possibleAges = ageData.possibleAges || [];

    const placeholders = {
        author: username,
        age_min: postedAges.length > 0 ? Math.min(...postedAges) : '',
        age_max: postedAges.length > 0 ? Math.max(...postedAges) : '',
        posted_ages: postedAges.join(','),
        possible_ages: possibleAges.join(',')
    };

    const buttonsHTML = enabledButtons.map(btn => {
        const btnType = btn.type || 'link'; // Default to link for backward compatibility
        const styleClass = btn.style || 'primary';

        if (btnType === 'template') {
            // Text template button
            let template = btn.textTemplate || '';
            Object.keys(placeholders).forEach(key => {
                template = template.replace(new RegExp(`{{${key}}}`, 'g'), placeholders[key]);
            });

            // Base64 encode the template to safely store in data attribute
            const encodedTemplate = btoa(unescape(encodeURIComponent(template)));

            return `<button class="age-modal-button ${styleClass === 'primary' ? '' : styleClass}"
                            data-custom-template="${encodedTemplate}"
                            data-button-id="${btn.id}"
                            data-button-type="template">${escapeHtml(btn.label)}</button>`;
        } else {
            // Link button
            let url = btn.urlTemplate || '';
            Object.keys(placeholders).forEach(key => {
                url = url.replace(new RegExp(`{{${key}}}`, 'g'), placeholders[key]);
            });

            return `<button class="age-modal-button ${styleClass === 'primary' ? '' : styleClass}"
                            data-custom-url="${escapeHtml(url)}"
                            data-button-id="${btn.id}"
                            data-button-type="link">${escapeHtml(btn.label)}</button>`;
        }
    }).join('');

    return `
        <div class="age-custom-buttons-row" style="display: flex; gap: 10px; margin-bottom: 15px; padding: 12px; background-color: --av-analysis-header; border-radius: 6px;">
            ${buttonsHTML}
        </div>
    `;
}

function attachCustomButtonHandlers(modal) {
    modal.querySelectorAll('[data-button-type]').forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();

            const btnType = btn.dataset.buttonType;

            if (btnType === 'template') {
                // Copy template text to clipboard
                // Decode base64 template
                const encodedTemplate = btn.dataset.customTemplate;
                const template = decodeURIComponent(escape(atob(encodedTemplate)));

                try {
                    await navigator.clipboard.writeText(template);

                    // Visual feedback
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.backgroundColor = 'var(--av-success)';

                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.backgroundColor = '';
                    }, 1500);
                } catch (err) {
                    console.error('Copy failed:', err);
                    btn.textContent = '✗ Failed';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 1500);
                }
            } else {
                // Open link - use _blank for http(s), direct navigation for protocol handlers
                const url = btn.dataset.customUrl;
                if (url.startsWith('http://') || url.startsWith('https://')) {
                    window.open(url, '_blank');
                } else {
                    // Protocol handlers (tg://, mailto:, etc.) don't need new window
                    window.location.href = url;
                }
            }
        };
    });
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

        // Update button cache
        updateButtonCacheForUser(username, ageData);

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

// ============================================================================
// CONTEXT MENU
// ============================================================================

let activeContextMenu = null;

function showContextMenu(event, username, buttonElement = null) {
    event.preventDefault();

    // Close any existing context menu
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'age-context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';

    const cached = getCachedAgeData(username);

    // Check if we can extract submission context for "Search Title" option
    const canSearchTitle = buttonElement ? extractSubmissionContext(buttonElement) !== null : false;

    // Build custom buttons section
    const customButtons = userSettings.customButtons.filter(btn => btn.enabled && btn.showInContextMenu);
    const customButtonsHTML = customButtons.length > 0 ? `
        ${customButtons.map(btn => `
            <div class="age-context-menu-item" data-action="custom-button" data-button-id="${btn.id}">
                <span>${btn.type === 'template' ? '📋' : '🔗'}</span>
                <span>${escapeHtml(btn.label)}</span>
            </div>
        `).join('')}
        <div class="age-context-menu-separator"></div>
    ` : '';

    menu.innerHTML = `
        <div style="padding: 8px 16px; font-weight: bold; color: var(--av-text); border-bottom: 1px solid var(--av-border); background-color: var(--av-analysis-header);">
            u/${escapeHtml(username)}
        </div>
        <div class="age-context-menu-item" data-action="manual-search">
            <span>🔍</span>
            <span>Manual Search</span>
        </div>
        ${canSearchTitle ? `
        <div class="age-context-menu-item" data-action="search-title">
            <span>🔎</span>
            <span>Search Title</span>
        </div>
        ` : ''}
        <div class="age-context-menu-item" data-action="deep-analysis">
            <span>📊</span>
            <span>Deep Analysis</span>
        </div>
        <div class="age-context-menu-item" data-action="post-frequency">
            <span>📊</span>
            <span>Post Frequency</span>
        </div>
        <div class="age-context-menu-separator"></div>
        <div class="age-context-menu-item danger" data-action="ignore">
            <span>🚫</span>
            <span>Add to Ignored Users</span>
        </div>
        <div class="age-context-menu-separator"></div>
        ${customButtonsHTML}
        <div class="age-context-menu-item" data-action="settings">
            <span>⚙️</span>
            <span>Settings</span>
            <span class="age-context-menu-arrow">▶</span>
            <div class="age-context-submenu">
                <div class="age-context-menu-item" data-action="ignored-users">
                    <span>🚫</span>
                    <span>Ignored Users</span>
                </div>
                <div class="age-context-menu-item" data-action="tracked-subs">
                    <span>📍</span>
                    <span>Tracked Subreddits</span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Adjust position if menu would go off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (event.pageY - rect.height) + 'px';
    }

    // Handle menu item clicks
    menu.querySelectorAll('.age-context-menu-item').forEach(item => {
        item.onclick = async (e) => {
            e.stopPropagation();
            const action = item.dataset.action;

            closeContextMenu();

            switch (action) {
                case 'custom-button':
                    await handleCustomButtonClick(item.dataset.buttonId, username, getCachedAgeData(username));
                    break;

                case 'settings':
                    showSettingsModal();
                    break;

                case 'ignored-users':
                    showIgnoredUsersModal();
                    break;

                case 'tracked-subs':
                    showTrackedSubredditsModal();
                    break;

                case 'manual-search':
                    showManualSearchModal({ username });
                    break;

                case 'search-title':
                    if (buttonElement) {
                        const context = extractSubmissionContext(buttonElement);
                        if (context) {
                            showManualSearchModal({
                                subreddit: context.subreddit,
                                searchType: 'submission',
                                searchInput: context.title,
                                autoExecute: true
                            });
                        } else {
                            alert('Could not extract submission title and subreddit. This feature only works on submission pages.');
                        }
                    }
                    break;

                case 'deep-analysis':
                    await handleDeepAnalysisQuick(username);
                    break;

                case 'post-frequency':
                    await handlePostFrequencyQuick(username);
                    break;

                case 'ignore':
                    handleIgnoreUser(username);
                    break;
            }
        };
    });

    // Close menu on click outside
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
        document.addEventListener('contextmenu', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    if (activeContextMenu && activeContextMenu.parentNode) {
        activeContextMenu.parentNode.removeChild(activeContextMenu);
        activeContextMenu = null;
    }
    document.removeEventListener('click', closeContextMenu);
    document.removeEventListener('contextmenu', closeContextMenu);
}

async function handleDeepAnalysisQuick(username) {
    const cached = getCachedAgeData(username);

    if (cached) {
        // Already have data, go straight to deep analysis
        const analysis = performDeepAnalysis(cached, username);
        showDeepAnalysisModal(username, cached, analysis);
    } else {
        // Need to fetch data first
        if (!apiToken) {
            attemptAutoFetchToken();
            showTokenModal(username);
            return;
        }

        const loadingModalId = showLoadingModal(username);

        try {
            const results = await searchUserAges(username);
            const ageData = processResults(results, username);

            // Cache the results
            setCachedAgeData(username, ageData);
            updateButtonCacheForUser(username, ageData);
            updateButtonForUser(username);

            // Close loading modal
            closeModalById(loadingModalId);

            // Go straight to deep analysis
            const analysis = performDeepAnalysis(ageData, username);
            showDeepAnalysisModal(username, ageData, analysis);
        } catch (error) {
            console.error('Age check error:', error);
            closeModalById(loadingModalId);
            showErrorModal(username, error.message);

            if (error.message.includes('token') || error.message.includes('Token')) {
                setTimeout(() => {
                    showTokenModal(username);
                }, 100);
            }
        }
    }
}

async function handlePostFrequencyQuick(username) {
    showFrequencyModal(username);
}


async function handleCustomButtonClick(buttonId, username, ageData) {
    const btn = userSettings.customButtons.find(b => b.id === buttonId);
    if (!btn) return;

    const postedAges = ageData?.postedAges || [];
    const possibleAges = ageData?.possibleAges || [];

    const placeholders = {
        author: username,
        age_min: postedAges.length > 0 ? Math.min(...postedAges) : '',
        age_max: postedAges.length > 0 ? Math.max(...postedAges) : '',
        posted_ages: postedAges.join(','),
        possible_ages: possibleAges.join(',')
    };

    if (btn.type === 'template') {
        // Copy template to clipboard
        let template = btn.textTemplate || '';
        Object.keys(placeholders).forEach(key => {
            template = template.replace(new RegExp(`{{${key}}}`, 'g'), placeholders[key]);
        });

        try {
            await navigator.clipboard.writeText(template);
            showNotificationBanner(`✓ Copied "${btn.label}" to clipboard`, 1500);
        } catch (err) {
            console.error('Copy failed:', err);
            showNotificationBanner(`✗ Failed to copy "${btn.label}"`, 1500);
        }
    } else {
        // Navigate to URL
        let url = btn.urlTemplate || '';
        Object.keys(placeholders).forEach(key => {
            url = url.replace(new RegExp(`{{${key}}}`, 'g'), placeholders[key]);
        });

        if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank');
        } else {
            window.location.href = url;
        }
    }
}

function handleIgnoreUser(username) {
    // Add to ignored users list
    if (!userSettings.ignoredUsers.includes(username)) {
        userSettings.ignoredUsers.push(username);
        saveSettings(userSettings);

        // Remove all buttons for this user
        document.querySelectorAll(`.age-check-button[data-username="${username}"]`).forEach(btn => {
            btn.remove();
        });

        // Show notification
        showNotificationBanner(`Added u/${username} to ignored users`, 2000);
    }
}

function handleUnignoreUser(username) {
    // Remove from ignored users list
    const index = userSettings.ignoredUsers.findIndex(u => u.toLowerCase() === username.toLowerCase());
    if (index !== -1) {
        userSettings.ignoredUsers.splice(index, 1);
        saveSettings(userSettings);

        // Re-run the main loop to add buttons back for this user
        activeProcessor();

        // Show notification
        showNotificationBanner(`Removed u/${username} from ignored users`, 2000);
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

    // Check button cache first (lightweight)
    const buttonText = getButtonCacheText(username);
    if (buttonText) {
        button.textContent = buttonText;
        button.classList.add('cached');
    } else {
        button.textContent = userSettings.defaultButtonText;
    }

    button.onclick = () => handleAgeCheck(username);

    // Right-click context menu
    button.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e, username, button);
    };

    return button;
}

function updateButtonForUser(username) {
    const buttons = document.querySelectorAll(`.age-check-button[data-username="${username}"]`);
    buttons.forEach(button => {
        const buttonText = getButtonCacheText(username);
        if (buttonText) {
            button.textContent = buttonText;
            button.classList.add('cached');
        } else {
            button.textContent = userSettings.defaultButtonText;
            button.classList.remove('cached');
        }
    });
}

function updateButtonCacheForUser(username, ageData) {
    let displayText;
    if (ageData && ageData.postedAges && ageData.postedAges.length > 0) {
        const minAge = Math.min(...ageData.postedAges);
        const maxAge = Math.max(...ageData.postedAges);
        const ageText = minAge === maxAge ? minAge : `${minAge}-${maxAge}`;
        displayText = `Age: ${ageText}`;
    } else if (ageData) {
        displayText = 'No Posted Ages';
    } else {
        return; // Don't cache if no data
    }
    setButtonCacheText(username, displayText);
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
                const button = createAgeCheckButton(username);
                // Skip if button is null (user is ignored)
                if (button === null) {
                    continue;
                }
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

        const button = createAgeCheckButton(username);

        // Skip if button is null (user is ignored)
        if (button === null) {
            link.dataset.ageVerifierProcessed = 'true';
            return;
        }

        if (link.parentElement) {
            insertAfter(button, link);
            link.dataset.ageVerifierProcessed = 'true';
        }
    });
}

function processUserProfilePage() {
    logDebug('=== processUserProfilePage CALLED ===');
    logDebug('Current pathname:', window.location.pathname);

    // Only run on /user/* pages (matches /user/username, /user/username/submitted, etc.)
    const pathMatch = window.location.pathname.match(/^\/user\/[^\/]+/);
    logDebug('Path match result:', pathMatch);

    if (!pathMatch) {
        logDebug('Not a user profile page, skipping');
        return;
    }

    // Find the titlebox
    const titlebox = document.querySelector('.titlebox');
    logDebug('Titlebox found:', titlebox);

    if (!titlebox) {
        logDebug('No titlebox found, exiting');
        return;
    }

    // Find the username h1 element
    const usernameH1 = titlebox.querySelector('h1');
    logDebug('Username H1 found:', usernameH1);
    logDebug('H1 text content:', usernameH1?.textContent);

    if (!usernameH1) {
        logDebug('No h1 found in titlebox, exiting');
        return;
    }

    // Check if we've already injected buttons
    const existingContainer = titlebox.querySelector('.age-profile-buttons-container');
    logDebug('Existing container found:', existingContainer);

    if (existingContainer) {
        logDebug('Buttons already injected, exiting');
        return;
    }

    // Extract username from h1 or URL
    const username = usernameH1.textContent.trim() ||
                     window.location.pathname.match(/\/user\/([^\/]+)/)?.[1];

    logDebug('Extracted username:', username);

    if (!username) {
        logDebug('No username found, exiting');
        return;
    }

    // Check if user is ignored
    const ignoredUsers = getIgnoredUsersList();
    if (ignoredUsers.has(username.toLowerCase())) {
        logDebug('User is ignored, exiting');
        return;
    }

    logDebug('Creating button container...');

    // Create container for our buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'age-profile-buttons-container';
    buttonContainer.style.cssText = 'margin: 8px 0; display: flex; align-items: center; gap: 5px;';

    // Create PushShift button
    const pushShiftBtn = document.createElement('button');
    pushShiftBtn.className = 'age-check-button';
    pushShiftBtn.dataset.username = username;
    pushShiftBtn.style.cssText = `background-color: ${userSettings.buttonDefaultColor};`;

    // Check button cache
    const buttonText = getButtonCacheText(username);
    if (buttonText) {
        pushShiftBtn.textContent = buttonText;
        pushShiftBtn.classList.add('cached');
    } else {
        pushShiftBtn.textContent = userSettings.defaultButtonText;
    }

    pushShiftBtn.onclick = () => handleAgeCheck(username);
    pushShiftBtn.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e, username, pushShiftBtn);
    };

    buttonContainer.appendChild(pushShiftBtn);
    logDebug('PushShift button created');

    // Extract subreddit from URL if we're viewing their posts in a specific subreddit
    const subreddit = extractSubredditFromContext(titlebox);
    logDebug('Extracted subreddit:', subreddit);

    // Create toolbox buttons (use extracted subreddit or null)
    if (subreddit) {
        const toolboxContainer = createToolboxButtons(username, subreddit, usernameH1, null);
        buttonContainer.appendChild(toolboxContainer);
        logDebug('Toolbox buttons created with subreddit context');
    } else {
        // Create minimal toolbox buttons without subreddit context
        // Use a default subreddit from URL if available (e.g., viewing profile filtered by subreddit)
        const urlSubreddit = window.location.search.match(/[?&]subreddit=([^&]+)/)?.[1] || 'unknown';

        const toolboxContainer = document.createElement('span');
        toolboxContainer.className = 'tb-jsapi-author-container';

        const tbInner = document.createElement('span');
        tbInner.setAttribute('data-name', 'toolbox');
        tbInner.setAttribute('data-tb-type', 'TBpostAuthor'); // Default to post type for profile pages
        tbInner.className = 'tb-frontend-container ut-thing';
        tbInner.setAttribute('data-author', username);
        tbInner.setAttribute('data-subreddit', urlSubreddit); // Set fallback subreddit

        // Try to find a real thing ID from the first post/comment visible on the page
        //const firstThing = document.querySelector('[data-fullname^="t3_"], [data-fullname^="t1_"]');
        //const thingId = firstThing?.dataset?.fullname;
        let thingId = "t1_hj2mt15"

        // Create M button (mod actions) - only if we have a valid thing ID
        let modBtn = null;
        if (thingId) {
            modBtn = document.createElement('a');
            modBtn.href = 'javascript:;';
            modBtn.title = 'Perform various mod actions on this user';
            modBtn.className = 'global-mod-button tb-bracket-button';
            modBtn.setAttribute('data-author', username);
            modBtn.setAttribute('data-subreddit', urlSubreddit);
            modBtn.setAttribute('data-parentid', thingId);
            modBtn.textContent = 'M';
            logDebug('M button created with real thing ID:', thingId);
        } else {
            logDebug('No thing ID found on page, skipping M button');
        }

        // Create H button (history)
        const historyBtn = document.createElement('a');
        historyBtn.href = 'javascript:;';
        historyBtn.className = 'user-history-button tb-bracket-button';
        historyBtn.setAttribute('data-author', username);
        historyBtn.setAttribute('data-subreddit', urlSubreddit);
        historyBtn.title = 'view & analyze user\'s submission and comment history';
        historyBtn.textContent = 'H';

        // Create P button (profile)
        const profileBtn = document.createElement('a');
        profileBtn.href = 'javascript:;';
        profileBtn.className = 'tb-user-profile tb-bracket-button';
        profileBtn.setAttribute('data-listing', 'overview');
        profileBtn.setAttribute('data-user', username);
        profileBtn.setAttribute('data-subreddit', urlSubreddit);
        profileBtn.title = 'view & filter user\'s profile in toolbox overlay';
        profileBtn.textContent = 'P';

        if (modBtn) tbInner.appendChild(modBtn);
        tbInner.appendChild(historyBtn);
        tbInner.appendChild(profileBtn);

        toolboxContainer.appendChild(tbInner);
        buttonContainer.appendChild(toolboxContainer);
        logDebug('Toolbox buttons created without subreddit context');
    }

    // Insert button container after the h1 but before the +friends button
    usernameH1.parentNode.insertBefore(buttonContainer, usernameH1.nextSibling);
    logDebug('Button container inserted into DOM');
    logDebug('=== processUserProfilePage COMPLETE ===');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const isModReddit = location.hostname.includes('mod.reddit.com');
const activeProcessor = isModReddit ? processModReddit : processOldReddit;

let debounceTimer;
function debouncedMainLoop() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(activeProcessor, 1500);
}

// Load settings first
loadSettings();

// Load token on startup
loadToken();

// Register Tampermonkey context menu commands
GM_registerMenuCommand('⚙️ Open Settings', () => {
    showSettingsModal();
});

GM_registerMenuCommand('🔍 Manual Search', () => {
    showManualSearchModal();
});

GM_registerMenuCommand('👥 View Ignored Users', () => {
    showIgnoredUsersModal();
});

GM_registerMenuCommand('📍 View Tracked Subreddits', () => {
    showTrackedSubredditsModal();
});

// Initialize deleted author restoration on old/www reddit
if (!isModReddit) {
    // Run on initial load
    initDeletedAuthorRestore();

    // Debounce for deleted author restoration (separate from main loop)
    let restoreDebounceTimer;
    function debouncedRestore() {
        clearTimeout(restoreDebounceTimer);
        restoreDebounceTimer = setTimeout(() => {
            initDeletedAuthorRestore();
            processUserProfilePage();
            // CRITICAL: Run processOldReddit again after restoration to add Search buttons to restored authors
            processOldReddit();
        }, 500);
    }

    // Run on future DOM changes (append to debounced loop)
    const originalDebouncedMainLoop = debouncedMainLoop;
    debouncedMainLoop = function() {
        originalDebouncedMainLoop();
        debouncedRestore();
    };
} else {
    // For mod.reddit.com, still need profile page processing
    const originalDebouncedMainLoop = debouncedMainLoop;
    debouncedMainLoop = function() {
        originalDebouncedMainLoop();
        setTimeout(processUserProfilePage, 500);
    };
}

// Initialize user profile page buttons on load
processUserProfilePage();

// Set up mutation observer AFTER all debouncedMainLoop overrides
const observer = new MutationObserver(debouncedMainLoop);
observer.observe(document.body, { childList: true, subtree: true });

// Escape key handler to close topmost modal and context menu
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        // Close context menu if open
        if (activeContextMenu) {
            closeContextMenu();
            return;
        }

        // Find the modal with the highest z-index
        let topmostModal = null;
        let highestZIndex = -1;

        resultsModals.forEach(modalInfo => {
            if (modalInfo.modal && modalInfo.modal.parentNode) {
                const zIndex = parseInt(modalInfo.modal.style.zIndex) || 0;
                if (zIndex > highestZIndex) {
                    highestZIndex = zIndex;
                    topmostModal = modalInfo;
                }
            }
        });

        // Close the topmost modal if found
        if (topmostModal) {
            closeModalById(topmostModal.modalId);
        }
    }
});

// Initialize OAuth handlers
handleOAuthAutoClick();


// Debug helper functions (accessible from console)
window.ageVerifierDebug = {
    clearToken: function() {
        clearToken();
        console.log('[Age Verifier] Token cleared');
    },
    clearCache: function() {
        clearAllCache();
        console.log('[Age Verifier] Cache cleared');
    },
    getToken: function() {
        const tokenData = JSON.parse(GM_getValue('pushShiftToken', 'null'));
        if (tokenData && tokenData.token) {
            console.log('[Age Verifier] Token exists:', tokenData.token.substring(0, 20) + '...');
            console.log('[Age Verifier] Token age:', Math.round((Date.now() - tokenData.timestamp) / 1000 / 60), 'minutes');
        } else {
            console.log('[Age Verifier] No token stored');
        }
    }
};


logDebug(`Reddit Age Verifier ready for ${isModReddit ? 'mod.reddit.com' : 'old.reddit.com'}`);
logDebug(`Checking ages ${MIN_AGE}-${MAX_AGE} using PushShift API with exact_author=true`);
