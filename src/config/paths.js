/**
 * Application data paths
 * All files are saved relative to the executable location (current working directory)
 * This matches the behavior of the logs directory
 */
export const paths = {
    // Base directories
    logs: './logs',
    data: './',

    // JSON configuration files - saved in same directory as executable
    settings: './settings.json',
    users: './users.json',
    windowConfig: './windowConfig.json',
    bossHpWindowConfig: './boss-hp-window.json',
    keybinds: './keybinds.json',
    networkSettings: './networkSettings.json',
};

/**
 * Ensure all required directories exist
 */
export async function ensureDirectories() {
    const { promises: fsPromises } = await import('fs');
    const dirs = [paths.logs];

    for (const dir of dirs) {
        try {
            await fsPromises.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create directory ${dir}:`, error);
        }
    }
}
