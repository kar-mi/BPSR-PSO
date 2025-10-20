// Fight History Window JavaScript
const SERVER_URL = 'localhost:8990';

// Color system (same as main script)
const colorHues = [
    210, // Blue
    30, // Orange
    270, // Purple
    150, // Teal
    330, // Magenta
    60, // Yellow
    180, // Cyan
    0, // Red
    240, // Indigo
];

let colorIndex = 0;

function getNextColorShades() {
    const h = colorHues[colorIndex];
    colorIndex = (colorIndex + 1) % colorHues.length;
    const s = 90;
    const l_dps = 30;
    const l_hps = 20;

    const dpsColor = `hsl(${h}, ${s}%, ${l_dps}%)`;
    const hpsColor = `hsl(${h}, ${s}%, ${l_hps}%)`;
    return { dps: dpsColor, hps: hpsColor };
}

// State variables
let currentView = 'history'; // 'cumulative', 'history'
let fightHistory = [];
let cumulativeStats = null;
let allUsers = {};
let userColors = {};
let currentDateRange = { startDate: null, endDate: null };

// DOM elements
const columnsContainer = document.getElementById('columnsContainer');
const historyContainer = document.getElementById('historyContainer');
const cumulativeView = document.getElementById('cumulativeView');
const fightListView = document.getElementById('fightListView');
const cumulativeStatsDiv = document.getElementById('cumulativeStats');
const fightList = document.getElementById('fightList');

// Utility function for number formatting
function formatNumber(num) {
    if (isNaN(num)) return 'NaN';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
}

function renderDataList(users) {
    // Early exit if no users
    if (users.length === 0) {
        columnsContainer.innerHTML = '';
        return;
    }

    const totalDamageOverall = users.reduce((sum, user) => sum + user.total_damage.total, 0);
    const totalHealingOverall = users.reduce((sum, user) => sum + user.total_healing.total, 0);

    users.sort((a, b) => b.total_dps - a.total_dps);

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
        const damagePercent = user.total_damage.total * damageMultiplier;
        const healingPercent = user.total_healing.total * healingMultiplier;

        // Pre-format numbers once
        const formattedDamageTotal = formatNumber(user.total_damage.total);
        const formattedDPS = formatNumber(user.total_dps);
        const damagePercentStr = damagePercent.toFixed(1);

        const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

        let classIconHtml = '';
        const professionString = user.profession ? user.profession.trim() : '';
        if (professionString) {
            const mainProfession = professionString.split('(')[0].trim();
            const iconFileName = mainProfession.toLowerCase().replace(/ /g, '_') + '.png';
            classIconHtml = `<img src="assets/${iconFileName}" class="class-icon" alt="${mainProfession}" onerror="this.style.display='none'">`;
        }

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

    // Initialize date range inputs to default (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

    // Initialize opacity slider
    const opacitySlider = document.getElementById('historyOpacitySlider');
    const savedOpacity = localStorage.getItem('historyBackgroundOpacity');

    if (savedOpacity !== null) {
        opacitySlider.value = savedOpacity;
        document.documentElement.style.setProperty('--main-bg-opacity', savedOpacity);
    } else {
        document.documentElement.style.setProperty('--main-bg-opacity', opacitySlider.value);
    }

    opacitySlider.addEventListener('input', (event) => {
        const newOpacity = event.target.value;
        document.documentElement.style.setProperty('--main-bg-opacity', newOpacity);
        localStorage.setItem('historyBackgroundOpacity', newOpacity);
    });

    loadFightHistory();

    // Handle close button
    const closeButton = document.getElementById('closeButton');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.close();
        });
    }
});

// Format date for datetime-local input
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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

    console.log('Applying date range:', currentDateRange);
    loadFightHistory();
}

// Reset date range filter
function resetDateRange() {
    currentDateRange.startDate = null;
    currentDateRange.endDate = null;

    // Reset to last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    document.getElementById('endDate').value = formatDateForInput(endDate);
    document.getElementById('startDate').value = formatDateForInput(startDate);

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

// View a specific fight
async function viewFight(fightId) {
    try {
        console.log(`Loading fight data for: ${fightId}`);
        const response = await fetch(`http://${SERVER_URL}/api/fight/${fightId}`);
        const data = await response.json();

        console.log('Fight data response:', data);

        if (data.code === 0) {
            // Hide history container and show damage meter
            historyContainer.classList.add('hidden');
            columnsContainer.classList.remove('hidden');

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
                        total_damage: { total: totalDamage },
                        total_healing: { total: totalHealing },
                        total_count: { total: totalCount },
                        total_dps: userData.total_dps || 0,
                        total_hps: userData.total_hps || 0,
                        hp: userData.hp || 0,
                        max_hp: userData.max_hp || 0,
                        fightPoint: userData.fightPoint || 0,
                        dead_count: userData.dead_count || 0,
                        taken_damage: userData.taken_damage || 0,
                    };
                }

                console.log(`Loaded fight ${fightId} with ${Object.keys(allUsers).length} users:`, allUsers);
                updateAll();
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

// View functions
function viewCumulativeStats() {
    currentView = 'cumulative';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    renderCumulativeStats();
}

function viewFightHistory() {
    currentView = 'history';
    columnsContainer.classList.add('hidden');
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

