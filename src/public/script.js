import { SERVER_URL, getNextColorShades, formatNumber, getProfessionIconHtml, initializeOpacitySlider } from './utils.js';

// DOM elements - will be initialized after DOMContentLoaded
let columnsContainer, settingsContainer, helpContainer, passthroughTitle;
let pauseButton, clearButton, helpButton, settingsButton, closeButton;
let allButtons, keybindList;
let historyButton, timeoutSlider, timeoutValue;

let allUsers = {};
let userColors = {};
let isPaused = false;
let socket = null;
let isWebSocketConnected = false;
let lastWebSocketMessage = Date.now();
const WEBSOCKET_RECONNECT_INTERVAL = 5000;
const WEBSOCKET_IDLE_TIMEOUT = 10000; // Consider stale after 10s of no messages
let reconnectAttempts = 0;
const MAX_RECONNECT_INTERVAL = 30000; // Cap backoff at 30s

// Keybind management
let currentKeybinds = {};
let keybindMap = new Map(); // Optimized lookup for keybind validation
let isRecordingKeybind = false;
let currentRecordingElement = null;
let keybindEventListeners = new Map(); // Track event listeners for cleanup

function renderDataList(users) {
    // Early exit if no users
    if (users.length === 0) {
        columnsContainer.innerHTML = '';
        return;
    }

    // Calculate totals and sort
    const totalDamageOverall = users.reduce((sum, user) => sum + user.total_damage.total, 0);
    const totalHealingOverall = users.reduce((sum, user) => sum + user.total_healing.total, 0);

    users.sort((a, b) => b.total_damage.total - a.total_damage.total);

    // Pre-calculate reciprocals for percentage calculations (avoid division in loop)
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

        // Pre-format numbers to avoid multiple calls
        const formattedDamageTotal = formatNumber(user.total_damage.total);
        const formattedDPS = formatNumber(user.total_dps);
        const damagePercentStr = damagePercent.toFixed(1);

        // Use profession for display, not subProfession
        const professionDisplay = user.profession || 'Unknown';
        const displayName = user.fightPoint
            ? `${user.name} - ${professionDisplay} (${user.fightPoint})`
            : `${user.name} - ${professionDisplay}`;

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

function processDataUpdate(data) {
    if (isPaused) return;
    if (!data.user) {
        console.warn('Received data without a "user" object:', data);
        return;
    }

    for (const userId in data.user) {
        const newUser = data.user[userId];
        const existingUser = allUsers[userId] || {};

        const updatedUser = {
            ...existingUser,
            ...newUser,
            id: userId,
        };

        const hasNewValidName = newUser.name && typeof newUser.name === 'string' && newUser.name !== '未知';
        if (hasNewValidName) {
            updatedUser.name = newUser.name;
        } else if (!existingUser.name || existingUser.name === '...') {
            updatedUser.name = '...';
        }

        const hasNewProfession = newUser.profession && typeof newUser.profession === 'string';
        if (hasNewProfession) {
            updatedUser.profession = newUser.profession;
        } else if (!existingUser.profession) {
            updatedUser.profession = '';
        }

        const hasNewFightPoint = newUser.fightPoint !== undefined && typeof newUser.fightPoint === 'number';
        if (hasNewFightPoint) {
            updatedUser.fightPoint = newUser.fightPoint;
        } else if (existingUser.fightPoint === undefined) {
            updatedUser.fightPoint = 0;
        }

        allUsers[userId] = updatedUser;
    }

    updateAll();
}

async function clearData() {
    try {
        const currentStatus = getServerStatus();

        // Show status that we're saving the current encounter
        showServerStatus('saving');

        const response = await fetch(`http://${SERVER_URL}/api/clear`);
        const result = await response.json();

        if (result.code === 0) {
            allUsers = {};
            userColors = {};
            updateAll();
            showServerStatus('cleared');
            console.log('Encounter saved and cleared. New encounter started.');
        } else {
            console.error('Failed to clear data on server:', result.msg);
            showServerStatus('error');
        }

        setTimeout(() => showServerStatus(currentStatus), 2000);
    } catch (error) {
        console.error('Error sending clear request to server:', error);
        showServerStatus('error');
        setTimeout(() => showServerStatus('disconnected'), 2000);
    }
}

function togglePause() {
    isPaused = !isPaused;
    pauseButton.innerText = isPaused ? 'Resume' : 'Pause';
    showServerStatus(isPaused ? 'paused' : 'connected');
}

function closeClient() {
    // Disconnect WebSocket gracefully
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    // Clear connection check interval
    isWebSocketConnected = false;

    // Reset state
    allUsers = {};
    userColors = {};
    isPaused = false;

    // Close the Electron window
    window.electronAPI.closeClient();
}

function showServerStatus(status) {
    const statusElement = document.getElementById('serverStatus');
    statusElement.className = `status-indicator ${status}`;
}

function getServerStatus() {
    const statusElement = document.getElementById('serverStatus');
    return statusElement.className.replace('status-indicator ', '');
}

function connectWebSocket() {
    socket = io(`ws://${SERVER_URL}`);

    socket.on('connect', () => {
        isWebSocketConnected = true;
        reconnectAttempts = 0; // Reset backoff on successful connection
        showServerStatus('connected');
        lastWebSocketMessage = Date.now();
    });

    socket.on('disconnect', () => {
        isWebSocketConnected = false;
        showServerStatus('disconnected');
    });

    socket.on('data', (data) => {
        processDataUpdate(data);
        lastWebSocketMessage = Date.now();
    });

    socket.on('user_deleted', (data) => {
        console.log(`User ${data.uid} was removed due to inactivity.`);
        delete allUsers[data.uid];
        updateAll();
    });

    socket.on('data_cleared', () => {
        console.log('Data cleared - new fight started');
        allUsers = {};
        userColors = {};
        updateAll();
    });

    socket.on('new_fight_started', (data) => {
        console.log(`New fight started: ${data.fightId}`);
        allUsers = {};
        userColors = {};
        updateAll();
    });

    socket.on('fight_ended', () => {
        console.log('Fight ended - clearing main window');
        allUsers = {};
        userColors = {};
        clearData();
        updateAll();
    });
    socket.on('connect_error', (error) => {
        showServerStatus('disconnected');
        console.error('WebSocket connection error:', error);
    });
}

function checkConnection() {
    // Only check if disconnected or idle
    const timeSinceLastMessage = Date.now() - lastWebSocketMessage;

    // Handle disconnected state with exponential backoff
    if (!isWebSocketConnected && socket && socket.disconnected) {
        showServerStatus('reconnecting');
        reconnectAttempts++;
        const backoffDelay = Math.min(
            WEBSOCKET_RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts - 1),
            MAX_RECONNECT_INTERVAL
        );

        // Only reconnect if enough time has passed based on backoff
        if (reconnectAttempts === 1 || timeSinceLastMessage >= backoffDelay) {
            socket.connect();
        }
        return;
    }

    // Handle idle connection (no messages for extended period)
    if (isWebSocketConnected && timeSinceLastMessage > WEBSOCKET_IDLE_TIMEOUT) {
        console.warn('Connection appears idle, reconnecting...');
        isWebSocketConnected = false;
        if (socket) socket.disconnect();
        connectWebSocket();
        showServerStatus('reconnecting');
    }
}

