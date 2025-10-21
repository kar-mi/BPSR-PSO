import express from 'express';
import path from 'path';
import logger from '../services/Logger.js';
import { promises as fsPromises } from 'fs';
import userDataManager from '../services/UserDataManager.js';
import { reloadSkillConfig } from '../models/UserData.js';

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

    // POST update fight timeout
    router.post('/fight/timeout', (req, res) => {
        try {
            const { timeout } = req.body;

            if (typeof timeout !== 'number' || timeout <= 0) {
                return res.status(400).json({
                    code: 1,
                    msg: 'Invalid timeout value. Must be a positive number in milliseconds.',
                });
            }

            userDataManager.setFightTimeout(timeout);

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
        const { enemy } = req.query; // Optional enemy filter
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
                const logRegex =
                    /\[([^\]]+)\] \[(DMG|HEAL)\] DS: \w+ SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#\d+\((enemy|player)\).*ID: (\d+).*VAL: (\d+).*EXT: (\w+)/;

                // Track per-skill stats for the specific enemy
                const skillStatsPerEnemy = {};

                for (const line of lines) {
                    const match = line.match(logRegex);
                    if (match) {
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
                                    type: type === 'DMG' ? '伤害' : '治疗',
                                };
                            }

                            skillStatsPerEnemy[skillId].totalDamage += value;
                            skillStatsPerEnemy[skillId].totalCount += 1;
                            if (isCrit) skillStatsPerEnemy[skillId].critCount += 1;
                            if (isLucky) skillStatsPerEnemy[skillId].luckyCount += 1;
                        }
                    }
                }

                // Create new skills object with per-enemy stats
                const filteredSkills = {};
                for (const [skillId, stats] of Object.entries(skillStatsPerEnemy)) {
                    // Get original skill info for display name and element
                    const originalSkill = skillData.skills?.[skillId];

                    filteredSkills[skillId] = {
                        displayName: originalSkill?.displayName || skillId,
                        type: stats.type,
                        elementype: originalSkill?.elementype || '',
                        totalDamage: stats.totalDamage,
                        totalCount: stats.totalCount,
                        critCount: stats.critCount,
                        luckyCount: stats.luckyCount,
                        critRate: stats.totalCount > 0 ? stats.critCount / stats.totalCount : 0,
                        luckyRate: stats.totalCount > 0 ? stats.luckyCount / stats.totalCount : 0,
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
            const { enemy } = req.query; // Optional enemy filter
            const timestamp = fightId.replace('fight_', '');

            const userDataPath = path.join('./logs', timestamp, 'allUserData.json');
            const userData = JSON.parse(await fsPromises.readFile(userDataPath, 'utf8'));

            let processedUserData = userData;

            // If enemy filter is specified, calculate per-enemy stats from fight.log
            if (enemy && enemy !== 'all') {
                const logFilePath = path.join('./logs', timestamp, 'fight.log');
                const logContent = await fsPromises.readFile(logFilePath, 'utf8');
                const lines = logContent.split('\n');

                // Regex to parse log lines
                const logRegex =
                    /\[([^\]]+)\] \[(DMG|HEAL)\].*SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#(\d+)\((enemy|player)\).*VAL: (\d+)/;

                // Track per-user stats for the specific enemy
                const userStatsPerEnemy = {};

                for (const line of lines) {
                    const match = line.match(logRegex);
                    if (match) {
                        const type = match[2]; // DMG or HEAL
                        const playerUid = match[4];
                        const targetName = match[5];
                        const targetType = match[7];
                        const value = parseInt(match[8]);

                        // Only count events against the specified enemy
                        if (targetType === 'enemy' && targetName === enemy) {
                            if (!userStatsPerEnemy[playerUid]) {
                                userStatsPerEnemy[playerUid] = {
                                    total_damage: 0,
                                    total_healing: 0,
                                    damage_count: 0,
                                    healing_count: 0,
                                };
                            }

                            if (type === 'DMG') {
                                userStatsPerEnemy[playerUid].total_damage += value;
                                userStatsPerEnemy[playerUid].damage_count += 1;
                            } else if (type === 'HEAL') {
                                userStatsPerEnemy[playerUid].total_healing += value;
                                userStatsPerEnemy[playerUid].healing_count += 1;
                            }
                        }
                    }
                }

                // Create new user data with per-enemy stats
                processedUserData = {};
                for (const [uid, user] of Object.entries(userData)) {
                    const enemyStats = userStatsPerEnemy[uid];
                    if (enemyStats) {
                        processedUserData[uid] = {
                            ...user,
                            total_damage: {
                                ...user.total_damage,
                                total: enemyStats.total_damage,
                            },
                            total_healing: {
                                ...user.total_healing,
                                total: enemyStats.total_healing,
                            },
                            total_count: {
                                ...user.total_count,
                                total: enemyStats.damage_count + enemyStats.healing_count,
                            },
                        };
                    }
                }
            }

            // Calculate totals
            let totalDamage = 0;
            let totalHealing = 0;

            for (const [uid, user] of Object.entries(processedUserData)) {
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
                    userStats: processedUserData,
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
            const logFilePath = path.join('./logs', timestamp, 'fight.log');

            // Read the log file
            const logContent = await fsPromises.readFile(logFilePath, 'utf8');
            const lines = logContent.split('\n');

            // Regex to parse log lines with target information
            const logRegex =
                /\[([^\]]+)\] \[(DMG|HEAL)\].*SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#(\d+)\((enemy|player)\).*VAL: (\d+)/;

            const enemies = new Set();
            const userEnemyMap = {}; // Map of uid -> Set of enemy names

            // Parse each line to extract enemy names and user-enemy relationships
            for (const line of lines) {
                const match = line.match(logRegex);
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

    // Get time-series data for a user from fight.log
    router.get('/history/:timestamp/timeseries/:uid', async (req, res) => {
        try {
            const { timestamp, uid } = req.params;
            const { enemy } = req.query; // Optional enemy filter
            const logFilePath = path.join('./logs', timestamp, 'fight.log');

            // Read the log file
            const logContent = await fsPromises.readFile(logFilePath, 'utf8');
            const lines = logContent.split('\n');

            // Regex to parse log lines with target information
            const logRegex =
                /\[([^\]]+)\] \[(DMG|HEAL)\].*SRC: ([^#]+)#(\d+)\(player\).*TGT: ([^#]+)#(\d+)\((enemy|player)\).*VAL: (\d+)/;

            let firstTimestamp = null;
            let lastTimestamp = null;
            const enemies = new Set(); // Track all enemies encountered

            // First pass: collect all events for this user
            const userEvents = [];
            for (const line of lines) {
                const match = line.match(logRegex);
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
