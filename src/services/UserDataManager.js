import { UserData } from '../models/UserData.js';
import { Lock } from '../models/Lock.js';
import { config } from '../config.js';
import socket from './Socket.js';
import logger from './Logger.js';
import fsPromises from 'fs/promises';
import path from 'path';
import { notifyHistoryWindowRefresh } from '../client/IpcListeners.js';
import { paths } from '../config/paths.js';
import bossData from '../tables/boss.json' with { type: 'json' };

class UserDataManager {
    constructor(logger) {
        this.users = new Map();
        this.userCache = new Map();
        this.cacheFilePath = paths.users;

        this.saveThrottleDelay = 2000;
        this.saveThrottleTimer = null;
        this.pendingSave = false;

        this.hpCache = new Map();
        this.startTime = Date.now();

        this.logLock = new Lock();
        this.logDirExist = new Set();

        this.enemyCache = {
            name: new Map(),
            hp: new Map(),
            maxHp: new Map(),
            attrId: new Map(), // Track attrId for each entity
        };

        // Persistent enemy tracking - survives cache clears
        // Maps entityId -> { name, attrId, maxHp } for important enemies
        this.persistentEnemyData = new Map();

        // Track encountered bosses during the fight
        this.encounteredBosses = new Set();

        // Track recent damage events for death reports (playerId -> array of recent damage events)
        this.recentDamageEvents = new Map();
        this.maxRecentDamageEvents = 5; // Keep last 5 damage events per player

        // Track death events with context
        this.deathEvents = [];

        // Track intervals for cleanup
        this.intervals = [];
        this.isShuttingDown = false;

        // Configurable fight timeout (default 15 seconds)
        // Will be loaded from settings.json via getGlobalSettings()
        this.fightTimeout = 15 * 1000; // milliseconds (default)

        // inactive timeout
        this.inactiveTimeout = 120 * 1000; // milliseconds

        // 自动保存
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;

        this.currentFightId = this.startTime;

        //check every 5 seconds for timeout
        this.intervals.push(
            setInterval(() => {
                if (this.isShuttingDown) return;
                this.checkTimeoutClear();
            }, 5 * 1000)
        );

        this.intervals.push(
            setInterval(() => {
                if (this.isShuttingDown) return;
                if (this.lastLogTime < this.lastAutoSaveTime) return;
                this.lastAutoSaveTime = Date.now();
                this.saveAllUserData();
            }, 10 * 1000)
        );
    }

