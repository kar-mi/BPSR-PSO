import express from 'express';
import path from 'path';
import logger from '../services/Logger.js';
import { promises as fsPromises } from 'fs';
import userDataManager from '../services/UserDataManager.js';
import { reloadSkillConfig } from '../models/UserData.js';
import cap from 'cap';

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

    // Performance: Pre-compile regex patterns used in multiple routes
    const TIMESTAMP_REGEX = /^\d+$/;
    const LOG_PARSE_REGEX =
        /\[([^\]]+)\] \[(DMG|HEAL)\] DS: \w+ SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#\d+\((enemy|player)\).*ID: (\d+).*VAL: (\d+).*EXT: (\w+)/;
    const LOG_PARSE_SIMPLE_REGEX =
        /\[([^\]]+)\] \[(DMG|HEAL)\].*SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#(\d+)\((enemy|player)\).*VAL: (\d+)/;

    // Middleware to parse JSON requests
    router.use(express.json());

    /**
     * Helper function to safely read settings from file
     * @returns {Promise<Object>} Current settings from file
     */
    async function readSettingsFromFile() {
        try {
            const data = await fsPromises.readFile(SETTINGS_PATH, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return default settings
                return {
                    autoClearOnServerChange: true,
                    autoClearOnTimeout: true,
                };
            }
            throw error;
        }
    }

    /**
     * Helper function to safely write settings to file
     * @param {Object} newSettings - Settings to merge and save
     * @returns {Promise<Object>} Updated settings
     */
    async function updateSettingsFile(newSettings) {
        const currentSettings = await readSettingsFromFile();
        const updatedSettings = { ...currentSettings, ...newSettings };
        await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(updatedSettings, null, 2), 'utf8');
        return updatedSettings;
    }

    // POST update fight timeout
    router.post('/fight/timeout', async (req, res) => {
        try {
            const { timeout } = req.body;

            if (typeof timeout !== 'number' || timeout <= 0) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid timeout value. Must be a positive number in milliseconds.',
                });
            }

            userDataManager.setFightTimeout(timeout);

            // Save to settings.json using helper function
            try {
                await updateSettingsFile({ fightTimeout: timeout });
            } catch (error) {
                logger.error('Failed to save fight timeout to settings:', error);
            }

            res.json({
                code: 0,
                msg: 'Fight timeout updated successfully',
                timeout: timeout,
            });
        } catch (error) {
            logger.error('Error updating fight timeout:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to update fight timeout',
            });
        }
    });

    // GET current fight timeout
    router.get('/fight/timeout', (req, res) => {
        res.json({
            code: 0,
            timeout: userDataManager.getFightTimeout(),
        });
    });

    // Clear all statistics
    router.get('/clear', async (req, res) => {
        await userDataManager.clearAll();
        logger.info('Statistics have been cleared!');
        res.json({
            code: 0,
            msg: 'Statistics have been cleared!',
        });
    });

    // Reload skill names configuration
    router.post('/reload-skills', (req, res) => {
        logger.info('Reloading skill names configuration...');
        const success = reloadSkillConfig();
        if (success) {
            res.json({
                code: 0,
                msg: 'Skill names reloaded successfully',
            });
        } else {
            res.status(500).json({
                code: 1,
                msg: 'Failed to reload skill names. Check server logs for details.',
            });
        }
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

        // Security: Validate UID is a valid number
        if (isNaN(uid) || uid < 0) {
            return res.status(400).json({
                code: 1,
                msg: 'Invalid user ID',
            });
        }

        const enemyId = req.query.enemy ? parseInt(req.query.enemy) : null;

        const skillData =
            enemyId !== null
                ? userDataManager.getUserSkillDataByEnemy(uid, enemyId)
                : userDataManager.getUserSkillData(uid);

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

    // Get history skill data for a specific timestamp and user
    router.get('/history/:timestamp/skill/:uid', async (req, res) => {
        const { timestamp, uid } = req.params;
        const { enemy } = req.query; // Optional enemy filter

        // Security: Validate timestamp and uid are numeric only to prevent path traversal
        if (!TIMESTAMP_REGEX.test(timestamp) || !TIMESTAMP_REGEX.test(uid)) {
            return res.status(400).json({
                code: 1,
                msg: 'Invalid timestamp or uid format',
            });
        }

        const historyFilePath = path.join('./logs', timestamp, 'users', `${uid}.json`);

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            let skillData = JSON.parse(data);

            // If enemy filter is specified, calculate per-enemy skill stats from fight.log
            if (enemy && enemy !== 'all') {
                const logFilePath = path.join('./logs', timestamp, 'fight.log');
                const logContent = await fsPromises.readFile(logFilePath, 'utf8');
                const lines = logContent.split('\n');

                // Groups: 1:Timestamp, 2:DMG|HEAL, 3:Source Name, 4:Source UID, 5:Target Name, 6:Target Role, 7:Skill ID, 8:Value, 9:EXT value
                // Performance: Use pre-compiled regex

                // Track per-skill stats for the specific enemy
                const skillStatsPerEnemy = {};
                const skillTimestamps = {}; // Track first and last timestamp per skill

                for (const line of lines) {
                    const match = line.match(LOG_PARSE_REGEX);
                    if (match) {
                        const timestamp = parseInt(match[1]);
                        const type = match[2]; // DMG or HEAL
                        const playerUid = match[4];
                        const targetName = match[5];
                        const targetType = match[6]; // enemy or player
                        const skillId = match[7];
                        const value = parseInt(match[8]);
                        const ext = match[9]; // EXT value (e.g., 'Lucky', 'CauseLucky', 'Crit', 'Normal')

                        // --- MODIFIED CRIT/LUCKY CHECK ---
                        // Check the EXT value for 'Crit' or 'Lucky'/'CauseLucky'
                        const isCrit = ext.includes('Crit');
                        // Check for 'Lucky' or 'CauseLucky' as both indicate a lucky hit
                        const isLucky = ext.includes('Lucky');

                        // Only count events from this player against the specified enemy
                        if (playerUid === uid && targetType === 'enemy' && targetName === enemy) {
                            if (!skillStatsPerEnemy[skillId]) {
                                skillStatsPerEnemy[skillId] = {
                                    totalDamage: 0,
                                    totalCount: 0,
                                    critCount: 0,
                                    luckyCount: 0,
                                    normalCount: 0,
                                    type: type === 'DMG' ? '伤害' : '治疗',
                                    normal: { total: 0, min: Infinity, max: 0 },
                                    crit: { total: 0, min: Infinity, max: 0 },
                                    lucky: { total: 0, min: Infinity, max: 0 },
                                    critLucky: { total: 0, min: Infinity, max: 0 },
                                };
                                skillTimestamps[skillId] = { first: timestamp, last: timestamp };
                            }

                            skillStatsPerEnemy[skillId].totalDamage += value;
                            skillStatsPerEnemy[skillId].totalCount += 1;
                            skillTimestamps[skillId].last = timestamp;

                            // Track hits by type with min/max
                            if (isCrit && isLucky) {
                                skillStatsPerEnemy[skillId].critCount += 1;
                                skillStatsPerEnemy[skillId].luckyCount += 1;
                                skillStatsPerEnemy[skillId].critLucky.total += value;
                                skillStatsPerEnemy[skillId].critLucky.min = Math.min(skillStatsPerEnemy[skillId].critLucky.min, value);
                                skillStatsPerEnemy[skillId].critLucky.max = Math.max(skillStatsPerEnemy[skillId].critLucky.max, value);
                            } else if (isCrit) {
                                skillStatsPerEnemy[skillId].critCount += 1;
                                skillStatsPerEnemy[skillId].crit.total += value;
                                skillStatsPerEnemy[skillId].crit.min = Math.min(skillStatsPerEnemy[skillId].crit.min, value);
                                skillStatsPerEnemy[skillId].crit.max = Math.max(skillStatsPerEnemy[skillId].crit.max, value);
                            } else if (isLucky) {
                                skillStatsPerEnemy[skillId].luckyCount += 1;
                                skillStatsPerEnemy[skillId].lucky.total += value;
                                skillStatsPerEnemy[skillId].lucky.min = Math.min(skillStatsPerEnemy[skillId].lucky.min, value);
                                skillStatsPerEnemy[skillId].lucky.max = Math.max(skillStatsPerEnemy[skillId].lucky.max, value);
                            } else {
                                skillStatsPerEnemy[skillId].normalCount += 1;
                                skillStatsPerEnemy[skillId].normal.total += value;
                                skillStatsPerEnemy[skillId].normal.min = Math.min(skillStatsPerEnemy[skillId].normal.min, value);
                                skillStatsPerEnemy[skillId].normal.max = Math.max(skillStatsPerEnemy[skillId].normal.max, value);
                            }
                        }
                    }
                }

                // Create new skills object with per-enemy stats
                const filteredSkills = {};
                for (const [skillId, stats] of Object.entries(skillStatsPerEnemy)) {
                    // Get original skill info for display name and element
                    const originalSkill = skillData.skills?.[skillId];

                    // Calculate rates
                    const critRate = stats.totalCount > 0 ? stats.critCount / stats.totalCount : 0;
                    const luckyRate = stats.totalCount > 0 ? stats.luckyCount / stats.totalCount : 0;

                    // Calculate averages
                    const normalAvg = stats.normalCount > 0 ? stats.normal.total / stats.normalCount : 0;
                    const critAvg = stats.critCount > 0 ? stats.crit.total / stats.critCount : 0;
                    const overallAvg = stats.totalCount > 0 ? stats.totalDamage / stats.totalCount : 0;

                    // Calculate DPS/HPS and hits per second
                    const timestamps = skillTimestamps[skillId];
                    const timeRangeSeconds = timestamps ? (timestamps.last - timestamps.first) / 1000 : 0;
                    const dps = timeRangeSeconds > 0 ? stats.totalDamage / timeRangeSeconds : 0;
                    const hitsPerSecond = timeRangeSeconds > 0 ? stats.totalCount / timeRangeSeconds : 0;

                    // Handle Infinity for min values
                    const normalMin = stats.normal.min === Infinity ? 0 : stats.normal.min;
                    const critMin = stats.crit.min === Infinity ? 0 : stats.crit.min;

                    filteredSkills[skillId] = {
                        displayName: originalSkill?.displayName || skillId,
                        type: stats.type,
                        elementype: originalSkill?.elementype || '',
                        totalDamage: stats.totalDamage,
                        totalCount: stats.totalCount,
                        critCount: stats.critCount,
                        luckyCount: stats.luckyCount,
                        critRate: critRate,
                        luckyRate: luckyRate,

                        // New detailed statistics
                        dps: dps,
                        hitsPerSecond: hitsPerSecond,
                        averages: {
                            overall: overallAvg,
                            normal: normalAvg,
                            crit: critAvg,
                        },
                        normal: {
                            min: normalMin,
                            max: stats.normal.max,
                            avg: normalAvg,
                            count: stats.normalCount,
                            total: stats.normal.total,
                        },
                        crit: {
                            min: critMin,
                            max: stats.crit.max,
                            avg: critAvg,
                            count: stats.critCount,
                            total: stats.crit.total,
                        },

                        damageBreakdown: { total: stats.totalDamage },
                        countBreakdown: { total: stats.totalCount, critical: stats.critCount, lucky: stats.luckyCount },
                    };
                }

                skillData = {
                    ...skillData,
                    skills: filteredSkills,
                };
            }

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

        // Security: Validate timestamp is numeric only to prevent path traversal
        if (!TIMESTAMP_REGEX.test(timestamp)) {
            return res.status(400).json({
                code: 1,
                msg: 'Invalid timestamp format',
            });
        }

        const historyFilePath = path.join('./logs', timestamp, 'fight.log');
        res.download(historyFilePath, `fight_${timestamp}.log`);
    });

    // Get current settings
    router.get('/settings', async (req, res) => {
        try {
            const settings = await readSettingsFromFile();
            res.json({ code: 0, data: settings });
        } catch (error) {
            logger.error('Failed to read settings:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to read settings',
            });
        }
    });

    // Update settings
    router.post('/settings', async (req, res) => {
        const newSettings = req.body;

        try {
            const updatedSettings = await updateSettingsFile(newSettings);
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
                    // Check if fight.log exists before including this fight
                    const fightLogPath = path.join('./logs', timestamp.toString(), 'fight.log');
                    const summaryPath = path.join('./logs', timestamp.toString(), 'summary.json');
                    try {
                        // Check if the file exists
                        await fsPromises.access(fightLogPath);

                        // Check file size using stat()
                        const stats = await fsPromises.stat(fightLogPath);
                        if (stats.size === 0) {
                            // fight.log exists but is empty, skip this fight
                            logger.warn(`Skipping fight ${timestamp}: fight.log is empty`);
                            continue;
                        }
                    } catch (error) {
                        // fight.log doesn't exist, skip this fight
                        logger.warn(`Skipping fight ${timestamp}: fight.log not found`);
                        continue;
                    }

                    const summaryData = JSON.parse(await fsPromises.readFile(summaryPath, 'utf8'));
                    const fightStartTime = summaryData.startTime;
                    const fightEndTime = summaryData.endTime;
                    const fightDuration = summaryData.duration;

                    const userDataPath = path.join('./logs', timestamp.toString(), 'allUserData.json');

                    // Check if allUserData.json exists
                    let userData = {};
                    try {
                        await fsPromises.access(userDataPath);
                        userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));
                    } catch (error) {
                        // allUserData.json doesn't exist, skip this fight
                        logger.warn(`Skipping fight ${timestamp}: allUserData.json not found`);
                        continue;
                    }

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
                        startTime: fightStartTime,
                        endTime: fightEndTime, // We don't have exact end time, using start as approximation
                        duration: fightDuration, // Duration not available from logs
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
                    let userData = {};
                    try {
                        await fsPromises.access(userDataPath);
                        userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));
                    } catch (error) {
                        // allUserData.json doesn't exist, skip this fight
                        logger.warn(`Skipping fight ${timestamp}: allUserData.json not found`);
                        continue;
                    }

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

    // Get specific fight data by timestamp - Parse from fight.log
    router.get('/fight/:fightId', async (req, res) => {
        try {
            const { fightId } = req.params;
            const { enemy } = req.query; // Optional enemy filter
            const timestamp = fightId.replace('fight_', '');

            // Security: Validate timestamp is numeric only to prevent path traversal
            if (!TIMESTAMP_REGEX.test(timestamp)) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid fight ID format',
                });
            }

            // Read summary.json to get fight duration
            const summaryPath = path.join('./logs', timestamp, 'summary.json');
            let fightDuration = 0;
            let fightStartTime = parseInt(timestamp);
            let fightEndTime = parseInt(timestamp);

            try {
                await fsPromises.access(summaryPath);
                const summaryData = JSON.parse(await fsPromises.readFile(summaryPath, 'utf8'));
                fightDuration = summaryData.duration || 0;
                fightStartTime = summaryData.startTime || parseInt(timestamp);
                fightEndTime = summaryData.endTime || parseInt(timestamp);
            } catch (error) {
                logger.warn(`Could not read summary.json for fight ${timestamp}:`, error);
            }

            // Read allUserData.json to get user names and professions
            const userDataPath = path.join('./logs', timestamp, 'allUserData.json');
            let userMetadata = {};
            try {
                await fsPromises.access(userDataPath);
                const userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));
                // Extract only metadata (name, profession, etc.)
                for (const [uid, user] of Object.entries(userData)) {
                    userMetadata[uid] = {
                        name: user.name || 'Unknown',
                        profession: user.profession || 'Unknown',
                        hp: user.hp || 0,
                        max_hp: user.max_hp || 0,
                        fightPoint: user.fightPoint || 0,
                        dead_count: user.dead_count || 0,
                    };
                }
            } catch (error) {
                logger.warn(`Could not read allUserData.json for fight ${timestamp}:`, error);
            }

            // Parse fight.log to calculate statistics
            const logFilePath = path.join('./logs', timestamp, 'fight.log');
            let logContent;
            try {
                logContent = await fsPromises.readFile(logFilePath, 'utf8');
            } catch (error) {
                logger.warn(`Fight log not found for ${timestamp}:`, error);
                return res.status(404).json({
                    code: 1,
                    msg: 'Fight log not found',
                });
            }

            const lines = logContent.split('\n');
            const userStats = {};

            // Parse each line and accumulate stats
            for (const line of lines) {
                if (!line.trim()) continue;

                const match = line.match(LOG_PARSE_SIMPLE_REGEX);
                if (match) {
                    const type = match[2]; // DMG or HEAL
                    const playerName = match[3];
                    const playerUid = match[4];
                    const targetName = match[5];
                    const targetType = match[7];
                    const value = parseInt(match[8]);

                    // Filter by enemy if specified
                    if (enemy && enemy !== 'all') {
                        if (targetType !== 'enemy' || targetName !== enemy) {
                            continue;
                        }
                    }

                    // Initialize user stats if not exists
                    if (!userStats[playerUid]) {
                        userStats[playerUid] = {
                            uid: playerUid,
                            name: userMetadata[playerUid]?.name || playerName || 'Unknown',
                            profession: userMetadata[playerUid]?.profession || 'Unknown',
                            hp: userMetadata[playerUid]?.hp || 0,
                            max_hp: userMetadata[playerUid]?.max_hp || 0,
                            fightPoint: userMetadata[playerUid]?.fightPoint || 0,
                            dead_count: userMetadata[playerUid]?.dead_count || 0,
                            total_damage: { total: 0, critical: 0, lucky: 0, normal: 0 },
                            total_healing: { total: 0, critical: 0, lucky: 0, normal: 0 },
                            total_count: { total: 0, critical: 0, lucky: 0, normal: 0 },
                            taken_damage: 0,
                        };
                    }

                    const user = userStats[playerUid];

                    // Accumulate damage/healing
                    if (type === 'DMG') {
                        user.total_damage.total += value;
                        user.total_count.total += 1;
                    } else if (type === 'HEAL') {
                        user.total_healing.total += value;
                        user.total_count.total += 1;
                    }
                }
            }

            // Calculate DPS/HPS for each user
            const durationInSeconds = fightDuration > 0 ? fightDuration / 1000 : 1;
            let totalDamage = 0;
            let totalHealing = 0;

            for (const [uid, user] of Object.entries(userStats)) {
                user.total_dps = user.total_damage.total / durationInSeconds;
                user.total_hps = user.total_healing.total / durationInSeconds;
                totalDamage += user.total_damage.total;
                totalHealing += user.total_healing.total;
            }

            res.json({
                code: 0,
                data: {
                    id: fightId,
                    startTime: fightStartTime,
                    endTime: fightEndTime,
                    duration: fightDuration,
                    totalDamage,
                    totalHealing,
                    userStats: userStats,
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

    // Get list of enemies from a specific fight
    router.get('/fight/:fightId/enemies', async (req, res) => {
        try {
            const { fightId } = req.params;
            const timestamp = fightId.replace('fight_', '');

            // Security: Validate timestamp is numeric only to prevent path traversal
            if (!TIMESTAMP_REGEX.test(timestamp)) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid fight ID format',
                });
            }

            const logFilePath = path.join('./logs', timestamp, 'fight.log');

            // Read the log file
            const logContent = await fsPromises.readFile(logFilePath, 'utf8');
            const lines = logContent.split('\n');

            // Performance: Use pre-compiled regex

            const enemies = new Set();
            const userEnemyMap = {}; // Map of uid -> Set of enemy names

            // Parse each line to extract enemy names and user-enemy relationships
            for (const line of lines) {
                const match = line.match(LOG_PARSE_SIMPLE_REGEX);
                if (match) {
                    const playerUid = match[4];
                    const targetType = match[7];
                    const targetName = match[5];

                    if (targetType === 'enemy') {
                        enemies.add(targetName);

                        // Track which users damaged which enemies
                        if (!userEnemyMap[playerUid]) {
                            userEnemyMap[playerUid] = [];
                        }
                        if (!userEnemyMap[playerUid].includes(targetName)) {
                            userEnemyMap[playerUid].push(targetName);
                        }
                    }
                }
            }

            res.json({
                code: 0,
                data: {
                    enemies: Array.from(enemies),
                    userEnemyMap: userEnemyMap,
                },
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('Fight log file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'Fight log not found',
                });
            } else {
                logger.error('Failed to read fight log:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read fight log',
                });
            }
        }
    });

    // Delete a specific fight by timestamp
    router.delete('/fight/:fightId', async (req, res) => {
        try {
            const { fightId } = req.params;
            const timestamp = fightId.replace('fight_', '');

            // Security: Validate timestamp is numeric only to prevent path traversal
            if (!TIMESTAMP_REGEX.test(timestamp)) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid fight ID format',
                });
            }

            const logDirPath = path.join('./logs', timestamp);

            // Check if the log directory exists
            try {
                await fsPromises.access(logDirPath);
            } catch (error) {
                logger.warn(`Fight log directory not found for ${timestamp}:`, error);
                return res.status(404).json({
                    code: 1,
                    msg: 'Fight not found',
                });
            }

            // Delete the entire log directory
            await fsPromises.rm(logDirPath, { recursive: true, force: true });
            logger.info(`Successfully deleted fight ${fightId} (directory: ${logDirPath})`);

            res.json({
                code: 0,
                msg: 'Fight deleted successfully',
            });
        } catch (error) {
            logger.error('Failed to delete fight:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to delete fight',
            });
        }
    });

    // Get available network adapters
    router.get('/network/adapters', (req, res) => {
        try {
            const devices = cap.deviceList();
            const adapters = devices.map((device, index) => ({
                index: index,
                name: device.name,
                description: device.description || device.name,
                addresses: device.addresses,
            }));
            res.json({
                code: 0,
                data: adapters,
            });
        } catch (error) {
            logger.error('Failed to get network adapters:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to get network adapters',
            });
        }
    });

    // Get selected network adapter
    router.get('/network/selected', async (req, res) => {
        try {
            const settingsPath = path.join('./networkSettings.json');
            try {
                const data = await fsPromises.readFile(settingsPath, 'utf8');
                const settings = JSON.parse(data);
                res.json({
                    code: 0,
                    data: {
                        selectedAdapter: settings.selectedAdapter || 'auto',
                    },
                });
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // File doesn't exist, return auto
                    res.json({
                        code: 0,
                        data: {
                            selectedAdapter: 'auto',
                        },
                    });
                } else {
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Failed to get selected network adapter:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to get selected network adapter',
            });
        }
    });

    // Set selected network adapter
    router.post('/network/selected', async (req, res) => {
        try {
            const { selectedAdapter } = req.body;
            const settingsPath = path.join('./networkSettings.json');

            const settings = {
                selectedAdapter: selectedAdapter,
            };

            await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

            logger.info(`Network adapter setting updated: ${selectedAdapter}`);

            res.json({
                code: 0,
                msg: 'Network adapter setting updated. Please restart the application for changes to take effect.',
                data: settings,
            });
        } catch (error) {
            logger.error('Failed to set selected network adapter:', error);
            res.status(500).json({
                code: 1,
                msg: 'Failed to set selected network adapter',
            });
        }
    });

    // Get time-series data for a user from fight.log
    router.get('/history/:timestamp/timeseries/:uid', async (req, res) => {
        try {
            const { timestamp, uid } = req.params;
            const { enemy } = req.query; // Optional enemy filter

            // Security: Validate timestamp and uid are numeric only to prevent path traversal
            if (!/^\d+$/.test(timestamp) || !/^\d+$/.test(uid)) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid timestamp or uid format',
                });
            }

            const logFilePath = path.join('./logs', timestamp, 'fight.log');

            // Read the log file
            const logContent = await fsPromises.readFile(logFilePath, 'utf8');
            const lines = logContent.split('\n');

            // Performance: Use pre-compiled regex

            let firstTimestamp = null;
            let lastTimestamp = null;
            const enemies = new Set(); // Track all enemies encountered

            // First pass: collect all events for this user
            const userEvents = [];
            for (const line of lines) {
                const match = line.match(LOG_PARSE_SIMPLE_REGEX);
                if (match) {
                    const [, timestamp, type, playerName, playerId, targetName, targetId, targetType, value] = match;

                    if (playerId === uid) {
                        // Track enemy names for the dropdown
                        if (targetType === 'enemy') {
                            enemies.add(targetName);
                        }

                        // If enemy filter is specified, only include matching events
                        if (enemy && enemy !== 'all' && targetName !== enemy) {
                            continue;
                        }

                        const time = new Date(timestamp).getTime();
                        userEvents.push({
                            time,
                            type,
                            value: parseInt(value, 10),
                            target: targetName,
                            targetType,
                        });

                        if (firstTimestamp === null || time < firstTimestamp) {
                            firstTimestamp = time;
                        }
                        if (lastTimestamp === null || time > lastTimestamp) {
                            lastTimestamp = time;
                        }
                    }
                }
            }

            // If no events found, return empty arrays
            if (userEvents.length === 0 || firstTimestamp === null) {
                res.json({
                    code: 0,
                    data: {
                        damage: [],
                        healing: [],
                    },
                });
                return;
            }

            // Calculate duration and create 1-second buckets
            const duration = lastTimestamp - firstTimestamp;
            const bucketSize = 1000; // 1 second in milliseconds
            const numBuckets = Math.ceil(duration / bucketSize) + 1;

            const damageBuckets = new Array(numBuckets).fill(0);
            const healingBuckets = new Array(numBuckets).fill(0);

            // Aggregate events into buckets
            for (const event of userEvents) {
                const bucketIndex = Math.floor((event.time - firstTimestamp) / bucketSize);
                if (bucketIndex >= 0 && bucketIndex < numBuckets) {
                    if (event.type === 'DMG') {
                        damageBuckets[bucketIndex] += event.value;
                    } else if (event.type === 'HEAL') {
                        healingBuckets[bucketIndex] += event.value;
                    }
                }
            }

            // Convert buckets to time-series format
            const damageTimeSeries = [];
            const healingTimeSeries = [];

            for (let i = 0; i < numBuckets; i++) {
                const time = firstTimestamp + i * bucketSize;

                if (damageBuckets[i] > 0) {
                    damageTimeSeries.push({
                        time: time,
                        value: damageBuckets[i],
                    });
                }

                if (healingBuckets[i] > 0) {
                    healingTimeSeries.push({
                        time: time,
                        value: healingBuckets[i],
                    });
                }
            }

            res.json({
                code: 0,
                data: {
                    damage: damageTimeSeries,
                    healing: healingTimeSeries,
                    enemies: Array.from(enemies),
                },
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('Fight log file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'Fight log not found',
                });
            } else {
                logger.error('Failed to read fight log:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read fight log',
                });
            }
        }
    });

    return router;
}
