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

/**
 * Initialize an opacity slider with localStorage persistence
 * @param {string} sliderId - The ID of the slider element
 * @param {string} storageKey - The localStorage key to use for persistence
 * @param {string} cssVarName - The CSS variable name to update (default: '--main-bg-opacity')
 * @param {number} defaultValue - Default opacity value if none is saved
 */
export function initializeOpacitySlider(sliderId, storageKey, cssVarName = '--main-bg-opacity', defaultValue = 0.95) {
    const slider = document.getElementById(sliderId);
    if (!slider) {
        console.warn(`Opacity slider with ID "${sliderId}" not found`);
        return;
    }

    const savedOpacity = localStorage.getItem(storageKey);

    if (savedOpacity !== null) {
        slider.value = savedOpacity;
        document.documentElement.style.setProperty(cssVarName, savedOpacity);
    } else {
        slider.value = defaultValue;
        document.documentElement.style.setProperty(cssVarName, defaultValue);
    }

    slider.addEventListener('input', (event) => {
        const newOpacity = event.target.value;
        document.documentElement.style.setProperty(cssVarName, newOpacity);
        localStorage.setItem(storageKey, newOpacity);
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