    /**
     * Stop all intervals and mark as shutting down
     */
    stop() {
        this.isShuttingDown = true;
        this.intervals.forEach((interval) => clearInterval(interval));
        this.intervals = [];
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
            this.saveThrottleTimer = null;
        }
    }

    // Method to update the fight timeout
    setFightTimeout(timeoutMs) {
        this.fightTimeout = timeoutMs;
        logger.info(`Fight timeout updated to ${timeoutMs}ms (${timeoutMs / 1000}s)`);
    }

    // Get current fight timeout
    getFightTimeout() {
        return this.fightTimeout;
    }

    async init() {
        await this.loadUserCache();
        this.loadFightTimeoutFromSettings();
    }

    /**
     * Load fight timeout from global settings
     */
    loadFightTimeoutFromSettings() {
        const settings = this.getGlobalSettings();
        if (settings.fightTimeout !== undefined && typeof settings.fightTimeout === 'number') {
            this.fightTimeout = settings.fightTimeout;
            logger.info(`Fight timeout loaded from settings: ${this.fightTimeout}ms`);
        }
    }

    async loadUserCache() {
        try {
            await fsPromises.access(this.cacheFilePath);
            const data = await fsPromises.readFile(this.cacheFilePath, 'utf8');
            const cacheData = JSON.parse(data);
            this.userCache = new Map(Object.entries(cacheData));
            logger.info(`Loaded ${this.userCache.size} user cache entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load user cache:', error);
            }
        }
    }

    async saveUserCache() {
        try {
            const cacheData = Object.fromEntries(this.userCache);
            await fsPromises.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            logger.error('Failed to save user cache:', error);
        }
    }

    saveUserCacheThrottled() {
        this.pendingSave = true;
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
        }
        this.saveThrottleTimer = setTimeout(async () => {
            if (this.pendingSave) {
                await this.saveUserCache();
                this.pendingSave = false;
                this.saveThrottleTimer = null;
            }
        }, this.saveThrottleDelay);
    }

    async forceUserCacheSave() {
        await this.saveAllUserData(this.users, this.startTime);
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
            this.saveThrottleTimer = null;
        }
        if (this.pendingSave) {
            await this.saveUserCache();
            this.pendingSave = false;
        }
    }

    getUser(uid) {
        if (!this.users.has(uid)) {
            const user = new UserData(uid);
            const cachedData = this.userCache.get(String(uid));
            if (cachedData) {
                if (cachedData.name) {
                    user.setName(cachedData.name);
                }
                if (cachedData.profession) {
                    user.setProfession(cachedData.profession);
                }
                if (cachedData.fightPoint !== undefined && cachedData.fightPoint !== null) {
                    user.setFightPoint(cachedData.fightPoint);
                }
                if (cachedData.maxHp !== undefined && cachedData.maxHp !== null) {
                    user.setAttrKV('max_hp', cachedData.maxHp);
                }
            }
            if (this.hpCache.has(uid)) {
                user.setAttrKV('hp', this.hpCache.get(uid));
            }
            this.users.set(uid, user);
        }
        return this.users.get(uid);
    }

    addDamage(uid, skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, targetUid) {
        if (config.IS_PAUSED) return;
        // Security: Validate damage is a reasonable number to prevent overflow
        if (damage < 0 || damage > Number.MAX_SAFE_INTEGER) {
            logger.warn(`Invalid damage value: ${damage} for uid ${uid}`);
            return;
        }
        const user = this.getUser(uid);
        user.addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue, targetUid);
    }

    addHealing(uid, skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid) {
        if (config.IS_PAUSED) return;
        // Security: Validate healing is a reasonable number to prevent overflow
        if (healing < 0 || healing > Number.MAX_SAFE_INTEGER) {
            logger.warn(`Invalid healing value: ${healing} for uid ${uid}`);
            return;
        }
        if (uid !== 0) {
            const user = this.getUser(uid);
            user.addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid);
        }
    }

    addTakenDamage(uid, damage, isDead) {
        if (config.IS_PAUSED) return;
        // Security: Validate damage is a reasonable number to prevent overflow
        if (damage < 0 || damage > Number.MAX_SAFE_INTEGER) {
            logger.warn(`Invalid taken damage value: ${damage} for uid ${uid}`);
            return;
        }
        const user = this.getUser(uid);
        user.addTakenDamage(damage, isDead);
    }

    /**
     * Track a damage event for death report
     * @param {number} playerId - Player who took damage
     * @param {object} damageEvent - Damage event details
     */
    trackDamageEventForDeathReport(playerId, damageEvent) {
        if (!this.recentDamageEvents.has(playerId)) {
            this.recentDamageEvents.set(playerId, []);
        }
        const events = this.recentDamageEvents.get(playerId);
        events.push(damageEvent);

        // Keep only the last N events
        if (events.length > this.maxRecentDamageEvents) {
            events.shift();
        }
    }

    /**
     * Record a player death with recent damage context
     * @param {number} playerId - Player who died
     * @param {string} playerName - Player name
     * @param {string} killerName - Name of killer
     * @param {boolean} killedByPlayer - Whether killed by another player
     */
    recordPlayerDeath(playerId, playerName, killerName, killedByPlayer) {
        const recentDamage = this.recentDamageEvents.get(playerId) || [];
        const deathEvent = {
            timestamp: Date.now(),
            playerId,
            playerName,
            killerName,
            killedByPlayer,
            recentDamage: [...recentDamage], // Clone the array
        };
        this.deathEvents.push(deathEvent);

        // Clear the damage events for this player after recording death
        this.recentDamageEvents.delete(playerId);
    }

    /**
     * Get death events for the current fight
     */
    getDeathEvents() {
        return this.deathEvents;
    }

    /**
     * Clear death events (called when starting new fight)
     */
    clearDeathEvents() {
        this.deathEvents = [];
        this.recentDamageEvents.clear();
    }

    /**
     * Helper to notify the start of a new fight.
     * Called when the first log of a new fight is written.
     */
    _notifyNewFightStarted() {
        socket.emit('new_fight_started', { fightId: this.currentFightId });
        logger.info(`New fight started (ID: ${this.currentFightId})`);
    }

    async addLog(log) {
        if (config.IS_PAUSED) return;

        const isFirstLog = this.lastLogTime === 0;

        const logDir = path.join('./logs', String(this.startTime));
        const logFile = path.join(logDir, 'fight.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}\n`;

        this.lastLogTime = Date.now();

        await this.logLock.acquire();
        try {
            if (!this.logDirExist.has(logDir)) {
                try {
                    await fsPromises.access(logDir);
                } catch (error) {
                    await fsPromises.mkdir(logDir, { recursive: true });
                }
                this.logDirExist.add(logDir);
            }
            await fsPromises.appendFile(logFile, logEntry, 'utf8');

            if (isFirstLog) {
                this._notifyNewFightStarted();
            }
        } catch (error) {
            logger.error('Failed to save log:', error);
        }
        this.logLock.release();
    }

    /**
     * Track enemy encounter and check if it's a boss
     * @param {string} enemyId - The enemy ID
     * @param {string} enemyName - The enemy name
     */
    trackEnemyEncounter(enemyId, enemyName) {
        let isBoss = false;
        let bossName = null;

        // Method 1: Check by ID (attrId)
        if (bossData[enemyId]) {
            isBoss = true;
            bossName = bossData[enemyId];
        }

        // Method 2: Check by name (fallback if ID not in table)
        if (!isBoss && enemyName) {
            // Check if enemy name matches any boss name in the table
            for (const [id, name] of Object.entries(bossData)) {
                if (name === enemyName || enemyName.includes(name) || name.includes(enemyName)) {
                    isBoss = true;
                    bossName = name;
                    enemyId = id; // Update ID if found by name
                    break;
                }
            }
        }

        if (isBoss && bossName) {
            this.encounteredBosses.add(JSON.stringify({
                id: enemyId,
                name: bossName,
                displayName: enemyName || bossName
            }));
            logger.debug(`Boss encountered: ${bossName} (ID: ${enemyId}, Display: ${enemyName || bossName})`);
        }
    }

    setProfession(uid, profession) {
        const user = this.getUser(uid);
        if (user.profession !== profession) {
            user.setProfession(profession);
            logger.info(`Found profession ${profession} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).profession = profession;
            this.saveUserCacheThrottled();
        }
    }

    setName(uid, name) {
        const user = this.getUser(uid);
        if (user.name !== name) {
            user.setName(name);
            logger.info(`Found player name ${name} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).name = name;
            this.saveUserCacheThrottled();
        }
    }

    setFightPoint(uid, fightPoint) {
        const user = this.getUser(uid);
        if (user.fightPoint != fightPoint) {
            user.setFightPoint(fightPoint);
            logger.info(`Found ability score ${fightPoint} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).fightPoint = fightPoint;
            this.saveUserCacheThrottled();
        }
    }

    setAttrKV(uid, key, value) {
        const user = this.getUser(uid);
        user.attr[key] = value;
        if (key === 'max_hp') {
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).maxHp = value;
            this.saveUserCacheThrottled();
        }
        if (key === 'hp') {
            this.hpCache.set(uid, value);
        }
    }

    updateAllRealtimeDps() {
        for (const user of this.users.values()) {
            user.updateRealtimeDps();
        }
    }

    getUserSkillData(uid) {
        const user = this.users.get(uid);
        if (!user) return null;
        return {
            uid: user.uid,
            name: user.name,
            profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
            skills: user.getSkillSummary(),
            attr: user.attr,
        };
    }

    getUserSkillDataByEnemy(uid, enemyId = null) {
        const user = this.users.get(uid);
        if (!user) return null;
        return {
            uid: user.uid,
            name: user.name,
            profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
            skills: user.getSkillSummaryByEnemy(enemyId),
            attr: user.attr,
        };
    }

    getAllUsersData() {
        const result = {};
        for (const [uid, user] of this.users.entries()) {
            result[uid] = user.getSummary();
        }
        return result;
    }

    getAllEnemiesData() {
        const result = {};
        const enemyIds = new Set([
            ...this.enemyCache.name.keys(),
            ...this.enemyCache.hp.keys(),
            ...this.enemyCache.maxHp.keys(),
            ...this.enemyCache.attrId.keys(),
        ]);
        enemyIds.forEach((id) => {
            result[id] = {
                name: this.enemyCache.name.get(id),
                hp: this.enemyCache.hp.get(id),
                max_hp: this.enemyCache.maxHp.get(id),
                attr_id: this.enemyCache.attrId.get(id),
            };
        });
        return result;
    }

    /**
     * Persist important enemy data before deleting from cache
     * @param {number} id - Enemy entity ID
     */
    persistEnemyDataIfImportant(id) {
        const name = this.enemyCache.name.get(id);
        const attrId = this.enemyCache.attrId.get(id);
        const maxHp = this.enemyCache.maxHp.get(id);

        // Only persist if we have name/attrId and significant HP
        if ((name || attrId) && maxHp && maxHp > 10000) {
            this.persistentEnemyData.set(id, {
                name: name || null,
                attrId: attrId !== undefined ? attrId : null,
                maxHp: maxHp
            });
        }
    }

    deleteEnemyData(id) {
        // Persist before deleting if it's an important enemy
        this.persistEnemyDataIfImportant(id);

        this.enemyCache.name.delete(id);
        this.enemyCache.hp.delete(id);
        this.enemyCache.maxHp.delete(id);
        this.enemyCache.attrId.delete(id);
    }

    refreshEnemyCache() {
        // Persist all current enemies before clearing cache
        for (const id of this.enemyCache.name.keys()) {
            this.persistEnemyDataIfImportant(id);
        }

        // Find and track the max HP monster
        let maxHpMonsterId = 0;
        for (const [id, hp] of this.enemyCache.maxHp.entries()) {
            if (!maxHpMonsterId || hp > this.enemyCache.maxHp.get(maxHpMonsterId)) {
                maxHpMonsterId = id;
            }
        }
        if (maxHpMonsterId && this.enemyCache.name.has(maxHpMonsterId)) {
            this.maxHpMonster = this.enemyCache.name.get(maxHpMonsterId);
        }

        this.enemyCache.name.clear();
        this.enemyCache.hp.clear();
        this.enemyCache.maxHp.clear();
        this.enemyCache.attrId.clear();
    }

    async clearAll() {
        const usersToSave = this.users;
        const saveStartTime = this.startTime;
        const deathEventsToSave = this.deathEvents;

        this.users = new Map();
        this.startTime = Date.now();
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        this.encounteredBosses.clear(); // Clear boss tracking for new fight
        this.clearDeathEvents(); // Clear death tracking for new fight
        this.persistentEnemyData.clear(); // Clear persistent enemy data for new fight
        await this.saveAllUserData(usersToSave, saveStartTime, deathEventsToSave);

        // Emit clear event to frontend
        socket.emit('data_cleared');

        // Notify history window to refresh
        notifyHistoryWindowRefresh();
    }

    getUserIds() {
        return Array.from(this.users.keys());
    }

    async saveAllUserData(usersToSave = null, startTime = null, deathEventsToSave = null) {
        try {
            const endTime = Date.now();
            const users = usersToSave || this.users;
            const timestamp = startTime || this.startTime;
            const deathEvents = deathEventsToSave || this.deathEvents;
            const logDir = path.join('./logs', String(timestamp));
            const usersDir = path.join(logDir, 'users');
            const summary = {
                startTime: timestamp,
                endTime,
                duration: endTime - timestamp,
                userCount: users.size,
                version: config.VERSION,
                maxHpMonster: '',
            };

            let maxHpMonsterId = 0;
            for (const [id, hp] of this.enemyCache.maxHp.entries()) {
                if (!maxHpMonsterId || hp > this.enemyCache.maxHp.get(maxHpMonsterId)) {
                    maxHpMonsterId = id;
                }
            }
            if (maxHpMonsterId && this.enemyCache.name.has(maxHpMonsterId)) {
                summary.maxHpMonster = this.enemyCache.name.get(maxHpMonsterId);
            }
            if (!summary.maxHpMonster) {
                summary.maxHpMonster = this.maxHpMonster;
                this.maxHpMonster = '';
            }

            const allUsersData = {};
            const userDatas = new Map();
            for (const [uid, user] of users.entries()) {
                allUsersData[uid] = user.getSummary();
                const userData = {
                    uid: user.uid,
                    name: user.name,
                    profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
                    skills: user.getSkillSummary(),
                    attr: user.attr,
                };
                userDatas.set(uid, userData);
            }

            try {
                await fsPromises.access(usersDir);
            } catch (error) {
                await fsPromises.mkdir(usersDir, { recursive: true });
            }

            // Wait for any pending fight.log writes to complete before saving other files
            // This prevents race conditions where JSON files are saved but fight.log is still being written
            await this.logLock.acquire();
            try {
                // Ensure fight.log exists (create empty file if no logs were written)
                const fightLogPath = path.join(logDir, 'fight.log');
                try {
                    await fsPromises.access(fightLogPath);
                } catch (error) {
                    // fight.log doesn't exist, create an empty one
                    await fsPromises.writeFile(fightLogPath, '', 'utf8');
                    logger.debug(`Created empty fight.log for timestamp ${timestamp}`);
                }
            } finally {
                this.logLock.release();
            }

            const allUserDataPath = path.join(logDir, 'allUserData.json');
            await fsPromises.writeFile(allUserDataPath, JSON.stringify(allUsersData, null, 2), 'utf8');
            for (const [uid, userData] of userDatas.entries()) {
                const userDataPath = path.join(usersDir, `${uid}.json`);
                await fsPromises.writeFile(userDataPath, JSON.stringify(userData, null, 2), 'utf8');
            }
            await fsPromises.writeFile(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

            // Save encountered bosses
            if (this.encounteredBosses.size > 0) {
                const bossesArray = Array.from(this.encounteredBosses).map(bossStr => JSON.parse(bossStr));
                await fsPromises.writeFile(
                    path.join(logDir, 'encountered_boss.json'),
                    JSON.stringify(bossesArray, null, 2),
                    'utf8'
                );
                logger.debug(`Saved ${bossesArray.length} encountered boss(es) to ${logDir}`);
            }

            // Save death events
            if (deathEvents && deathEvents.length > 0) {
                await fsPromises.writeFile(
                    path.join(logDir, 'death_events.json'),
                    JSON.stringify(deathEvents, null, 2),
                    'utf8'
                );
                logger.debug(`Saved ${deathEvents.length} death event(s) to ${logDir}`);
            }

            logger.debug(`Saved data for ${summary.userCount} users to ${logDir}`);
        } catch (error) {
            logger.error('Failed to save all user data:', error);
            throw error;
        }
    }

    checkTimeoutClear() {
        if (!config.GLOBAL_SETTINGS.autoClearOnTimeout || this.lastLogTime === 0 || this.users.size === 0) return;
        const currentTime = Date.now();
        if (this.lastLogTime && currentTime - this.lastLogTime > this.fightTimeout) {
            // Fire and forget - don't await since this is called from sync contexts
            this.clearAll().catch((error) => {
                logger.error('Error during timeout clear:', error);
            });
            logger.info(`Timeout reached (${this.fightTimeout}ms), statistics cleared!`);
        }
    }

    getGlobalSettings() {
        return config.GLOBAL_SETTINGS;
    }
}

const userDataManager = new UserDataManager();
export default userDataManager;
