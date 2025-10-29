import { StatisticData } from './StatisticData.js';
import skill_names from '../tables/skill_names.json' with { type: 'json' };
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let skillConfig = skill_names.skill_names;

// Path to skill names file
const skillNamesPath = path.join(__dirname, '../tables/skill_names.json');

/**
 * Reload skill names from the JSON file
 * Call this after editing skill_names.json to apply changes without restart
 * @returns {boolean} True if reload was successful, false otherwise
 */
export function reloadSkillConfig() {
    try {
        const fileContent = fs.readFileSync(skillNamesPath, 'utf8');
        const newSkillNames = JSON.parse(fileContent);
        skillConfig = newSkillNames.skill_names;
        console.log('✓ Skill names reloaded successfully');
        return true;
    } catch (e) {
        console.error('Error reloading skill names:', e.message);
        return false;
    }
}

function getSubProfessionBySkillId(skillId) {
    switch (skillId) {
        case 1241:
            return '(Frostbeam)';
        case 2307:
        case 2361:
        case 55302:
            return '(Concerto)';
        case 20301:
            return '(Lifebind)';
        case 1518:
        case 1541:
        case 21402:
            return '(Smite)';
        case 2306:
            return '(Dissonance)';
        case 120901:
        case 120902:
            return '(Icicle)';
        case 1714:
        case 1734:
            return '(Iaido Slash)';
        case 44701:
        case 179906:
            return '(Moonstrike)';
        case 220112:
        case 2203622:
            return '(Falconry)';
        case 2292:
        case 1700820:
        case 1700825:
        case 1700827:
            return '(Wildpack)';
        case 1419:
            return '(Vanguard)';
        case 1405:
        case 1418:
            return '(Skyward)';
        case 2405:
            return '(Shield)';
        case 2406:
            return '(Recovery)';
        case 199902:
            return '(Earthfort)';
        case 1930:
        case 1931:
        case 1934:
        case 1935:
            return '(Block)';
        default:
            return '';
    }
}

export class UserData {
    constructor(uid) {
        this.uid = uid;
        this.name = '';
        this.damageStats = new StatisticData(this, '伤害');
        this.healingStats = new StatisticData(this, '治疗');
        this.takenDamage = 0; // 承伤
        this.deadCount = 0; // 死亡次数
        this.profession = '...';
        this.skillUsage = new Map(); // 技能使用情况
        this.skillUsageByEnemy = new Map(); // Per-enemy skill tracking: Map<skillId, Map<enemyId, StatisticData>>
        this.fightPoint = 0; // 总评分
        this.subProfession = '';
        this.attr = {};
        this.lastUpdateTime = Date.now();
        this.lastFightId = null; // Track which fight this user data belongs to
    }

    _touch() {
        this.lastUpdateTime = Date.now();
    }

