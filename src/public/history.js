// Fight History Window JavaScript
import {
    SERVER_URL,
    getNextColorShades,
    formatNumber,
    getProfessionIconHtml,
    initializeOpacitySlider,
    formatDateForInput,
    renderDataList,
    parseStatData,
    settingsService,
} from './utils.js';

// State variables
let currentView = 'history'; // 'cumulative', 'history'
let fightHistory = [];
let cumulativeStats = null;
let allUsers = {};
let userColors = {};
let currentDateRange = { startDate: null, endDate: null };
let currentFightId = null; // Track current fight being viewed
let currentFightDuration = 0; // Track current fight duration in milliseconds
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
const fightDurationDisplay = document.getElementById('fightDurationDisplay');
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
            enemy: currentEnemy !== 'all' ? currentEnemy : null,
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

        if (currentEnemy && currentEnemy !== 'all') {
            params.append('enemy', currentEnemy);
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

function updateAll() {
    const usersArray = Object.values(allUsers).filter((user) => user.total_dps > 0 || user.total_hps > 0);
    renderDataList(usersArray, userColors, columnsContainer, {
        onUserDoubleClick: openSkillBreakdown,
        showProfession: false, // Don't show profession in history view
    });
}

// Initialize the history window
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the view to show history by default
    currentView = 'history';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();

    // Initialize date range inputs - always reset to default on app open
    // This ensures the end date is always in the future when the app starts
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

    // Set the current date range for initial load
    currentDateRange.startDate = startDate.toISOString();
    currentDateRange.endDate = endDate.toISOString();

    // Save the initial date range to settings
    await settingsService.updateSettings({
        historyStartDate: currentDateRange.startDate,
        historyEndDate: currentDateRange.endDate,
    });

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
async function applyDateRange() {
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

    // Save to settings for persistence
    await settingsService.updateSettings({
        historyStartDate: currentDateRange.startDate,
        historyEndDate: currentDateRange.endDate,
    });

    console.log('Applying date range:', currentDateRange);
    loadFightHistory();
}

// Reset date range filter
async function resetDateRange() {
    // Reset to last 7 days, with end date 1 day in the future
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

    currentDateRange.startDate = startDate.toISOString();
    currentDateRange.endDate = endDate.toISOString();

    // Save to settings
    await settingsService.updateSettings({
        historyStartDate: currentDateRange.startDate,
        historyEndDate: currentDateRange.endDate,
    });

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

// Render fight list with boss headers
function renderFightList() {
    if (!fightHistory || fightHistory.length === 0) {
        fightList.innerHTML = '<p>No fight history available in this date range</p>';
        return;
    }

    fightList.innerHTML = '';

    // Group fights by boss
    let lastBossName = null;

    fightHistory.forEach((fight) => {
        const currentBossName = fight.bossName || 'Unknown';

        // Add boss header if the boss changed
        if (currentBossName !== lastBossName) {
            const bossHeader = document.createElement('div');
            bossHeader.className = 'boss-header';

            // Build header text with dungeon name if available
            let headerText = currentBossName;
            if (fight.dungeonName) {
                headerText = `${fight.dungeonName} - ${currentBossName}`;
            }

            bossHeader.innerHTML = `<h3>${headerText}</h3>`;
            fightList.appendChild(bossHeader);
            lastBossName = currentBossName;
        }

        const fightItem = document.createElement('div');
        fightItem.className = 'fight-item';
        fightItem.dataset.fightId = fight.id;
        fightItem.onclick = () => viewFight(fight.id);

        // Add right-click context menu
        fightItem.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            showContextMenu(event, fight.id);
        });

        const startTime = new Date(fight.startTime);
        const endTime = new Date(fight.endTime);

        const totalDamage = fight.totalDamage || 0;
        const totalHealing = fight.totalHealing || 0;
        const userCount = fight.userCount || 0;
        const duration = fight.duration || 0; // duration in milliseconds

        // Format duration as MM:SS
        const durationSeconds = Math.floor(duration / 1000);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        fightItem.innerHTML = `
            <div class="fight-item-info">
                <div class="fight-item-id">${startTime.toLocaleString()} - ${endTime.toLocaleString()}</div>
                <div class="fight-item-time">${userCount} active user${userCount !== 1 ? 's' : ''} | Duration: ${durationStr}</div>
            </div>
            <div class="fight-item-stats">
                <div class="fight-item-damage">Damage: ${formatNumber(totalDamage)}</div>
                <div class="fight-item-healing">Healing: ${formatNumber(totalHealing)}</div>
            </div>
        `;

        fightList.appendChild(fightItem);
    });
}

