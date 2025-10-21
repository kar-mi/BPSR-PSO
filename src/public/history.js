// Fight History Window JavaScript
import { SERVER_URL, getNextColorShades, formatNumber, getProfessionIconHtml, initializeOpacitySlider, formatDateForInput } from './utils.js';

// State variables
let currentView = 'history'; // 'cumulative', 'history'
let fightHistory = [];
let cumulativeStats = null;
let allUsers = {};
let userColors = {};
let currentDateRange = { startDate: null, endDate: null };
let currentFightId = null; // Track current fight being viewed
let currentDataType = 'damage'; // 'damage' or 'healing'
let currentEnemy = 'all'; // 'all' or specific enemy name
let currentSortColumn = 'total'; // 'rank', 'name', 'total', 'dps', 'percent', 'crit', 'lucky'
let currentSortOrder = 'desc'; // 'asc' or 'desc'

// DOM elements
const columnsContainer = document.getElementById('columnsContainer');
const historyContainer = document.getElementById('historyContainer');
const cumulativeView = document.getElementById('cumulativeView');
const fightListView = document.getElementById('fightListView');
const cumulativeStatsDiv = document.getElementById('cumulativeStats');
const fightList = document.getElementById('fightList');
const fightDetailsContainer = document.getElementById('fightDetailsContainer');
const fightDetailsTable = document.getElementById('fightDetailsTable');
const dataTypeFilter = document.getElementById('dataTypeFilter');
const enemyFilter = document.getElementById('enemyFilter');

