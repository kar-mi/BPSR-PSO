// Death Report Window JavaScript
import { SERVER_URL, formatNumber, initializeOpacitySlider, initializeFontSize, setupFontSizeListener } from './utils.js';

// State variables
let fightId = null;
let skillNamesMap = {};

// DOM elements
const deathReportContent = document.getElementById('deathReportContent');
const deathsTitle = document.getElementById('deathsTitle');

// Initialize opacity slider
initializeOpacitySlider('deathsOpacitySlider', 'deaths-window');

// Get window parameters from URL or Electron API
function getWindowParams() {
    // Try to get parameters from Electron API first
    if (window.electronAPI && window.electronAPI.getWindowParams) {
        return window.electronAPI.getWindowParams();
    }

    // Fallback to URL parameters for development
    const urlParams = new URLSearchParams(window.location.search);
    return {
        fightId: urlParams.get('fightId'),
    };
}

// Load skill names
async function loadSkillNames() {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/skill-names`);
        const data = await response.json();
        if (data.code === 0) {
            skillNamesMap = data.data;
            console.log('Loaded skill names:', Object.keys(skillNamesMap).length);
        }
    } catch (error) {
        console.error('Failed to load skill names:', error);
    }
}

// Load death events for the fight
async function loadDeathEvents(fightId) {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/${fightId}/deaths`);
        const data = await response.json();

        if (data.code === 0) {
            return data.data || [];
        }
        return [];
    } catch (error) {
        console.error('Failed to load death events:', error);
        return [];
    }
}

// Render death report
function renderDeathReport(deathEvents) {
    if (!deathEvents || deathEvents.length === 0) {
        deathReportContent.innerHTML = '<div class="no-deaths-message">No player deaths in this fight</div>';
        return;
    }

    let html = '';

    for (const deathEvent of deathEvents) {
        const deathTime = new Date(deathEvent.timestamp);
        const timeStr = deathTime.toLocaleTimeString();

        html += `
            <div class="death-event">
                <div class="death-event-header">
                    <div>
                        <div class="death-event-victim">${deathEvent.playerName}</div>
                        <div class="death-event-killer">Killed by: ${deathEvent.killerName}</div>
                    </div>
                    <div class="death-event-time">${timeStr}</div>
                </div>
                <div class="damage-events">
                    <h4 style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 8px;">Last 5 Damage Events</h4>
                    ${renderDamageEventsTable(deathEvent.recentDamage)}
                </div>
            </div>
        `;
    }

    deathReportContent.innerHTML = html;
}

// Render damage events table
function renderDamageEventsTable(damageEvents) {
    if (!damageEvents || damageEvents.length === 0) {
        return '<p style="color: rgba(255,255,255,0.5); font-size: 12px;">No damage events recorded</p>';
    }

    let html = `
        <table class="damage-events-table">
            <thead>
                <tr>
                    <th>Source</th>
                    <th>Skill</th>
                    <th style="text-align: right;">Damage</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const event of damageEvents) {
        const skillName = skillNamesMap[event.skillId] || `Skill ${event.skillId}`;
        const attackerDisplay = event.attackerAttrId
            ? `${event.attackerName}[${event.attackerAttrId}]`
            : event.attackerName;

        html += `
            <tr>
                <td class="damage-source">${attackerDisplay}</td>
                <td class="skill-name">${skillName}</td>
                <td class="damage-value">${formatNumber(event.damage)}</td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
    `;

    return html;
}

// Initialize the window
async function initialize() {
    // Initialize font size
    initializeFontSize();

    // Set up font size listener
    setupFontSizeListener();

    const params = getWindowParams();
    fightId = params.fightId;

    if (!fightId) {
        deathReportContent.innerHTML = '<div class="no-deaths-message">No fight ID provided</div>';
        return;
    }

    // Update title with fight ID
    deathsTitle.textContent = `Death Report - Fight ${fightId.replace('fight_', '')}`;

    // Show loading message
    deathReportContent.innerHTML = '<div class="no-deaths-message">Loading death events...</div>';

    // Load skill names first
    await loadSkillNames();

    // Load and render death events
    const deathEvents = await loadDeathEvents(fightId);
    renderDeathReport(deathEvents);
}

// Start initialization
initialize();
