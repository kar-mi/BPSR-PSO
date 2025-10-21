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