// Open skill breakdown window for a user
function openSkillBreakdown(uid, userName, userProfession) {
    if (!uid) {
        console.error('No UID provided for skill breakdown');
        return;
    }

    // Use Electron IPC to open window with proper configuration
    if (window.electronAPI && window.electronAPI.openSkillsWindow) {
        window.electronAPI.openSkillsWindow({
            uid: uid,
            name: userName || 'Unknown',
            profession: userProfession || 'Unknown',
            fightId: currentFightId || null,
        });
    } else {
        // Fallback for non-Electron environments (development)
        const params = new URLSearchParams({
            uid: uid,
            name: userName || 'Unknown',
            profession: userProfession || 'Unknown',
        });

        if (currentFightId) {
            params.append('fightId', currentFightId);
        }

        const url = `skills.html?${params.toString()}`;
        const windowName = `skill-breakdown-${uid}`;
        const width = 600;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        const skillWindow = window.open(
            url,
            windowName,
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (skillWindow) {
            skillWindow.focus();
        }
    }
}

function renderDataList(users) {
    // Early exit if no users
    if (users.length === 0) {
        columnsContainer.innerHTML = '';
        return;
    }

    const totalDamageOverall = users.reduce((sum, user) => sum + user.total_damage.total, 0);
    const totalHealingOverall = users.reduce((sum, user) => sum + user.total_healing.total, 0);

    users.sort((a, b) => b.total_damage.total - a.total_damage.total);

    // Pre-calculate multipliers to avoid division in loop
    const damageMultiplier = totalDamageOverall > 0 ? 100 / totalDamageOverall : 0;
    const healingMultiplier = totalHealingOverall > 0 ? 100 / totalHealingOverall : 0;

    // Use DocumentFragment for batch DOM insertion
    const fragment = document.createDocumentFragment();

    users.forEach((user, index) => {
        if (!userColors[user.id]) {
            userColors[user.id] = getNextColorShades();
        }
        const colors = userColors[user.id];
        const item = document.createElement('li');

        item.className = 'data-item';
        item.dataset.uid = user.id || user.uid; // Store UID for double-click handler
        item.dataset.userName = user.name;
        item.dataset.userProfession = user.profession;

        // Add double-click handler to open skill breakdown
        item.addEventListener('dblclick', () => {
            openSkillBreakdown(user.id || user.uid, user.name, user.profession);
        });

        const damagePercent = user.total_damage.total * damageMultiplier;
        const healingPercent = user.total_healing.total * healingMultiplier;

        // Pre-format numbers once
        const formattedDamageTotal = formatNumber(user.total_damage.total);
        const formattedDPS = formatNumber(user.total_dps);
        const damagePercentStr = damagePercent.toFixed(1);

        const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

        const classIconHtml = getProfessionIconHtml(user.profession);

        let subBarHtml = '';
        if (user.total_healing.total > 0 || user.total_hps > 0) {
            const formattedHealingTotal = formatNumber(user.total_healing.total);
            const formattedHPS = formatNumber(user.total_hps);
            const healingPercentStr = healingPercent.toFixed(1);

            subBarHtml = `
                <div class="sub-bar">
                    <div class="hps-bar-fill" style="width: ${healingPercent}%; background-color: ${colors.hps};"></div>
                    <div class="hps-stats">
                       ${formattedHealingTotal} (${formattedHPS} HPS, ${healingPercentStr}%)
                    </div>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="main-bar">
                <div class="dps-bar-fill" style="width: ${damagePercent}%; background-color: ${colors.dps};"></div>
                <div class="content">
                    <span class="rank">${index + 1}.</span>
                    ${classIconHtml}
                    <span class="name">${displayName}</span>
                    <span class="stats">${formattedDamageTotal} (${formattedDPS} DPS, ${damagePercentStr}%)</span>
                </div>
            </div>
            ${subBarHtml}
        `;
        fragment.appendChild(item);
    });

    // Single DOM update
    columnsContainer.innerHTML = '';
    columnsContainer.appendChild(fragment);
}

function updateAll() {
    const usersArray = Object.values(allUsers).filter((user) => user.total_dps > 0 || user.total_hps > 0);
    renderDataList(usersArray);
}

// Initialize the history window
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the view to show history by default
    currentView = 'history';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();

    // Initialize date range inputs - try to load from localStorage first
    const savedStartDate = localStorage.getItem('historyStartDate');
    const savedEndDate = localStorage.getItem('historyEndDate');

    let endDate, startDate;

    if (savedStartDate && savedEndDate) {
        // Use saved dates
        startDate = new Date(savedStartDate);
        endDate = new Date(savedEndDate);
    } else {
        // Default to last 7 days
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

    // Set the current date range for initial load
    currentDateRange.startDate = startDate.toISOString();
    currentDateRange.endDate = endDate.toISOString();

    // Initialize opacity slider with utility function
    initializeOpacitySlider('historyOpacitySlider', 'historyBackgroundOpacity');

    // Initialize data type filter
    dataTypeFilter.addEventListener('change', (event) => {
        currentDataType = event.target.value;
        renderFightDetailsTable();
    });

    // Initialize enemy filter
    enemyFilter.addEventListener('change', async (event) => {
        currentEnemy = event.target.value;
        // Reload fight data with enemy filter
        if (currentFightId) {
            await reloadFightData(currentFightId, currentEnemy);
        }
    });

    // Load fight history with the initialized date range
    loadFightHistory();

    // Add event listeners for all buttons
    document.getElementById('viewCumulativeButton').addEventListener('click', viewCumulativeStats);
    document.getElementById('viewHistoryButton').addEventListener('click', viewFightHistory);
    document.getElementById('clearHistoryButton').addEventListener('click', clearFightHistory);
    document.getElementById('applyDateRange').addEventListener('click', applyDateRange);
    document.getElementById('resetDateRange').addEventListener('click', resetDateRange);

    // Handle close button
    const closeButton = document.getElementById('closeButton');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.close();
        });
    }

    // Listen for history data updates from main process
    if (window.electronAPI && window.electronAPI.onHistoryDataUpdated) {
        window.electronAPI.onHistoryDataUpdated(() => {
            console.log('History data updated, reloading fight history...');
            loadFightHistory();
        });
    }
});

// Load fight history data
async function loadFightHistory() {
    try {
        console.log('Loading fight history...');

        // Build query string with date range if set
        let queryParams = new URLSearchParams();
        if (currentDateRange.startDate) {
            queryParams.append('startDate', currentDateRange.startDate);
        }
        if (currentDateRange.endDate) {
            queryParams.append('endDate', currentDateRange.endDate);
        }
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

        // Load fight list
        const fightResponse = await fetch(`http://${SERVER_URL}/api/fight/list${queryString}`);
        const fightData = await fightResponse.json();

        if (fightData.code === 0) {
            fightHistory = fightData.data || [];
            console.log('Loaded fight history:', fightHistory);
        }

        // Load cumulative stats
        const cumulativeResponse = await fetch(`http://${SERVER_URL}/api/fight/cumulative${queryString}`);
        const cumulativeData = await cumulativeResponse.json();

        if (cumulativeData.code === 0) {
            cumulativeStats = cumulativeData.data;
            console.log('Loaded cumulative stats:', cumulativeStats);
        }

        // Current fight data not needed in history window

        // Update the current view
        updateHistoryView();

        // Re-render the appropriate view based on currentView
        if (currentView === 'cumulative') {
            renderCumulativeStats();
        } else if (currentView === 'history') {
            renderFightList();
        }
    } catch (error) {
        console.error('Error loading fight history:', error);
    }
}