// Update fight duration display
function updateFightDurationDisplay() {
    if (!fightDurationDisplay) return;

    // Format duration as MM:SS
    const durationSeconds = Math.floor(currentFightDuration / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    fightDurationDisplay.textContent = `Duration: ${durationStr}`;
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

    // Pre-calculate and cache rates for each user to avoid redundant calculations
    users.forEach((user) => {
        const totalCount = user.total_count?.total || 0;
        if (!user._cachedRates || user._cachedRatesCount !== totalCount) {
            const critCount = user.total_count?.critical || 0;
            const luckyCount = user.total_count?.lucky || 0;
            user._cachedRates = {
                crit: totalCount > 0 ? critCount / totalCount : 0,
                lucky: totalCount > 0 ? luckyCount / totalCount : 0,
                critPercent: totalCount > 0 ? ((critCount / totalCount) * 100).toFixed(1) : '0.0',
                luckyPercent: totalCount > 0 ? ((luckyCount / totalCount) * 100).toFixed(1) : '0.0',
            };
            user._cachedRatesCount = totalCount;
        }
    });

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
                // Use cached rates instead of recalculating
                aValue = a._cachedRates?.crit || 0;
                bValue = b._cachedRates?.crit || 0;
                break;

            case 'lucky':
                // Use cached rates instead of recalculating
                aValue = a._cachedRates?.lucky || 0;
                bValue = b._cachedRates?.lucky || 0;
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
    const dpsLabel = isTanking ? 'DTPS' : isDamage ? 'DPS' : 'HPS';
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

        // Use cached crit and lucky percentages (only for damage/healing)
        const critPercent = user._cachedRates?.critPercent || '0.0';
        const luckyPercent = user._cachedRates?.luckyPercent || '0.0';

        // Get or assign color for this user
        if (!userColors[user.id]) {
            userColors[user.id] = getNextColorShades();
        }
        const colors = userColors[user.id];
        // Use a different color scheme for tanking (could use red/orange tones)
        const barColor = isTanking ? 'hsl(0, 70%, 25%)' : isDamage ? colors.dps : colors.hps;

        // Get profession icon
        const classIconHtml = getProfessionIconHtml(user.profession, 'small');

        // Include profession in display name
        const professionText = user.profession && user.profession !== 'Unknown' ? ` - ${user.profession}` : '';
        const displayName = user.fightPoint
            ? `${user.name}${professionText} (${user.fightPoint})`
            : `${user.name}${professionText}`;

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

    // Load death events and update button
    await loadDeathEvents();

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
            // Store fight duration
            currentFightDuration = data.data.duration || 0;

            // Update the duration display in the controls
            updateFightDurationDisplay();

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

                console.log(
                    `Loaded fight ${fightId} with ${Object.keys(allUsers).length} users (enemy: ${enemyFilter}):`,
                    allUsers
                );

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

// Context menu functionality
let contextMenuFightId = null;
const contextMenu = document.getElementById('fightContextMenu');
const deleteFightOption = document.getElementById('deleteFightOption');

function showContextMenu(event, fightId) {
    contextMenuFightId = fightId;

    // Position the context menu at the cursor
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
    contextMenuFightId = null;
}

// Delete fight function
async function deleteFight(fightId) {
    const fightToDelete = fightHistory.find(f => f.id === fightId);
    if (!fightToDelete) {
        alert('Fight not found');
        return;
    }

    const startTime = new Date(fightToDelete.startTime).toLocaleString();
    const confirmMessage = `Are you sure you want to delete this fight?\n\nFight: ${startTime}\nUsers: ${fightToDelete.userCount}\n\nThis will permanently delete the fight logs and cannot be undone.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/${fightId}`, {
            method: 'DELETE',
        });

        const data = await response.json();

        if (data.code === 0) {
            console.log(`Successfully deleted fight ${fightId}`);

            // If the deleted fight is currently being viewed, go back to history
            if (currentFightId === fightId) {
                currentFightId = null;
                viewFightHistory();
            }

            // Reload fight history to update the list
            await loadFightHistory();
        } else {
            alert(`Failed to delete fight: ${data.msg}`);
        }
    } catch (error) {
        console.error('Error deleting fight:', error);
        alert(`Error deleting fight: ${error.message}`);
    }
}

// Event listeners for context menu
deleteFightOption.addEventListener('click', () => {
    if (contextMenuFightId) {
        deleteFight(contextMenuFightId);
    }
    hideContextMenu();
});

// Hide context menu when clicking outside
document.addEventListener('click', (event) => {
    if (!contextMenu.contains(event.target)) {
        hideContextMenu();
    }
});

// Hide context menu on escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        hideContextMenu();
    }
});

// Death Report Functionality
const deathReportButton = document.getElementById('deathReportButton');
const deathCountSpan = document.getElementById('deathCount');

// Load death events for current fight
async function loadDeathEvents() {
    if (!currentFightId) return;

    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/${currentFightId}/deaths`);
        const data = await response.json();

        if (data.code === 0) {
            const deathEvents = data.data || [];
            deathCountSpan.textContent = deathEvents.length;

            // Enable/disable button based on death count
            if (deathEvents.length > 0) {
                deathReportButton.disabled = false;
            } else {
                deathReportButton.disabled = true;
            }

            return deathEvents;
        }
    } catch (error) {
        console.error('Failed to load death events:', error);
        return [];
    }
}

// Open death report window
function openDeathReport() {
    if (!currentFightId) {
        console.error('No fight ID available');
        return;
    }

    // Use Electron IPC to open window
    if (window.electronAPI && window.electronAPI.openDeathsWindow) {
        window.electronAPI.openDeathsWindow({
            fightId: currentFightId,
        });
    } else {
        // Fallback for development environment
        const params = new URLSearchParams({
            fightId: currentFightId,
        });
        window.open(`deaths.html?${params.toString()}`, '_blank', 'width=900,height=700');
    }
}

// Event listener
deathReportButton.addEventListener('click', openDeathReport);
