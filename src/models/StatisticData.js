export class StatisticData {
    constructor(user, type, element) {
        this.user = user;
        this.type = type || '';
        this.element = element || '';
        this.stats = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0,
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            total: 0,
        };
        // Track min/max values for each hit type
        this.minMax = {
            normal: { min: Infinity, max: 0 },
            critical: { min: Infinity, max: 0 },
            lucky: { min: Infinity, max: 0 },
            crit_lucky: { min: Infinity, max: 0 },
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }

    /** 添加数据记录
     * @param {number} value - 数值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} isLucky - 是否为幸运
     * @param {number} hpLessenValue - 生命值减少量（仅伤害使用）
     */
    addRecord(value, isCrit, isLucky, hpLessenValue = 0) {
        const now = Date.now();

        // Track damage/healing totals and min/max
        if (isCrit) {
            if (isLucky) {
                this.stats.crit_lucky += value;
                this.minMax.crit_lucky.min = Math.min(this.minMax.crit_lucky.min, value);
                this.minMax.crit_lucky.max = Math.max(this.minMax.crit_lucky.max, value);
            } else {
                this.stats.critical += value;
                this.minMax.critical.min = Math.min(this.minMax.critical.min, value);
                this.minMax.critical.max = Math.max(this.minMax.critical.max, value);
            }
        } else if (isLucky) {
            this.stats.lucky += value;
            this.minMax.lucky.min = Math.min(this.minMax.lucky.min, value);
            this.minMax.lucky.max = Math.max(this.minMax.lucky.max, value);
        } else {
            this.stats.normal += value;
            this.minMax.normal.min = Math.min(this.minMax.normal.min, value);
            this.minMax.normal.max = Math.max(this.minMax.normal.max, value);
        }
        this.stats.total += value;
        this.stats.hpLessen += hpLessenValue;

        if (isCrit) {
            this.count.critical++;
        }
        if (isLucky) {
            this.count.lucky++;
        }
        if (!isCrit && !isLucky) {
            this.count.normal++;
        }
        this.count.total++;

        this.realtimeWindow.push({
            time: now,
            value,
        });

        if (this.timeRange[0]) {
            this.timeRange[1] = now;
        } else {
            this.timeRange[0] = now;
        }
    }

    updateRealtimeStats() {
        const now = Date.now();

        while (this.realtimeWindow.length > 0 && now - this.realtimeWindow[0].time > 1000) {
            this.realtimeWindow.shift();
        }

        this.realtimeStats.value = 0;
        for (const entry of this.realtimeWindow) {
            this.realtimeStats.value += entry.value;
        }

        if (this.realtimeStats.value > this.realtimeStats.max) {
            this.realtimeStats.max = this.realtimeStats.value;
        }
    }

    getTotalPerSecond() {
        if (!this.timeRange[0] || !this.timeRange[1]) {
            return 0;
        }
        const totalPerSecond = (this.stats.total / (this.timeRange[1] - this.timeRange[0])) * 1000 || 0;
        if (!Number.isFinite(totalPerSecond)) return 0;
        return totalPerSecond;
    }

    reset() {
        this.stats = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0,
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            total: 0,
        };
        this.minMax = {
            normal: { min: Infinity, max: 0 },
            critical: { min: Infinity, max: 0 },
            lucky: { min: Infinity, max: 0 },
            crit_lucky: { min: Infinity, max: 0 },
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }

    /** Reset time range for new fight - keeps damage/healing stats but resets DPS timer */
    resetTimeRange() {
        this.timeRange = [];
        this.realtimeWindow = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }
}
