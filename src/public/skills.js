import { SERVER_URL, formatNumber, getChartColors, initializeOpacitySlider } from './utils.js';

let userData = null;
let skillsData = null;
let timeSeriesData = null;
let chart = null;
let currentDataType = 'damage'; // 'damage' or 'healing'
let currentEnemy = 'all'; // Current selected enemy filter

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get('uid');
const fightId = urlParams.get('fightId');
const userName = urlParams.get('name');
const userProfession = urlParams.get('profession');
const initialEnemy = urlParams.get('enemy'); // Enemy filter from fight history

// DOM elements
const columnsContainer = document.getElementById('columnsContainer');
const dataTypeSelector = document.getElementById('dataTypeSelector');
const enemySelector = document.getElementById('enemySelector');

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Set initial enemy filter from URL parameter
    if (initialEnemy) {
        currentEnemy = initialEnemy;
    }

    initializeOpacitySlider('skillsOpacitySlider', 'skillsBackgroundOpacity', '--main-bg-opacity', 0.05);
    initializeDataTypeSelector();
    initializeEnemySelector();
    await loadSkillData();
    await loadTimeSeriesData();
    populateEnemyDropdown();
    renderChart();
    renderSkillBreakdown();

    // Set the enemy selector to the initial value if provided
    if (initialEnemy && enemySelector) {
        enemySelector.value = initialEnemy;
    }
});

// Initialize data type selector
function initializeDataTypeSelector() {
    dataTypeSelector.addEventListener('change', (e) => {
        currentDataType = e.target.value;
        renderChart();
        renderSkillBreakdown();
    });
}

// Initialize enemy selector
function initializeEnemySelector() {
    enemySelector.addEventListener('change', async (e) => {
        currentEnemy = e.target.value;
        await loadSkillData(); // Reload skills with enemy filter
        await loadTimeSeriesData();
        renderChart();
        renderSkillBreakdown();
    });
}

// Load skill data from API
async function loadSkillData() {
    try {
        let endpoint;
        if (fightId) {
            // Historical data
            const timestamp = fightId.replace('fight_', '');
            endpoint = `http://${SERVER_URL}/api/history/${timestamp}/skill/${uid}`;

            // Add enemy filter if not "all"
            if (currentEnemy && currentEnemy !== 'all') {
                endpoint += `?enemy=${encodeURIComponent(currentEnemy)}`;
            }
        } else {
            // Current/live data
            endpoint = `http://${SERVER_URL}/api/skill/${uid}`;

            // Add enemy filter if not "all"
            if (currentEnemy && currentEnemy !== 'all') {
                endpoint += `?enemy=${encodeURIComponent(currentEnemy)}`;
            }
        }

        const response = await fetch(endpoint);
        const data = await response.json();

        if (data.code === 0) {
            skillsData = data.data.skills || {};
            userData = {
                name: userName || data.data.name || 'Unknown',
                profession: userProfession || data.data.profession || 'Unknown',
                uid: uid,
            };
        } else {
            console.error('Failed to load skill data:', data.message);
            skillsData = {};
            userData = {
                name: userName || 'Unknown',
                profession: userProfession || 'Unknown',
                uid: uid,
            };
        }
    } catch (error) {
        console.error('Error loading skill data:', error);
        skillsData = {};
        userData = {
            name: userName || 'Unknown',
            profession: userProfession || 'Unknown',
            uid: uid,
        };
    }
}

// Load time-series data from fight.log
async function loadTimeSeriesData() {
    // Only load for historical fights
    if (!fightId) {
        timeSeriesData = null;
        return;
    }

    try {
        const timestamp = fightId.replace('fight_', '');
        let endpoint = `http://${SERVER_URL}/api/history/${timestamp}/timeseries/${uid}`;

        // Add enemy filter if not "all"
        if (currentEnemy && currentEnemy !== 'all') {
            endpoint += `?enemy=${encodeURIComponent(currentEnemy)}`;
        }

        const response = await fetch(endpoint);
        const data = await response.json();

        if (data.code === 0) {
            timeSeriesData = data.data;
            console.log('Loaded time-series data:', timeSeriesData);
        } else {
            console.error('Failed to load time-series data:', data.message);
            timeSeriesData = null;
        }
    } catch (error) {
        console.error('Error loading time-series data:', error);
        timeSeriesData = null;
    }
}