function initialize() {
    connectWebSocket();
    setInterval(checkConnection, WEBSOCKET_RECONNECT_INTERVAL);
}

function toggleSettings() {
    const isSettingsVisible = !settingsContainer.classList.contains('hidden');

    if (isSettingsVisible) {
        settingsContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        settingsContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
        helpContainer.classList.add('hidden'); // Also hide help
    }
}

function toggleHelp() {
    const isHelpVisible = !helpContainer.classList.contains('hidden');
    if (isHelpVisible) {
        helpContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        helpContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
        settingsContainer.classList.add('hidden'); // Also hide settings
    }
}

//history functions
function updateTimeoutValue() {
    console.log('Updating timeout display to:', timeoutSlider.value);
    timeoutValue.textContent = timeoutSlider.value;
}

async function loadInitialTimeout() {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/timeout`);
        if (response.ok) {
            const result = await response.json();
            if (result.code === 0) {
                const timeoutSeconds = result.timeout / 1000; // Convert from ms to seconds
                timeoutSlider.value = timeoutSeconds;
                updateTimeoutValue();
                console.log(`Loaded initial timeout: ${timeoutSeconds}s`);
            }
        } else {
            console.error('Failed to load initial timeout:', response.status);
            // Use default value if server fails
            updateTimeoutValue();
        }
    } catch (error) {
        console.error('Error loading initial timeout:', error);
        // Use default value if request fails
        updateTimeoutValue();
    }
}

async function updateFightTimeout(seconds) {
    try {
        console.log(`Updating fight timeout to ${seconds} seconds (${seconds * 1000}ms)`);
        const response = await fetch(`http://${SERVER_URL}/api/fight/timeout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeout: seconds * 1000 }), // Convert to milliseconds
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`Fight timeout updated successfully:`, result);
        } else {
            console.error('Failed to update fight timeout:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error updating fight timeout:', error);
    }
}

