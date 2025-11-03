import fs from 'fs';

/**
 * Utility functions for loading and saving window position/size configurations
 */

/**
 * Loads window configuration from a JSON file
 * @param {string} configPath - Path to the config file
 * @param {Object} defaultConfig - Default configuration to use if file doesn't exist
 * @returns {Object} The loaded configuration merged with defaults
 */
export function loadWindowConfig(configPath, defaultConfig) {
    try {
        if (fs.existsSync(configPath)) {
            const rawData = fs.readFileSync(configPath, 'utf8');
            const loadedConfig = JSON.parse(rawData);
            return { ...defaultConfig, ...loadedConfig };
        }
    } catch (error) {
        console.error(`Failed to read window config from ${configPath}, using defaults.`, error);
    }
    return defaultConfig;
}

/**
 * Saves window bounds to a JSON file
 * @param {BrowserWindow} window - The window to save bounds from
 * @param {string} configPath - Path to save the config file
 * @param {Object} additionalData - Optional additional data to save (e.g., passthrough, lastHeight)
 */
export function saveWindowConfig(window, configPath, additionalData = {}) {
    if (!window || window.isDestroyed()) return;
    try {
        const bounds = window.getBounds();
        const configData = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            ...additionalData,
        };
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 4));
    } catch (error) {
        console.error(`Failed to save window config to ${configPath}.`, error);
    }
}