// Populate enemy dropdown with available enemies
function populateEnemyDropdown() {
    if (!timeSeriesData || !timeSeriesData.enemies || timeSeriesData.enemies.length === 0) {
        // No enemies available, keep default "All Enemies" option
        return;
    }

    // Clear existing options except "All Enemies"
    enemySelector.innerHTML = '<option value="all">All Enemies</option>';

    // Add each enemy as an option
    timeSeriesData.enemies.forEach((enemy) => {
        const option = document.createElement('option');
        option.value = enemy;
        option.textContent = enemy;
        enemySelector.appendChild(option);
    });
}

// Render the skill breakdown
function renderSkillBreakdown() {
    // Update title
    const title = document.getElementById('skillsTitle');
    const typeLabel = currentDataType === 'damage' ? 'Damage' : 'Healing';

    // Add enemy filter notice if a specific enemy is selected
    if (currentEnemy && currentEnemy !== 'all') {
        title.textContent = `${userData.name} - ${typeLabel} (Filtered: ${currentEnemy})`;
    } else {
        title.textContent = `${userData.name} - ${typeLabel}`;
    }

    if (!skillsData || Object.keys(skillsData).length === 0) {
        columnsContainer.innerHTML = '<p class="no-data">No skill data available</p>';
        return;
    }

    // Convert skills object to array, filter by type, and sort by total damage
    const skillsArray = Object.entries(skillsData)
        .map(([skillId, skill]) => ({
            id: skillId,
            ...skill,
        }))
        .filter((skill) => {
            if (currentDataType === 'damage') {
                return skill.type === '伤害';
            } else {
                return skill.type === '治疗';
            }
        })
        .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

    if (skillsArray.length === 0) {
        columnsContainer.innerHTML = `<p class="no-data">No ${currentDataType} skills found</p>`;
        return;
    }

    // Calculate total damage for percentages
    const totalDamage = skillsArray.reduce((sum, skill) => sum + (skill.totalDamage || 0), 0);

    // Pre-calculate multiplier
    const damageMultiplier = totalDamage > 0 ? 100 / totalDamage : 0;

    // Use DocumentFragment for batch DOM insertion
    const fragment = document.createDocumentFragment();

    skillsArray.forEach((skill, index) => {
        const item = document.createElement('li');
        item.className = 'data-item skill-item';

        const damagePercent = skill.totalDamage * damageMultiplier;
        const avgHit = skill.totalCount > 0 ? Math.round(skill.totalDamage / skill.totalCount) : 0;
        const critRate = ((skill.critRate || 0) * 100).toFixed(1);
        const luckyRate = ((skill.luckyRate || 0) * 100).toFixed(1);

        // Format numbers
        const formattedDamage = formatNumber(skill.totalDamage || 0);
        const formattedAvg = formatNumber(avgHit);
        const damagePercentStr = damagePercent.toFixed(1);

        // Determine bar color based on damage type
        const barColor = skill.type === '治疗' ? 'hsl(180, 90%, 20%)' : 'hsl(0, 90%, 30%)';

        item.innerHTML = `
            <div class="main-bar">
                <div class="dps-bar-fill" style="width: ${damagePercent}%; background-color: ${barColor};"></div>
                <div class="content">
                    <span class="rank">${index + 1}.</span>
                    <span class="skill-element">${skill.elementype || ''}</span>
                    <span class="name">${skill.displayName || skill.id}</span>
                    <span class="stats">${formattedDamage} (${damagePercentStr}%)</span>
                </div>
            </div>
            <div class="sub-bar">
                <div class="skill-details">
                    <span>Uses: ${skill.totalCount || 0}</span>
                    <span>Avg: ${formattedAvg}</span>
                    <span>Crit: ${critRate}%</span>
                    <span>Lucky: ${luckyRate}%</span>
                </div>
            </div>
        `;

        fragment.appendChild(item);
    });

    // Single DOM update
    columnsContainer.innerHTML = '';
    columnsContainer.appendChild(fragment);
}

