import express from 'express';
import path from 'path';
import logger from '../services/Logger.js';
import { promises as fsPromises } from 'fs';
import userDataManager from '../services/UserDataManager.js';

/**
 * Creates and returns an Express Router instance configured with all API endpoints.
 * @param {object} userDataManager The data manager instance for user data.
 * @param {object} logger The Pino logger instance.
 * @param {boolean} isPaused The state of the statistics being paused.
 * @param {string} SETTINGS_PATH The path to the settings file.
 * @returns {express.Router} An Express Router with all routes defined.
 */
export function createApiRouter(isPaused, SETTINGS_PATH) {
    const router = express.Router();

    // Middleware to parse JSON requests
    router.use(express.json());

    // GET all user data
    router.get('/data', (req, res) => {
        const userData = userDataManager.getAllUsersData();
        const data = {
            code: 0,
            user: userData,
        };
        res.json(data);
    });

    // GET all enemy data
    router.get('/enemies', (req, res) => {
        const enemiesData = userDataManager.getAllEnemiesData();
        const data = {
            code: 0,
            enemy: enemiesData,
        };
        res.json(data);
    });

    // Clear all statistics
    router.get('/clear', (req, res) => {
        userDataManager.clearAll();
        logger.info('Statistics have been cleared!');
        res.json({
            code: 0,
            msg: 'Statistics have been cleared!',
        });
    });

    // Pause/Resume statistics
    router.post('/pause', (req, res) => {
        const { paused } = req.body;
        isPaused = paused;
        logger.info(`Statistics ${isPaused ? 'paused' : 'resumed'}!`);
        res.json({
            code: 0,
            msg: `Statistics ${isPaused ? 'paused' : 'resumed'}!`,
            paused: isPaused,
        });
    });

    // Get pause state
    router.get('/pause', (req, res) => {
        res.json({
            code: 0,
            paused: isPaused,
        });
    });

    // Get skill data for a specific user ID
    router.get('/skill/:uid', (req, res) => {
        const uid = parseInt(req.params.uid);
        const skillData = userDataManager.getUserSkillData(uid);

        if (!skillData) {
            return res.status(404).json({
                code: 1,
                msg: 'User not found',
            });
        }

        res.json({
            code: 0,
            data: skillData,
        });
    });

    // Get history summary for a specific timestamp
    router.get('/history/:timestamp/summary', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'summary.json');

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const summaryData = JSON.parse(data);
            res.json({
                code: 0,
                data: summaryData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History summary file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History summary file not found',
                });
            } else {
                logger.error('Failed to read history summary file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history summary file',
                });
            }
        }
    });

    // Get history data for a specific timestamp
    router.get('/history/:timestamp/data', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'allUserData.json');

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const userData = JSON.parse(data);
            res.json({
                code: 0,
                user: userData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History data file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History data file not found',
                });
            } else {
                logger.error('Failed to read history data file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history data file',
                });
            }
        }
    });

    // Get history skill data for a specific timestamp and user
    router.get('/history/:timestamp/skill/:uid', async (req, res) => {
        const { timestamp, uid } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'users', `${uid}.json`);

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const skillData = JSON.parse(data);
            res.json({
                code: 0,
                data: skillData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History skill file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History skill file not found',
                });
            } else {
                logger.error('Failed to read history skill file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history skill file',
                });
            }
        }
    });

    // Download historical fight log
    router.get('/history/:timestamp/download', (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'fight.log');
        res.download(historyFilePath, `fight_${timestamp}.log`);
    });

    // Get a list of available history timestamps
    router.get('/history/list', async (req, res) => {
        try {
            const data = (await fsPromises.readdir('./logs', { withFileTypes: true }))
                .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
                .map((e) => e.name);
            res.json({
                code: 0,
                data: data,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History path not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History path not found',
                });
            } else {
                logger.error('Failed to load history path:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to load history path',
                });
            }
        }
    });

    // Get current settings
    router.get('/settings', (req, res) => {
        const settings = userDataManager.getGlobalSettings();
        res.json({ code: 0, data: settings });
    });

    // Update settings
    router.post('/settings', async (req, res) => {
        const newSettings = req.body;
        const currentSettings = userDataManager.getGlobalSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };

        try {
            await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(updatedSettings, null, 2), 'utf8');
            res.json({ code: 0, data: updatedSettings });
        } catch (error) {
            logger.error('Failed to save settings:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to save settings',
            });
        }
    });

    // Fight History API Endpoints
    // Get list of fights from existing logs (with optional date range)
    router.get('/fight/list', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
            const endTimestamp = endDate ? new Date(endDate).getTime() : Date.now();

            const logDirs = (await fsPromises.readdir('./logs', { withFileTypes: true }))
                .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
                .map((e) => parseInt(e.name))
                .filter((timestamp) => timestamp >= startTimestamp && timestamp <= endTimestamp)
                .sort((a, b) => b - a); // newest first

            const fights = [];
            for (const timestamp of logDirs) {
                try {
                    const userDataPath = path.join('./logs', timestamp.toString(), 'allUserData.json');
                    const userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));

                    // Calculate total damage and healing from user data
                    let totalDamage = 0;
                    let totalHealing = 0;
                    let userCount = 0;

                    for (const [uid, user] of Object.entries(userData)) {
                        totalDamage += user.total_damage?.total || 0;
                        totalHealing += user.total_healing?.total || 0;
                        if (user.total_damage?.total > 0 || user.total_healing?.total > 0) {
                            userCount++;
                        }
                    }

                    fights.push({
                        id: `fight_${timestamp}`,
                        startTime: timestamp,
                        endTime: timestamp, // We don't have exact end time, using start as approximation
                        duration: 0, // Duration not available from logs
                        totalDamage,
                        totalHealing,
                        userCount,
                    });
                } catch (error) {
                    logger.warn(`Failed to read log data for timestamp ${timestamp}:`, error);
                }
            }

            res.json({
                code: 0,
                data: fights,
            });
        } catch (error) {
            logger.error('Failed to load fight list:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to load fight list',
            });
        }
    });

    // Get cumulative statistics across all fights in date range
    router.get('/fight/cumulative', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
            const endTimestamp = endDate ? new Date(endDate).getTime() : Date.now();

            const logDirs = (await fsPromises.readdir('./logs', { withFileTypes: true }))
                .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
                .map((e) => parseInt(e.name))
                .filter((timestamp) => timestamp >= startTimestamp && timestamp <= endTimestamp);

            let totalDamage = 0;
            let totalHealing = 0;
            let totalFights = 0;

            for (const timestamp of logDirs) {
                try {
                    const userDataPath = path.join('./logs', timestamp.toString(), 'allUserData.json');
                    const userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));

                    for (const [uid, user] of Object.entries(userData)) {
                        totalDamage += user.total_damage?.total || 0;
                        totalHealing += user.total_healing?.total || 0;
                    }
                    totalFights++;
                } catch (error) {
                    logger.warn(`Failed to read log data for timestamp ${timestamp}:`, error);
                }
            }

            res.json({
                code: 0,
                data: {
                    totalDamage,
                    totalHealing,
                    totalFights,
                    totalDuration: 0, // Not available from logs
                },
            });
        } catch (error) {
            logger.error('Failed to calculate cumulative stats:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to calculate cumulative stats',
            });
        }
    });

    // Get specific fight data by timestamp
    router.get('/fight/:fightId', async (req, res) => {
        try {
            const { fightId } = req.params;
            const timestamp = fightId.replace('fight_', '');

            const userDataPath = path.join('./logs', timestamp, 'allUserData.json');
            const userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));

            // Calculate totals
            let totalDamage = 0;
            let totalHealing = 0;

            for (const [uid, user] of Object.entries(userData)) {
                totalDamage += user.total_damage?.total || 0;
                totalHealing += user.total_healing?.total || 0;
            }

            res.json({
                code: 0,
                data: {
                    id: fightId,
                    startTime: parseInt(timestamp),
                    endTime: parseInt(timestamp),
                    duration: 0,
                    totalDamage,
                    totalHealing,
                    userStats: userData,
                },
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('Fight data file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'Fight not found',
                });
            } else {
                logger.error('Failed to read fight data:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read fight data',
                });
            }
        }
    });

    return router;
}
