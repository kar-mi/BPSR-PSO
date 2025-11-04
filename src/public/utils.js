// Shared utilities for BPSR-PSO frontend
// This module contains common constants, utilities, and functions used across
// script.js, history.js, and skills.js

// ============================================================================
// CONSTANTS
// ============================================================================

export const SERVER_URL = 'localhost:8990';

export const COLOR_HUES = [
    210, // Blue
    30, // Orange
    270, // Purple
    150, // Teal
    330, // Magenta
    60, // Yellow
    180, // Cyan
    0, // Red
    240, // Indigo
];

// ============================================================================
// COLOR MANAGEMENT
// ============================================================================

let colorIndex = 0;

/**
 * Get the next color shades for DPS and HPS from the color palette
 * @returns {{dps: string, hps: string}} Color strings in HSL format
 */
export function getNextColorShades() {
    const h = COLOR_HUES[colorIndex];
    colorIndex = (colorIndex + 1) % COLOR_HUES.length;
    const s = 90;
    const l_dps = 30;
    const l_hps = 20;

    const dpsColor = `hsl(${h}, ${s}%, ${l_dps}%)`;
    const hpsColor = `hsl(${h}, ${s}%, ${l_hps}%)`;
    return { dps: dpsColor, hps: hpsColor };
}

/**
 * Reset the color index to start from the beginning
 */
export function resetColorIndex() {
    colorIndex = 0;
}

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

/**
 * Format a number with K/M suffixes for readability
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
    if (isNaN(num)) return 'NaN';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
}

// ============================================================================
// PROFESSION/CLASS UTILITIES
// ============================================================================

/**
 * Generate HTML for a profession icon
 * @param {string} profession - The profession string (e.g., "Heavy Smasher" or "Heavy Smasher (Tank)")
 * @param {string} size - Size variant: 'normal' or 'small'
 * @returns {string} HTML string for the class icon
 */
export function getProfessionIconHtml(profession, size = 'normal') {
    let classIconHtml = '';
    const professionString = profession ? profession.trim() : '';
    if (professionString) {
        const mainProfession = professionString.split('(')[0].trim();
        const iconFileName = mainProfession.toLowerCase().replace(/ /g, '_') + '.png';
        const className = size === 'small' ? 'class-icon-small' : 'class-icon';
        classIconHtml = `<img src="assets/${iconFileName}" class="${className}" alt="${mainProfession}" onerror="this.style.display='none'">`;
    }
    return classIconHtml;
}

/**
 * Extract the main profession name from a profession string
 * @param {string} profession - The profession string
 * @returns {string} The main profession name
 */
export function getMainProfession(profession) {
    if (!profession) return '';
    return profession.split('(')[0].trim();
}

/**
 * Get a display-friendly profession string
 * @param {string} profession - The profession string
 * @param {boolean} includeSubclass - Whether to include subclass in parentheses
 * @returns {string} Formatted profession string
 */
export function formatProfession(profession, includeSubclass = true) {
    if (!profession) return 'Unknown';
    if (includeSubclass) return profession;
    return getMainProfession(profession);
}

// ============================================================================
// LOCAL STORAGE UTILITIES
// ============================================================================

// ============================================================================
// SETTINGS API SERVICE
// ============================================================================

/**
 * Settings service for reading and writing settings to/from the server
 */
class SettingsService {
    constructor() {
        this.cache = null;
        this.cacheTime = 0;
        this.cacheDuration = 5000; // 5 seconds
    }

