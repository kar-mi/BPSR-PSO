import https from 'https';
import { promises as fs } from 'fs';
import { paths } from '../config/paths.js';
import logger from './Logger.js';

const GITHUB_API_URL = 'https://api.github.com/repos/kar-mi/BPSR-PSO/releases/latest';
const UPDATE_CHECK_TIMEOUT = 5000; // 5 second timeout

/**
 * UpdateChecker service to check for new versions on GitHub
 */
class UpdateChecker {
    constructor() {
        this.currentVersion = null;
        this.latestVersion = null;
        this.latestReleaseUrl = null;
        this.dismissedVersion = null;
    }

    /**
     * Initialize the update checker with current version
     * @param {string} version - Current app version from package.json
     */
    async init(version) {
        this.currentVersion = version;
        await this.loadDismissedVersion();
    }

    /**
     * Load the last dismissed version from settings
     */
    async loadDismissedVersion() {
        try {
            const settingsPath = paths.settings;
            const data = await fs.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            this.dismissedVersion = settings.dismissedUpdateVersion || null;
        } catch (error) {
            // If file doesn't exist or parse fails, that's okay
            this.dismissedVersion = null;
        }
    }

    /**
     * Save the dismissed version to settings
     * @param {string} version - Version that was dismissed
     */
    async saveDismissedVersion(version) {
        try {
            const settingsPath = paths.settings;
            let settings = {};

            // Read existing settings
            try {
                const data = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(data);
            } catch (error) {
                // File doesn't exist, use empty settings
            }

            // Update dismissed version
            settings.dismissedUpdateVersion = version;

            // Write back to file
            await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            this.dismissedVersion = version;

            logger.info(`Dismissed update version ${version}`);
        } catch (error) {
            logger.error('Failed to save dismissed version:', error);
        }
    }

    /**
     * Check for updates from GitHub
     * @returns {Promise<{updateAvailable: boolean, currentVersion: string, latestVersion: string, releaseUrl: string}>}
     */
    async checkForUpdates() {
        return new Promise((resolve) => {
            const options = {
                headers: {
                    'User-Agent': 'BPSR-PSO',
                },
                timeout: UPDATE_CHECK_TIMEOUT,
            };

            const req = https.get(GITHUB_API_URL, options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const release = JSON.parse(data);
                            this.latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
                            this.latestReleaseUrl = release.html_url;

                            const updateAvailable = this.compareVersions(this.currentVersion, this.latestVersion) < 0;
                            const shouldNotify = updateAvailable && this.latestVersion !== this.dismissedVersion;

                            logger.info(`Update check: current=${this.currentVersion}, latest=${this.latestVersion}, updateAvailable=${updateAvailable}, shouldNotify=${shouldNotify}`);

                            resolve({
                                updateAvailable: shouldNotify,
                                currentVersion: this.currentVersion,
                                latestVersion: this.latestVersion,
                                releaseUrl: this.latestReleaseUrl,
                            });
                        } else {
                            logger.warn(`GitHub API returned status ${res.statusCode}`);
                            resolve({
                                updateAvailable: false,
                                currentVersion: this.currentVersion,
                                latestVersion: this.currentVersion,
                                releaseUrl: null,
                            });
                        }
                    } catch (error) {
                        logger.error('Failed to parse GitHub release data:', error);
                        resolve({
                            updateAvailable: false,
                            currentVersion: this.currentVersion,
                            latestVersion: this.currentVersion,
                            releaseUrl: null,
                        });
                    }
                });
            });

            req.on('error', (error) => {
                logger.warn('Failed to check for updates:', error.message);
                resolve({
                    updateAvailable: false,
                    currentVersion: this.currentVersion,
                    latestVersion: this.currentVersion,
                    releaseUrl: null,
                });
            });

            req.on('timeout', () => {
                req.destroy();
                logger.warn('Update check timed out');
                resolve({
                    updateAvailable: false,
                    currentVersion: this.currentVersion,
                    latestVersion: this.currentVersion,
                    releaseUrl: null,
                });
            });
        });
    }

    /**
     * Compare two semantic versions
     * @param {string} v1 - First version (e.g., "2.8.0")
     * @param {string} v2 - Second version (e.g., "2.9.0")
     * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;

            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }

        return 0;
    }
}

export default new UpdateChecker();