// Render chart - Line graph showing cumulative damage/healing over time
function renderChart() {
    const canvas = document.getElementById('skillsChart');
    const ctx = canvas.getContext('2d');

    if (!skillsData || Object.keys(skillsData).length === 0) {
        // Clear chart if no data
        if (chart) {
            chart.destroy();
            chart = null;
        }
        return;
    }

    // Filter skills by type and get sorted array
    const skillsArray = Object.entries(skillsData)
        .map(([skillId, skill]) => ({
            id: skillId,
            ...skill,
        }))
        .filter((skill) => {
            if (currentDataType === 'damage') {
                return skill.type === '伤害';
            } else {
                return skill.type === '治疗';
            }
        })
        .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

    if (skillsArray.length === 0) {
        if (chart) {
            chart.destroy();
            chart = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999';
        ctx.font = '14px Roboto Condensed';
        ctx.textAlign = 'center';
        ctx.fillText(`No ${currentDataType} skills found`, canvas.width / 2, canvas.height / 2);
        return;
    }

    // Check if we have real time-series data
    if (!timeSeriesData || !timeSeriesData[currentDataType] || timeSeriesData[currentDataType].length === 0) {
        // No time-series data available
        if (chart) {
            chart.destroy();
            chart = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999';
        ctx.font = '14px Roboto Condensed';
        ctx.textAlign = 'center';
        ctx.fillText('Time-series data not available for this fight', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Process real time-series data (already bucketed by the API)
    const events = timeSeriesData[currentDataType];
    const timeLabels = [];
    const dataValues = [];

    // Extract time and value from pre-bucketed data
    const startTime = events[0].time;
    for (const event of events) {
        const timeOffset = (event.time - startTime) / 1000; // Convert to seconds
        timeLabels.push(`${Math.round(timeOffset)}s`);
        dataValues.push(event.value);
    }

    // Determine color based on type
    const lineColor = currentDataType === 'damage' ? 'rgba(255, 107, 107, 1)' : 'rgba(78, 205, 196, 1)';
    const fillColor =
        currentDataType === 'damage' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(78, 205, 196, 0.2)';

    // Destroy existing chart
    if (chart) {
        chart.destroy();
    }

    // Create new line chart
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: currentDataType === 'damage' ? 'DPS (Damage Per Second)' : 'HPS (Healing Per Second)',
                    data: dataValues,
                    borderColor: lineColor,
                    backgroundColor: fillColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4, // Smooth curve
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#aaa',
                        font: {
                            family: 'Roboto Condensed',
                            size: 12,
                        },
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${formatNumber(context.parsed.y)}`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aaa',
                        callback: function (value) {
                            return formatNumber(value);
                        },
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    title: {
                        display: true,
                        text: currentDataType === 'damage' ? 'Damage Per Second' : 'Healing Per Second',
                        color: '#aaa',
                        font: {
                            family: 'Roboto Condensed',
                            size: 11,
                        },
                    },
                },
                x: {
                    ticks: {
                        color: '#aaa',
                        maxRotation: 0,
                        minRotation: 0,
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    title: {
                        display: true,
                        text: 'Time (seconds)',
                        color: '#aaa',
                        font: {
                            family: 'Roboto Condensed',
                            size: 11,
                        },
                    },
                },
            },
        },
    });
}
