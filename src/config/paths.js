/**
 * Application data paths
 * All files are saved relative to the executable location (current working directory)
 * This matches the behavior of the logs directory
 */
export const paths = {
    // Base directories
    logs: './logs',
    config: './config',
    data: './',

    // JSON configuration files - saved in config directory
    settings: './config/settings.json',
    users: './config/users.json',
    windowConfig: './config/windowConfig.json',
    bossHpWindowConfig: './config/boss-hp-window.json',
    historyWindowConfig: './config/history-window.json',
    settingsWindowConfig: './config/settings-window.json',
    keybinds: './config/keybinds.json',
    networkSettings: './config/networkSettings.json',
};

/**
 * Ensure all required directories exist
 */
export async function ensureDirectories() {
    const { promises: fsPromises } = await import('fs');
    const dirs = [paths.logs, paths.config];

    for (const dir of dirs) {
        try {
            await fsPromises.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create directory ${dir}:`, error);
        }
    }
}