// Fight History Functions
function toggleHistory() {
    // Open history window using Electron API
    window.electronAPI.openHistoryWindow();
}

// Keybind management functions
async function loadKeybinds() {
    try {
        currentKeybinds = await window.electronAPI.getKeybinds();

        // Sync keybindMap for O(1) lookups
        keybindMap.clear();
        Object.entries(currentKeybinds).forEach(([name, shortcut]) => {
            keybindMap.set(name, shortcut);
        });

        renderKeybindList();
    } catch (error) {
        console.error('Failed to load keybinds:', error);
    }
}

function renderKeybindList() {
    // Clean up old event listeners
    keybindEventListeners.forEach((listener, element) => {
        element.removeEventListener('click', listener);
    });
    keybindEventListeners.clear();

    keybindList.innerHTML = '';

    const keybindLabels = {
        togglePassthrough: 'Toggle Mouse Pass-through',
        minimizeWindow: 'Minimize Window Content',
        resizeUp: 'Resize Window Up',
        resizeDown: 'Resize Window Down',
        resizeLeft: 'Resize Window Left',
        resizeRight: 'Resize Window Right',
        moveUp: 'Move Window Up',
        moveDown: 'Move Window Down',
        moveLeft: 'Move Window Left',
        moveRight: 'Move Window Right',
        pauseResume: 'Pause/Resume Statistics',
        clearData: 'Clear Data',
    };

    Object.entries(currentKeybinds).forEach(([keybindName, shortcut]) => {
        const item = document.createElement('div');
        item.className = 'keybind-item';

        const label = document.createElement('span');
        label.className = 'keybind-label';
        label.textContent = keybindLabels[keybindName] || keybindName;

        const shortcutElement = document.createElement('span');
        shortcutElement.className = 'keybind-shortcut';
        shortcutElement.textContent = shortcut;
        shortcutElement.dataset.keybindName = keybindName;

        // Create listener and store it for cleanup
        const clickListener = () => startRecordingKeybind(keybindName, shortcutElement);
        shortcutElement.addEventListener('click', clickListener);
        keybindEventListeners.set(shortcutElement, clickListener);

        item.appendChild(label);
        item.appendChild(shortcutElement);
        keybindList.appendChild(item);
    });
}

async function startRecordingKeybind(keybindName, element) {
    if (isRecordingKeybind) {
        await stopRecordingKeybind();
    }

    isRecordingKeybind = true;
    currentRecordingElement = element;
    element.classList.add('recording');
    element.textContent = 'Press a key...';

    // Disable all keybinds temporarily
    try {
        await window.electronAPI.disableKeybinds();
    } catch (error) {
        console.error('Failed to disable keybinds:', error);
    }

    // Add global keydown listener
    document.addEventListener('keydown', handleKeybindRecording, true);
}

async function stopRecordingKeybind() {
    if (currentRecordingElement) {
        currentRecordingElement.classList.remove('recording');
        currentRecordingElement.textContent = currentKeybinds[currentRecordingElement.dataset.keybindName];
    }

    isRecordingKeybind = false;
    currentRecordingElement = null;
    document.removeEventListener('keydown', handleKeybindRecording, true);

    // Re-enable all keybinds
    try {
        await window.electronAPI.enableKeybinds();
    } catch (error) {
        console.error('Failed to enable keybinds:', error);
    }
}