// Apply date range filter
function applyDateRange() {
    const startDateInput = document.getElementById('startDate').value;
    const endDateInput = document.getElementById('endDate').value;

    if (!startDateInput || !endDateInput) {
        alert('Please select both start and end dates');
        return;
    }

    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);

    if (startDate > endDate) {
        alert('Start date must be before end date');
        return;
    }

    currentDateRange.startDate = startDate.toISOString();
    currentDateRange.endDate = endDate.toISOString();

    // Save to localStorage for persistence
    localStorage.setItem('historyStartDate', currentDateRange.startDate);
    localStorage.setItem('historyEndDate', currentDateRange.endDate);

    console.log('Applying date range:', currentDateRange);
    loadFightHistory();
}

// Reset date range filter
function resetDateRange() {
    // Reset to last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

    currentDateRange.startDate = startDate.toISOString();
    currentDateRange.endDate = endDate.toISOString();

    // Save to localStorage
    localStorage.setItem('historyStartDate', currentDateRange.startDate);
    localStorage.setItem('historyEndDate', currentDateRange.endDate);

    console.log('Resetting date range');
    loadFightHistory();
}

// Current fight functions removed - not needed in history window

// Render cumulative statistics
function renderCumulativeStats() {
    if (!cumulativeStats) {
        cumulativeStatsDiv.innerHTML = `
            <h3>Cumulative Statistics</h3>
            <p>No cumulative data available</p>
        `;
        return;
    }

    const totalFights = fightHistory.length;
    const totalDamage = cumulativeStats.totalDamage || 0;
    const totalHealing = cumulativeStats.totalHealing || 0;
    const totalDuration = cumulativeStats.totalDuration || 0;

    cumulativeStatsDiv.innerHTML = `
        <h3>Cumulative Statistics</h3>
        <div class="stat-item">
            <span class="stat-label">Total Fights:</span>
            <span class="stat-value">${totalFights}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Damage:</span>
            <span class="stat-value">${formatNumber(totalDamage)}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Healing:</span>
            <span class="stat-value">${formatNumber(totalHealing)}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Duration:</span>
            <span class="stat-value">${Math.floor(totalDuration / 1000)}s</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Average Fight Duration:</span>
            <span class="stat-value">${totalFights > 0 ? Math.floor(totalDuration / totalFights / 1000) : 0}s</span>
        </div>
    `;
}

// Render fight list
function renderFightList() {
    if (!fightHistory || fightHistory.length === 0) {
        fightList.innerHTML = '<p>No fight history available in this date range</p>';
        return;
    }

    fightList.innerHTML = '';

    fightHistory.forEach((fight) => {
        const fightItem = document.createElement('div');
        fightItem.className = 'fight-item';
        fightItem.onclick = () => viewFight(fight.id);

        const startTime = new Date(fight.startTime);

        const totalDamage = fight.totalDamage || 0;
        const totalHealing = fight.totalHealing || 0;
        const userCount = fight.userCount || 0;

        fightItem.innerHTML = `
            <div class="fight-item-info">
                <div class="fight-item-id">${startTime.toLocaleString()}</div>
                <div class="fight-item-time">${userCount} active user${userCount !== 1 ? 's' : ''}</div>
            </div>
            <div class="fight-item-stats">
                <div class="fight-item-damage">Damage: ${formatNumber(totalDamage)}</div>
                <div class="fight-item-healing">Healing: ${formatNumber(totalHealing)}</div>
            </div>
        `;

        fightList.appendChild(fightItem);
    });
}

// Helper function to parse stat data (object or string format)
function parseStatData(data) {
    if (typeof data === 'object' && data !== null) {
        return data.total || 0;
    }

    if (typeof data === 'string') {
        try {
            let str = data;
            // Handle @{key=value;...} format
            if (str.startsWith('@{') && str.endsWith('}')) {
                str = str.slice(2, -1)
                    .replace(/(\w+)=/g, '"$1":')
                    .replace(/;/g, ',');
                str = '{' + str + '}';
            }
            const parsed = JSON.parse(str);
            return parsed.total || 0;
        } catch (e) {
            console.warn('Failed to parse stat data:', data, e);
            return 0;
        }
    }

    return 0;
}