    /**
     * Track skill usage for both global and per-target tracking
     * Consolidates duplicate logic from addDamage and addHealing
     * @private
     */
    _trackSkillUsage(skillId, element, value, isCrit, isCauseLucky, hpLessenValue, targetUid, type) {
        // Track global skill usage
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData(this, type, element));
        }
        this.skillUsage.get(skillId).addRecord(value, isCrit, isCauseLucky, hpLessenValue);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        // Track per-target skill usage
        if (targetUid !== null && targetUid !== undefined) {
            if (!this.skillUsageByEnemy.has(skillId)) {
                this.skillUsageByEnemy.set(skillId, new Map());
            }
            const targetMap = this.skillUsageByEnemy.get(skillId);
            if (!targetMap.has(targetUid)) {
                targetMap.set(targetUid, new StatisticData(this, type, element));
            }
            targetMap.get(targetUid).addRecord(value, isCrit, isCauseLucky, hpLessenValue);
            targetMap.get(targetUid).realtimeWindow.length = 0;
        }
    }

    /** 添加伤害记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} damage - 伤害值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     * @param {number} hpLessenValue - 生命值减少量
     * @param {number} [targetUid] - 目标ID (敌人ID)
     */
    addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, targetUid = null) {
        this._touch();
        this.damageStats.addRecord(damage, isCrit, isLucky, hpLessenValue);

        // Track skill usage (consolidated)
        this._trackSkillUsage(skillId, element, damage, isCrit, isCauseLucky, hpLessenValue, targetUid, '伤害');

        const subProfession = getSubProfessionBySkillId(skillId);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加治疗记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} healing - 治疗值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     * @param {number} [targetUid] - 目标ID (玩家ID)
     */
    addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid = null) {
        this._touch();
        this.healingStats.addRecord(healing, isCrit, isLucky);

        // Track skill usage (consolidated) - offset healing skills by 1 billion
        const healingSkillId = skillId + 1000000000;
        this._trackSkillUsage(healingSkillId, element, healing, isCrit, isCauseLucky, 0, targetUid, '治疗');

        const subProfession = getSubProfessionBySkillId(skillId);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加承伤记录
     * @param {number} damage - 承受的伤害值
     * @param {boolean} isDead - 是否致死伤害
     * */
    addTakenDamage(damage, isDead) {
        this._touch();
        this.takenDamage += damage;
        if (isDead) {
            this.deadCount++;
        }
    }

    /** 更新实时DPS和HPS 计算过去1秒内的总伤害和治疗 */
    updateRealtimeDps() {
        this.damageStats.updateRealtimeStats();
        this.healingStats.updateRealtimeStats();
    }

    /** 计算总DPS */
    getTotalDps() {
        return this.damageStats.getTotalPerSecond();
    }

    /** 计算总HPS */
    getTotalHps() {
        return this.healingStats.getTotalPerSecond();
    }

    /** 获取合并的次数统计 */
    getTotalCount() {
        return {
            normal: this.damageStats.count.normal + this.healingStats.count.normal,
            critical: this.damageStats.count.critical + this.healingStats.count.critical,
            lucky: this.damageStats.count.lucky + this.healingStats.count.lucky,
            total: this.damageStats.count.total + this.healingStats.count.total,
        };
    }

    /** 获取用户数据摘要 */
    getSummary() {
        const summary = {
            realtime_dps: this.damageStats.realtimeStats.value,
            realtime_dps_max: this.damageStats.realtimeStats.max,
            total_dps: this.getTotalDps(),
            total_damage: { ...this.damageStats.stats },
            total_count: this.getTotalCount(),
            realtime_hps: this.healingStats.realtimeStats.value,
            realtime_hps_max: this.healingStats.realtimeStats.max,
            total_hps: this.getTotalHps(),
            total_healing: { ...this.healingStats.stats },
            taken_damage: this.takenDamage,
            profession: this.profession + (this.subProfession ? ` ${this.subProfession}` : ''),
            subProfession: this.subProfession,
            name: this.name,
            fightPoint: this.fightPoint,
            hp: this.attr.hp,
            max_hp: this.attr.max_hp,
            dead_count: this.deadCount,
        };

        // Debug: Check if the summary contains string representations
        if (typeof summary.total_damage === 'string' || typeof summary.total_healing === 'string') {
            console.warn(`User ${this.uid} getSummary() returning string data:`, {
                total_damage_type: typeof summary.total_damage,
                total_healing_type: typeof summary.total_healing,
                total_damage: summary.total_damage,
                total_healing: summary.total_healing,
                damageStats_stats: this.damageStats.stats,
                healingStats_stats: this.healingStats.stats,
            });
        }

        return summary;
    }

    /**
     * Build skill summary object from StatisticData
     * Shared helper to avoid code duplication
     * @private
     */
    _buildSkillSummary(skillId, stat) {
        const critRate = stat.count.total > 0 ? stat.count.critical / stat.count.total : 0;
        const luckyRate = stat.count.total > 0 ? stat.count.lucky / stat.count.total : 0;
        const name = skillConfig[skillId % 1000000000] ?? skillId % 1000000000;

        // Calculate averages for each hit type
        const normalAvg = stat.count.normal > 0 ? stat.stats.normal / stat.count.normal : 0;
        const critAvg = stat.count.critical > 0 ? stat.stats.critical / stat.count.critical : 0;
        const luckyAvg = stat.count.lucky > 0 ? stat.stats.lucky / stat.count.lucky : 0;
        const critLuckyAvg = (stat.count.critical + stat.count.lucky) > 0 ? stat.stats.crit_lucky / (stat.count.critical + stat.count.lucky) : 0;
        const overallAvg = stat.count.total > 0 ? stat.stats.total / stat.count.total : 0;

        // Calculate DPS/HPS (damage/healing per second)
        const dps = stat.getTotalPerSecond ? stat.getTotalPerSecond() : 0;

        // Calculate hits per second
        const timeRangeSeconds = stat.timeRange[0] && stat.timeRange[1]
            ? (stat.timeRange[1] - stat.timeRange[0]) / 1000
            : 0;
        const hitsPerSecond = timeRangeSeconds > 0 ? stat.count.total / timeRangeSeconds : 0;

        // Get min/max values, handle Infinity
        const normalMin = stat.minMax.normal.min === Infinity ? 0 : stat.minMax.normal.min;
        const normalMax = stat.minMax.normal.max;
        const critMin = stat.minMax.critical.min === Infinity ? 0 : stat.minMax.critical.min;
        const critMax = stat.minMax.critical.max;

        return {
            displayName: name,
            type: stat.type,
            elementype: stat.element,
            totalDamage: stat.stats.total,
            totalCount: stat.count.total,
            critCount: stat.count.critical,
            luckyCount: stat.count.lucky,
            critRate: critRate,
            luckyRate: luckyRate,

            // New detailed statistics
            dps: dps,
            hitsPerSecond: hitsPerSecond,
            averages: {
                overall: overallAvg,
                normal: normalAvg,
                crit: critAvg,
                lucky: luckyAvg,
                critLucky: critLuckyAvg,
            },
            normal: {
                min: normalMin,
                max: normalMax,
                avg: normalAvg,
                count: stat.count.normal,
                total: stat.stats.normal,
            },
            crit: {
                min: critMin,
                max: critMax,
                avg: critAvg,
                count: stat.count.critical,
                total: stat.stats.critical,
            },

            damageBreakdown: { ...stat.stats },
            countBreakdown: { ...stat.count },
        };
    }

    /** 获取技能统计数据 */
    getSkillSummary() {
        const skills = {};
        for (const [skillId, stat] of this.skillUsage) {
            skills[skillId] = this._buildSkillSummary(skillId, stat);
        }
        return skills;
    }

    /** 获取按敌人筛选的技能统计数据
     * @param {number} [enemyId] - 敌人ID (optional, if provided, only return data for that enemy)
     * @returns {Object} - Skills data, optionally filtered by enemy
     */
    getSkillSummaryByEnemy(enemyId = null) {
        const skills = {};

        for (const [skillId, enemyMap] of this.skillUsageByEnemy) {
            const name = skillConfig[skillId % 1000000000] ?? skillId % 1000000000;

            // If specific enemy requested, only return that enemy's data
            if (enemyId !== null) {
                const stat = enemyMap.get(enemyId);
                if (!stat) continue; // Skip if no data for this enemy

                skills[skillId] = this._buildSkillSummary(skillId, stat);
            } else {
                // Return all skills with all enemy data aggregated
                skills[skillId] = {
                    displayName: name,
                    enemies: {},
                };

                for (const [targetId, stat] of enemyMap) {
                    skills[skillId].enemies[targetId] = this._buildSkillSummary(skillId, stat);
                }
            }
        }
        return skills;
    }

    /** 设置职业
     * @param {string} profession - 职业名称
     * */
    setProfession(profession) {
        this._touch();
        if (profession !== this.profession) {
            this.setSubProfession('');
        }
        this.profession = profession;
    }

    /** 设置子职业
     * @param {string} subProfession - 子职业名称
     * */
    setSubProfession(subProfession) {
        this._touch();
        this.subProfession = subProfession;
    }

    /** 设置姓名
     * @param {string} name - 姓名
     * */
    setName(name) {
        this._touch();
        this.name = name;
    }

    /** 设置用户总评分
     * @param {number} fightPoint - 总评分
     * */
    setFightPoint(fightPoint) {
        this._touch();
        this.fightPoint = fightPoint;
    }

    /** 设置额外数据
     * @param {string} key
     * @param {any} value
     * */
    setAttrKV(key, value) {
        this._touch();
        this.attr[key] = value;
    }

    /** 重置数据 预留 */
    reset() {
        // Preserve user identity and attributes
        const preservedName = this.name;
        const preservedProfession = this.profession;
        const preservedSubProfession = this.subProfession;
        const preservedAttr = { ...this.attr };

        // Reset all combat data
        this.damageStats.reset();
        this.healingStats.reset();
        this.takenDamage = 0;
        this.skillUsage.clear();
        this.skillUsageByEnemy.clear();
        this.fightPoint = 0;

        // Restore preserved data
        this.name = preservedName;
        this.profession = preservedProfession;
        this.subProfession = preservedSubProfession;
        this.attr = preservedAttr;

        this._touch();
    }

    /** Reset time range for new fight - keeps damage/healing stats but resets DPS timer */
    resetTimeRange() {
        this.damageStats.resetTimeRange();
        this.healingStats.resetTimeRange();
        // Reset time range for all skill usage stats
        for (const [skillId, stat] of this.skillUsage) {
            stat.resetTimeRange();
        }
        // Reset time range for per-enemy skill stats
        for (const [skillId, enemyMap] of this.skillUsageByEnemy) {
            for (const [enemyId, stat] of enemyMap) {
                stat.resetTimeRange();
            }
        }
        this._touch();
    }
}