async function handleKeybindRecording(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!isRecordingKeybind || !currentRecordingElement) return;

    const keybindName = currentRecordingElement.dataset.keybindName;
    const modifiers = [];

    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');

    let key = event.key;

    // Handle special keys
    if (key === ' ') key = 'Space';
    if (key === 'ArrowUp') key = 'Up';
    if (key === 'ArrowDown') key = 'Down';
    if (key === 'ArrowLeft') key = 'Left';
    if (key === 'ArrowRight') key = 'Right';

    // Skip modifier-only keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;

    const newShortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;

    // Check if shortcut is already in use (optimized with Map)
    let isAlreadyUsed = false;
    for (const [name, shortcut] of keybindMap) {
        if (name !== keybindName && shortcut === newShortcut) {
            isAlreadyUsed = true;
            break;
        }
    }

    if (isAlreadyUsed) {
        currentRecordingElement.classList.add('error');
        currentRecordingElement.textContent = 'Already used';
        setTimeout(async () => {
            currentRecordingElement.classList.remove('error');
            await stopRecordingKeybind();
        }, 1500);
        return;
    }

    // Update the keybind
    await updateKeybind(keybindName, newShortcut);
    await stopRecordingKeybind();
}

async function updateKeybind(keybindName, newShortcut) {
    try {
        const success = await window.electronAPI.updateKeybind(keybindName, newShortcut);
        if (success) {
            currentKeybinds[keybindName] = newShortcut;
            keybindMap.set(keybindName, newShortcut); // Sync Map
            currentRecordingElement.textContent = newShortcut;
        } else {
            currentRecordingElement.classList.add('error');
            currentRecordingElement.textContent = 'Failed';
            setTimeout(async () => {
                currentRecordingElement.classList.remove('error');
                await stopRecordingKeybind();
            }, 1500);
        }
    } catch (error) {
        console.error('Failed to update keybind:', error);
        currentRecordingElement.classList.add('error');
        currentRecordingElement.textContent = 'Error';
        setTimeout(async () => {
            currentRecordingElement.classList.remove('error');
            await stopRecordingKeybind();
        }, 1500);
    }
}

function initializeDOMElements() {
    columnsContainer = document.getElementById('columnsContainer');
    settingsContainer = document.getElementById('settingsContainer');
    helpContainer = document.getElementById('helpContainer');
    passthroughTitle = document.getElementById('passthroughTitle');
    pauseButton = document.getElementById('pauseButton');
    clearButton = document.getElementById('clearButton');
    helpButton = document.getElementById('helpButton');
    settingsButton = document.getElementById('settingsButton');
    closeButton = document.getElementById('closeButton');
    historyButton = document.getElementById('historyButton'); // Initialize before using in array
    timeoutSlider = document.getElementById('timeoutSlider');
    timeoutValue = document.getElementById('timeoutValue');
    allButtons = [clearButton, pauseButton, helpButton, settingsButton, historyButton, closeButton];
    keybindList = document.getElementById('keybindList');
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initialize();

    // Initialize opacity slider with utility function
    initializeOpacitySlider('opacitySlider', 'backgroundOpacity');

    settingsButton.addEventListener('click', () => {
        if (!settingsContainer.classList.contains('hidden')) {
            loadKeybinds();
        }
    });

    // Initialize timeout slider
    console.log('Timeout slider element:', timeoutSlider);
    console.log('Timeout value element:', timeoutValue);

    // Load initial timeout from server
    loadInitialTimeout();

    timeoutSlider.addEventListener('input', (event) => {
        console.log('Timeout slider changed to:', event.target.value);
        updateTimeoutValue();
        updateFightTimeout(parseInt(event.target.value));
    });

    // Listen for the passthrough toggle event from the main process
    window.electronAPI.onTogglePassthrough((isIgnoring) => {
        if (isIgnoring) {
            allButtons.forEach((button) => {
                button.classList.add('hidden');
            });
            passthroughTitle.classList.remove('hidden');
            columnsContainer.classList.remove('hidden');
            settingsContainer.classList.add('hidden');
            helpContainer.classList.add('hidden');
        } else {
            allButtons.forEach((button) => {
                button.classList.remove('hidden');
            });
            passthroughTitle.classList.add('hidden');
        }
    });

    // Listen for keybind-triggered actions
    window.electronAPI.onTriggerPauseResume(() => {
        togglePause();
    });

    window.electronAPI.onTriggerClearData(() => {
        clearData();
    });
});

window.clearData = clearData;
window.togglePause = togglePause;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.closeClient = closeClient;
window.toggleHelp = toggleHelp;