// Render fight details table with statistics
function renderFightDetailsTable() {
    if (!allUsers || Object.keys(allUsers).length === 0) {
        fightDetailsTable.innerHTML = '<p>No user data available</p>';
        return;
    }

    const users = Object.values(allUsers);
    const isDamage = currentDataType === 'damage';
    const isHealing = currentDataType === 'healing';
    const isTanking = currentDataType === 'tanking';

    // Calculate totals for percentage
    const totalValue = users.reduce((sum, user) => {
        if (isTanking) {
            return sum + (user.taken_damage || 0);
        } else if (isDamage) {
            return sum + (user.total_damage?.total || 0);
        } else {
            return sum + (user.total_healing?.total || 0);
        }
    }, 0);

    // Sort users based on current sort column and order
    users.sort((a, b) => {
        let aValue, bValue;

        switch (currentSortColumn) {
            case 'name':
                aValue = a.name || '';
                bValue = b.name || '';
                return currentSortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);

            case 'total':
                if (isTanking) {
                    aValue = a.taken_damage || 0;
                    bValue = b.taken_damage || 0;
                } else if (isDamage) {
                    aValue = a.total_damage?.total || 0;
                    bValue = b.total_damage?.total || 0;
                } else {
                    aValue = a.total_healing?.total || 0;
                    bValue = b.total_healing?.total || 0;
                }
                break;

            case 'dps':
                if (isTanking) {
                    // For tanking, we don't have a "DTPS" metric, so use total damage taken
                    aValue = a.taken_damage || 0;
                    bValue = b.taken_damage || 0;
                } else if (isDamage) {
                    aValue = a.total_dps;
                    bValue = b.total_dps;
                } else {
                    aValue = a.total_hps;
                    bValue = b.total_hps;
                }
                break;

            case 'percent':
                if (isTanking) {
                    aValue = a.taken_damage || 0;
                    bValue = b.taken_damage || 0;
                } else if (isDamage) {
                    aValue = a.total_damage?.total || 0;
                    bValue = b.total_damage?.total || 0;
                } else {
                    aValue = a.total_healing?.total || 0;
                    bValue = b.total_healing?.total || 0;
                }
                break;

            case 'crit':
                const aTotalCount = a.total_count?.total || 0;
                const aCritCount = a.total_count?.critical || 0;
                aValue = aTotalCount > 0 ? aCritCount / aTotalCount : 0;
                const bTotalCount = b.total_count?.total || 0;
                const bCritCount = b.total_count?.critical || 0;
                bValue = bTotalCount > 0 ? bCritCount / bTotalCount : 0;
                break;

            case 'lucky':
                const aTotalCount2 = a.total_count?.total || 0;
                const aLuckyCount = a.total_count?.lucky || 0;
                aValue = aTotalCount2 > 0 ? aLuckyCount / aTotalCount2 : 0;
                const bTotalCount2 = b.total_count?.total || 0;
                const bLuckyCount = b.total_count?.lucky || 0;
                bValue = bTotalCount2 > 0 ? bLuckyCount / bTotalCount2 : 0;
                break;

            default: // rank or dps (default)
                if (isTanking) {
                    aValue = a.taken_damage || 0;
                    bValue = b.taken_damage || 0;
                } else if (isDamage) {
                    aValue = a.total_dps;
                    bValue = b.total_dps;
                } else {
                    aValue = a.total_hps;
                    bValue = b.total_hps;
                }
                break;
        }

        if (currentSortOrder === 'asc') {
            return aValue - bValue;
        } else {
            return bValue - aValue;
        }
    });

    // Helper function to get sort class
    const getSortClass = (column) => {
        if (currentSortColumn === column) {
            return currentSortOrder === 'asc' ? 'sortable sorted-asc' : 'sortable sorted-desc';
        }
        return 'sortable';
    };

    // Determine column labels based on data type
    const dpsLabel = isTanking ? 'DTPS' : (isDamage ? 'DPS' : 'HPS');
    const showCritLucky = !isTanking; // Don't show crit/lucky for tanking

    // Create table HTML
    let tableHTML = `
        <table class="stats-table ${isTanking ? 'tanking-table' : ''}">
            <thead>
                <tr class="${isTanking ? 'tanking-header' : ''}">
                    <th class="${getSortClass('rank')}" data-sort="rank">Rank</th>
                    <th class="${getSortClass('name')}" data-sort="name">Name</th>
                    <th class="${getSortClass('total')}" data-sort="total">Total</th>
                    <th class="${getSortClass('dps')}" data-sort="dps">${dpsLabel}</th>
                    <th class="${getSortClass('percent')}" data-sort="percent">%</th>
                    ${showCritLucky ? `<th class="${getSortClass('crit')}" data-sort="crit">Crit %</th>` : ''}
                    ${showCritLucky ? `<th class="${getSortClass('lucky')}" data-sort="lucky">Lucky %</th>` : ''}
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach((user, index) => {
        // Calculate total and dps/hps based on data type
        let total, dpsHps;
        if (isTanking) {
            total = user.taken_damage || 0;
            dpsHps = 0; // No DTPS metric available currently
        } else if (isDamage) {
            total = user.total_damage?.total || 0;
            dpsHps = user.total_dps;
        } else {
            total = user.total_healing?.total || 0;
            dpsHps = user.total_hps;
        }

        const percentage = totalValue > 0 ? ((total / totalValue) * 100).toFixed(1) : '0.0';
        const percentageNum = parseFloat(percentage);

        // Calculate crit and lucky percentages (only for damage/healing)
        const totalCount = user.total_count?.total || 0;
        const critCount = user.total_count?.critical || 0;
        const luckyCount = user.total_count?.lucky || 0;

        const critPercent = totalCount > 0 ? ((critCount / totalCount) * 100).toFixed(1) : '0.0';
        const luckyPercent = totalCount > 0 ? ((luckyCount / totalCount) * 100).toFixed(1) : '0.0';

        // Get or assign color for this user
        if (!userColors[user.id]) {
            userColors[user.id] = getNextColorShades();
        }
        const colors = userColors[user.id];
        // Use a different color scheme for tanking (could use red/orange tones)
        const barColor = isTanking ? 'hsl(0, 70%, 25%)' : (isDamage ? colors.dps : colors.hps);

        // Get profession icon
        const classIconHtml = getProfessionIconHtml(user.profession, 'small');

        const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

        const colspan = showCritLucky ? '7' : '5';
        const dpsHpsDisplay = isTanking ? '-' : formatNumber(dpsHps);

        tableHTML += `
            <tr class="stats-row" data-uid="${user.id}" data-user-name="${user.name.replace(/"/g, '&quot;')}" data-user-profession="${user.profession.replace(/"/g, '&quot;')}">
                <td colspan="${colspan}" style="padding: 0; position: relative;">
                    <div class="stats-row-background" style="width: ${percentageNum}%; background-color: ${barColor};"></div>
                    <div class="stats-row-content ${isTanking ? 'tanking-row' : ''}">
                        <span class="stats-cell rank-cell">${index + 1}</span>
                        <span class="stats-cell name-cell">
                            ${classIconHtml}
                            <span>${displayName}</span>
                        </span>
                        <span class="stats-cell number-cell">${formatNumber(total)}</span>
                        <span class="stats-cell number-cell">${dpsHpsDisplay}</span>
                        <span class="stats-cell number-cell">${percentage}%</span>
                        ${showCritLucky ? `<span class="stats-cell number-cell">${critPercent}%</span>` : ''}
                        ${showCritLucky ? `<span class="stats-cell number-cell">${luckyPercent}%</span>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    fightDetailsTable.innerHTML = tableHTML;

    // Add click handlers to table headers for sorting
    const headers = fightDetailsTable.querySelectorAll('th[data-sort]');
    headers.forEach((header) => {
        header.addEventListener('click', () => {
            const sortColumn = header.getAttribute('data-sort');

            // Toggle sort order if clicking the same column
            if (currentSortColumn === sortColumn) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, default to descending (except for name)
                currentSortColumn = sortColumn;
                currentSortOrder = sortColumn === 'name' ? 'asc' : 'desc';
            }

            renderFightDetailsTable();
        });
    });

    // Add double-click handlers to table rows for skill breakdown
    const rows = fightDetailsTable.querySelectorAll('.stats-row[data-uid]');
    rows.forEach((row) => {
        row.addEventListener('dblclick', () => {
            const uid = row.getAttribute('data-uid');
            const userName = row.getAttribute('data-user-name');
            const userProfession = row.getAttribute('data-user-profession');
            openSkillBreakdown(uid, userName, userProfession);
        });
    });
}

// View a specific fight
async function viewFight(fightId) {
    // Store current fight ID and reset enemy filter
    currentFightId = fightId;
    currentEnemy = 'all';

    // Hide history container and show fight details table
    historyContainer.classList.add('hidden');
    columnsContainer.classList.add('hidden');
    fightDetailsContainer.classList.remove('hidden');

    // Load enemies for this fight and populate dropdown
    await loadFightEnemies(fightId);

    // Load the fight data
    await reloadFightData(fightId, 'all');
}

// Reload fight data with optional enemy filter
async function reloadFightData(fightId, enemyFilter = 'all') {
    try {
        console.log(`Loading fight data for: ${fightId}, enemy: ${enemyFilter}`);

        // Build URL with enemy parameter if not "all"
        let url = `http://${SERVER_URL}/api/fight/${fightId}`;
        if (enemyFilter && enemyFilter !== 'all') {
            url += `?enemy=${encodeURIComponent(enemyFilter)}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        console.log('Fight data response:', data);

        if (data.code === 0) {
            // Transform historical user data to match current format
            allUsers = {};
            userColors = {};

            if (data.data.userStats) {
                console.log('User stats found:', data.data.userStats);

                // Use optimized parsing function
                for (const [uid, userData] of Object.entries(data.data.userStats)) {
                    const totalDamage = parseStatData(userData.total_damage);
                    const totalHealing = parseStatData(userData.total_healing);
                    const totalCount = parseStatData(userData.total_count);

                    allUsers[uid] = {
                        id: uid,
                        uid: uid,
                        name: userData.name || 'Unknown',
                        profession: userData.profession || 'Unknown',
                        total_damage: userData.total_damage || { total: totalDamage },
                        total_healing: userData.total_healing || { total: totalHealing },
                        total_count: userData.total_count || { total: totalCount, critical: 0, lucky: 0 },
                        total_dps: userData.total_dps || 0,
                        total_hps: userData.total_hps || 0,
                        hp: userData.hp || 0,
                        max_hp: userData.max_hp || 0,
                        fightPoint: userData.fightPoint || 0,
                        dead_count: userData.dead_count || 0,
                        taken_damage: userData.taken_damage || 0,
                    };
                }

                console.log(`Loaded fight ${fightId} with ${Object.keys(allUsers).length} users (enemy: ${enemyFilter}):`, allUsers);

                renderFightDetailsTable();
            } else {
                console.log('No user stats found in fight data');
                allUsers = {};
                updateAll();
            }
        } else {
            console.error('Failed to load fight data:', data.msg);
            alert('Failed to load fight data: ' + data.msg);
        }
    } catch (error) {
        console.error('Error loading fight:', error);
        alert('Error loading fight: ' + error.message);
    }
}

// Load enemies for a specific fight
async function loadFightEnemies(fightId) {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/${fightId}/enemies`);
        const data = await response.json();

        if (data.code === 0) {
            // Reset enemy filter to "all"
            currentEnemy = 'all';

            // Populate enemy dropdown
            enemyFilter.innerHTML = '<option value="all">All Enemies</option>';

            (data.data.enemies || []).forEach((enemyName) => {
                const option = document.createElement('option');
                option.value = enemyName;
                option.textContent = enemyName;
                enemyFilter.appendChild(option);
            });

            console.log(`Loaded ${(data.data.enemies || []).length} enemies for fight ${fightId}`);
        } else {
            console.warn('Failed to load enemies:', data.msg);
            // Reset to default if failed
            enemyFilter.innerHTML = '<option value="all">All Enemies</option>';
        }
    } catch (error) {
        console.error('Error loading fight enemies:', error);
        // Reset to default if error
        enemyFilter.innerHTML = '<option value="all">All Enemies</option>';
    }
}

// View functions
function viewCumulativeStats() {
    currentView = 'cumulative';
    columnsContainer.classList.add('hidden');
    fightDetailsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    renderCumulativeStats();
}

function viewFightHistory() {
    currentView = 'history';
    columnsContainer.classList.add('hidden');
    fightDetailsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    renderFightList();
}

// Update history view
function updateHistoryView() {
    // Hide all views
    cumulativeView.classList.add('hidden');
    fightListView.classList.add('hidden');

    // Remove active class from all buttons
    document.getElementById('viewCumulativeButton').classList.remove('active');
    document.getElementById('viewHistoryButton').classList.remove('active');

    // Show current view and set active button
    if (currentView === 'cumulative') {
        cumulativeView.classList.remove('hidden');
        document.getElementById('viewCumulativeButton').classList.add('active');
    } else if (currentView === 'history') {
        fightListView.classList.remove('hidden');
        document.getElementById('viewHistoryButton').classList.add('active');
    }
}

// Clear fight history (disabled - logs are permanent)
async function clearFightHistory() {
    alert('Fight history is now based on permanent log files and cannot be cleared from this interface. To remove logs, manually delete the log directories.');
}