    /**
     * Get all settings from the server (with caching)
     * @returns {Promise<Object>} Settings object
     */
    async getSettings() {
        const now = Date.now();
        if (this.cache && (now - this.cacheTime) < this.cacheDuration) {
            return this.cache;
        }

        try {
            const response = await fetch(`http://${SERVER_URL}/api/settings`);
            const data = await response.json();
            if (data.code === 0) {
                this.cache = data.data || {};
                this.cacheTime = now;
                return this.cache;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        return this.cache || {};
    }

    /**
     * Get a specific setting value
     * @param {string} key - Setting key
     * @param {any} defaultValue - Default value if not found
     * @returns {Promise<any>} Setting value
     */
    async getSetting(key, defaultValue = null) {
        const settings = await this.getSettings();
        return settings[key] !== undefined ? settings[key] : defaultValue;
    }

    /**
     * Update settings on the server
     * @param {Object} newSettings - Settings to update
     * @returns {Promise<Object>} Updated settings object
     */
    async updateSettings(newSettings) {
        try {
            const response = await fetch(`http://${SERVER_URL}/api/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newSettings),
            });
            const data = await response.json();
            if (data.code === 0) {
                this.cache = data.data;
                this.cacheTime = Date.now();
                return this.cache;
            }
        } catch (error) {
            console.error('Failed to update settings:', error);
        }
        return null;
    }

    /**
     * Update a single setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     * @returns {Promise<Object>} Updated settings object
     */
    async updateSetting(key, value) {
        return this.updateSettings({ [key]: value });
    }

    /**
     * Clear the cache (useful after external updates)
     */
    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }
}

// Export singleton instance
export const settingsService = new SettingsService();

/**
 * Initialize and apply font size from settings
 * This should be called on every page load to apply the global font size
 */
export async function initializeFontSize() {
    try {
        const fontSize = await settingsService.getSetting('fontSize', 100);
        const scale = fontSize / 100;
        document.documentElement.style.setProperty('--font-scale', scale);
    } catch (error) {
        console.error('Failed to load font size:', error);
    }
}

/**
 * Set up a listener for font size changes
 * Applies zoom scale when font size is changed from settings
 */
export function setupFontSizeListener() {
    if (!window.electronAPI || !window.electronAPI.onFontSizeChanged) {
        console.warn('Font size listener not available');
        return;
    }

    window.electronAPI.onFontSizeChanged((percentage) => {
        const scale = percentage / 100;
        document.documentElement.style.setProperty('--font-scale', scale);
    });
}

/**
 * Initialize and apply theme from settings
 * This should be called on every page load to apply the global theme
 */
export async function initializeTheme() {
    try {
        const theme = await settingsService.getSetting('theme', 'dark');
        document.documentElement.setAttribute('data-theme', theme);
    } catch (error) {
        console.error('Failed to load theme:', error);
    }
}

/**
 * Set up a listener for theme changes
 * Applies theme when changed from settings
 */
export function setupThemeListener() {
    if (!window.electronAPI || !window.electronAPI.onThemeChanged) {
        console.warn('Theme listener not available');
        return;
    }

    window.electronAPI.onThemeChanged((theme) => {
        document.documentElement.setAttribute('data-theme', theme);
    });
}

/**
 * Initialize and apply background image from settings
 * This should be called on main window load to apply the background image
 */
export async function initializeBackgroundImage() {
    try {
        const imagePath = await settingsService.getSetting('backgroundImage', '');
        if (imagePath) {
            // Load the image data as base64
            const result = await window.electronAPI.loadBackgroundImageData(imagePath);
            if (result.dataUrl) {
                applyBackgroundImage(result.dataUrl);
            }
        }
    } catch (error) {
        console.error('Failed to load background image:', error);
    }
}

/**
 * Set up a listener for background image changes
 * Applies background image when changed from settings
 */
export function setupBackgroundImageListener() {
    if (!window.electronAPI || !window.electronAPI.onBackgroundImageChanged) {
        console.warn('Background image listener not available');
        return;
    }

    window.electronAPI.onBackgroundImageChanged((dataUrl) => {
        applyBackgroundImage(dataUrl);
    });
}

/**
 * Apply background image to the main window
 * @param {string} dataUrl - Data URL of the background image
 */
function applyBackgroundImage(dataUrl) {
    const appWrapper = document.getElementById('app-wrapper');
    if (!appWrapper) {
        console.warn('app-wrapper element not found');
        return;
    }

    if (dataUrl) {
        appWrapper.style.backgroundImage = `url("${dataUrl}")`;
        appWrapper.style.backgroundSize = 'cover';
        appWrapper.style.backgroundPosition = 'center';
        appWrapper.style.backgroundRepeat = 'no-repeat';

        // Make the main container very transparent so the background image is visible
        // Set opacity to 0.05 (5%) to show the image clearly
        document.documentElement.style.setProperty('--main-bg-opacity', '0.05');

        // Update the opacity slider if it exists (on main window)
        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            opacitySlider.value = '0.05';
        }

        // Disable backdrop blur to keep image sharp
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            mainContainer.style.backdropFilter = 'none';
            mainContainer.style.webkitBackdropFilter = 'none';
        }
    } else {
        // Clear background image
        appWrapper.style.backgroundImage = '';
        appWrapper.style.backgroundSize = '';
        appWrapper.style.backgroundPosition = '';
        appWrapper.style.backgroundRepeat = '';

        // Re-enable backdrop blur when no image
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            mainContainer.style.backdropFilter = 'blur(10px)';
            mainContainer.style.webkitBackdropFilter = 'blur(10px)';
        }

        // Reset opacity to default value when no image
        // You can adjust the user's last preferred value by not resetting here
        // For now, we'll leave it at the current value
    }
}

/**
 * Initialize an opacity slider with settings API persistence
 * @param {string} sliderId - The ID of the slider element
 * @param {string} settingKey - The setting key to use for persistence
 * @param {string} cssVarName - The CSS variable name to update (default: '--main-bg-opacity')
 * @param {number} defaultValue - Default opacity value if none is saved
 */
export async function initializeOpacitySlider(sliderId, settingKey, cssVarName = '--main-bg-opacity', defaultValue = 0.95) {
    const slider = document.getElementById(sliderId);
    if (!slider) {
        console.warn(`Opacity slider with ID "${sliderId}" not found`);
        return;
    }

    // Load saved opacity from settings
    const savedOpacity = await settingsService.getSetting(settingKey, defaultValue);
    slider.value = savedOpacity;
    document.documentElement.style.setProperty(cssVarName, savedOpacity);

    // Save on change
    slider.addEventListener('input', async (event) => {
        const newOpacity = event.target.value;
        document.documentElement.style.setProperty(cssVarName, newOpacity);
        await settingsService.updateSetting(settingKey, newOpacity);
    });
}

// ============================================================================
// STAT DATA UTILITIES
// ============================================================================

/**
 * Safely extract total value from stat object or nested total property
 * Consolidates the pattern: user.total_damage?.total || 0
 * @param {Object|number} statData - Stat data object or number
 * @param {string} [property='total'] - Property to extract
 * @param {number} [defaultValue=0] - Default value if not found
 * @returns {number} Extracted value or default
 */
export function getStatValue(statData, property = 'total', defaultValue = 0) {
    if (statData === null || statData === undefined) {
        return defaultValue;
    }
    if (typeof statData === 'number') {
        return statData;
    }
    if (typeof statData === 'object' && property in statData) {
        return statData[property] ?? defaultValue;
    }
    return defaultValue;
}

/**
 * Parse stat data from various formats (object, string, or PowerShell-like format)
 * Used in history.js to parse historical data
 * @param {Object|string|number} data - Data to parse
 * @returns {number} Parsed total value
 */
export function parseStatData(data) {
    if (typeof data === 'object' && data !== null) {
        return data.total || 0;
    }

    if (typeof data === 'string') {
        try {
            let str = data;
            // Handle @{key=value;...} format (PowerShell-like)
            if (str.startsWith('@{') && str.endsWith('}')) {
                str = str
                    .slice(2, -1)
                    .replace(/(\w+)=/g, '"$1":')
                    .replace(/;/g, ',');
                str = '{' + str + '}';
            }
            const parsed = JSON.parse(str);
            return parsed.total || 0;
        } catch (e) {
            console.warn('Failed to parse stat data:', data, e);
            return 0;
        }
    }

    return 0;
}

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

/**
 * Format a date for use in datetime-local input fields
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (YYYY-MM-DDTHH:mm)
 */
export function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ============================================================================
// CHART UTILITIES
// ============================================================================

/**
 * Get chart colors for damage and healing
 * @returns {{damage: string, healing: string}} Chart color configuration
 */
export function getChartColors() {
    return {
        damage: 'rgba(255, 99, 132, 0.8)', // Red for damage
        healing: 'rgba(75, 192, 192, 0.8)', // Teal for healing
    };
}

// ============================================================================
// SKILL FILTERING
// ============================================================================

/**
 * Filter skills by type (damage or healing)
 * @param {Object} skills - Skills object with skill IDs as keys
 * @param {string} type - Filter type: 'damage' or 'healing'
 * @returns {Object} Filtered skills object
 */
export function filterSkillsByType(skills, type) {
    const filtered = {};
    for (const [skillId, skillData] of Object.entries(skills)) {
        if (type === 'damage') {
            // Only include skills with damage > 0
            if (skillData.damage && skillData.damage.total > 0) {
                filtered[skillId] = skillData;
            }
        } else if (type === 'healing') {
            // Only include skills with healing > 0
            if (skillData.healing && skillData.healing.total > 0) {
                filtered[skillId] = skillData;
            }
        }
    }
    return filtered;
}

// ============================================================================
// DATA RENDERING - SHARED BETWEEN SCRIPT.JS AND HISTORY.JS
// ============================================================================

/**
 * Render user data list with DPS/HPS bars
 * Consolidated function used by both main window and history window
 * @param {Array} users - Array of user objects
 * @param {Object} userColors - Map of user IDs to color shades
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} options - Optional configuration
 * @param {Function} options.onUserDoubleClick - Callback for double-click on user (history window)
 * @returns {void}
 */
export function renderDataList(users, userColors, container, options = {}) {
    // Early exit if no users
    if (!users || users.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Calculate totals and sort
    const totalDamageOverall = users.reduce((sum, user) => sum + (user.total_damage?.total || 0), 0);
    const totalHealingOverall = users.reduce((sum, user) => sum + (user.total_healing?.total || 0), 0);

    users.sort((a, b) => (b.total_damage?.total || 0) - (a.total_damage?.total || 0));

    // Pre-calculate reciprocals for percentage calculations (avoid division in loop)
    const damageMultiplier = totalDamageOverall > 0 ? 100 / totalDamageOverall : 0;
    const healingMultiplier = totalHealingOverall > 0 ? 100 / totalHealingOverall : 0;

    // Use DocumentFragment for batch DOM insertion
    const fragment = document.createDocumentFragment();

    users.forEach((user, index) => {
        const userId = user.id || user.uid;

        if (!userColors[userId]) {
            userColors[userId] = getNextColorShades();
        }
        const colors = userColors[userId];
        const item = document.createElement('li');

        item.className = 'data-item';

        // Add data attributes for double-click handler (history window)
        if (options.onUserDoubleClick) {
            item.dataset.uid = userId;
            item.dataset.userName = user.name;
            item.dataset.userProfession = user.profession;
            item.addEventListener('dblclick', () => {
                options.onUserDoubleClick(userId, user.name, user.profession);
            });
        }

        const damageTotal = user.total_damage?.total || 0;
        const healingTotal = user.total_healing?.total || 0;
        const damagePercent = damageTotal * damageMultiplier;
        const healingPercent = healingTotal * healingMultiplier;

        // Pre-format numbers to avoid multiple calls
        const formattedDamageTotal = formatNumber(damageTotal);
        const formattedDPS = formatNumber(user.total_dps || 0);
        const damagePercentStr = damagePercent.toFixed(1);

        // Use profession for display
        const professionDisplay = user.profession || 'Unknown';
        const displayName = user.fightPoint
            ? `${user.name} ${options.showProfession !== false ? '- ' + professionDisplay : ''} (${user.fightPoint})`
            : `${user.name}${options.showProfession !== false ? ' - ' + professionDisplay : ''}`;

        const classIconHtml = getProfessionIconHtml(user.profession);

        let subBarHtml = '';
        if (healingTotal > 0 || (user.total_hps || 0) > 0) {
            const formattedHealingTotal = formatNumber(healingTotal);
            const formattedHPS = formatNumber(user.total_hps || 0);
            const healingPercentStr = healingPercent.toFixed(1);

            subBarHtml = `
                <div class="sub-bar">
                    <div class="hps-bar-fill" style="width: ${healingPercent}%; background-color: ${colors.hps};"></div>
                    <div class="hps-stats">
                       ${formattedHealingTotal} (${formattedHPS} HPS, ${healingPercentStr}%)
                    </div>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="main-bar">
                <div class="dps-bar-fill" style="width: ${damagePercent}%; background-color: ${colors.dps};"></div>
                <div class="content">
                    <span class="rank">${index + 1}.</span>
                    ${classIconHtml}
                    <span class="name">${displayName}</span>
                    <span class="stats">${formattedDamageTotal} (${formattedDPS} DPS, ${damagePercentStr}%)</span>
                </div>
            </div>
            ${subBarHtml}
        `;
        fragment.appendChild(item);
    });

    // Single DOM update
    container.innerHTML = '';
    container.appendChild(fragment);
}
