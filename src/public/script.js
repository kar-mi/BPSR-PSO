import {
    SERVER_URL,
    getNextColorShades,
    formatNumber,
    getProfessionIconHtml,
    initializeOpacitySlider,
    renderDataList,
} from './utils.js';

// DOM elements - will be initialized after DOMContentLoaded
let columnsContainer, helpContainer, passthroughTitle, passthroughKeybind, encounterTimer;
let pauseButton, clearButton, helpButton, settingsButton, closeButton;
let allButtons;
let historyButton;

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

//Timer
let encounterStartTime = null;
let timerInterval = null;

function updateAll() {
    const usersArray = Object.values(allUsers).filter((user) => user.total_dps > 0 || user.total_hps > 0);
    renderDataList(usersArray, userColors, columnsContainer);
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
        stopEncounterTimer();
    });

    socket.on('new_fight_started', (data) => {
        console.log(`New fight started: ${data.fightId}`);
        allUsers = {};
        userColors = {};
        updateAll();
        startEncounterTimer();
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
    // Open settings window using Electron API
    window.electronAPI.openSettingsWindow();
}

function toggleHelp() {
    const isHelpVisible = !helpContainer.classList.contains('hidden');
    if (isHelpVisible) {
        helpContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        helpContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
    }
}

//Encounter Timer
/**
 * Formats a duration in milliseconds into H:MM:SS or M:SS format.
 * @param {number} durationMs - The duration in milliseconds.
 */
function formatDuration(durationMs) {
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${formattedMinutes}:${formattedSeconds}`;
    } else {
        return `${minutes}:${formattedSeconds}`;
    }
}

/**
 * Starts or updates the encounter timer display.
 */
function updateEncounterTimerDisplay() {
    if (encounterTimer && encounterStartTime) {
        const duration = Date.now() - encounterStartTime;
        encounterTimer.textContent = formatDuration(duration);
    }
}

/**
 * Manages the timer interval.
 */
function startEncounterTimer() {
    if (timerInterval) clearInterval(timerInterval); // Clear any existing timer

    // Set the initial start time
    encounterStartTime = Date.now();

    // Update immediately
    updateEncounterTimerDisplay();

    // Start interval to update every second
    timerInterval = setInterval(updateEncounterTimerDisplay, 1000);
}

/**
 * Stops the timer and resets the display.
 */
function stopEncounterTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    encounterStartTime = null;
    if (encounterTimer) {
        encounterTimer.textContent = '00:00';
    }
}

// Fight History Functions
function toggleHistory() {
    // Open history window using Electron API
    window.electronAPI.openHistoryWindow();
}

// Load and display the passthrough keybind text
async function loadPassthroughKeybind() {
    try {
        const keybinds = await window.electronAPI.getKeybinds();
        if (keybinds && keybinds.togglePassthrough) {
            passthroughKeybind.textContent = `Press ${keybinds.togglePassthrough} to exit passthrough mode.`;
        }
    } catch (error) {
        console.error('Failed to load passthrough keybind:', error);
    }
}

function initializeDOMElements() {
    columnsContainer = document.getElementById('columnsContainer');
    helpContainer = document.getElementById('helpContainer');
    passthroughTitle = document.getElementById('passthroughTitle');
    passthroughKeybind = document.getElementById('passthroughKeybind');
    encounterTimer = document.getElementById('encounterTimer');
    //pauseButton = document.getElementById('pauseButton');
    clearButton = document.getElementById('clearButton');
    //helpButton = document.getElementById('helpButton');
    settingsButton = document.getElementById('settingsButton');
    closeButton = document.getElementById('closeButton');
    historyButton = document.getElementById('historyButton');
    allButtons = [clearButton, pauseButton, helpButton, settingsButton, historyButton, closeButton];
}

/**
 * Initialize resize handles for dragging to resize window
 */
function initializeResizeHandles() {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach((handle) => {
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startWindowX, startWindowY;
        let resizeDirection = '';

        // Determine resize direction from class name
        if (handle.classList.contains('resize-handle-top')) resizeDirection = 'top';
        else if (handle.classList.contains('resize-handle-bottom')) resizeDirection = 'bottom';
        else if (handle.classList.contains('resize-handle-left')) resizeDirection = 'left';
        else if (handle.classList.contains('resize-handle-right')) resizeDirection = 'right';
        else if (handle.classList.contains('resize-handle-top-left')) resizeDirection = 'top-left';
        else if (handle.classList.contains('resize-handle-top-right')) resizeDirection = 'top-right';
        else if (handle.classList.contains('resize-handle-bottom-left')) resizeDirection = 'bottom-left';
        else if (handle.classList.contains('resize-handle-bottom-right')) resizeDirection = 'bottom-right';

        handle.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            isResizing = true;

            startX = e.screenX;
            startY = e.screenY;

            // Get initial window size and position
            const windowBounds = await window.electronAPI.getWindowBounds();
            startWidth = windowBounds.width;
            startHeight = windowBounds.height;
            startWindowX = windowBounds.x;
            startWindowY = windowBounds.y;

            const minWidth = 549;
            const minHeight = 362;

            const handleMouseMove = (moveEvent) => {
                if (!isResizing) return;

                const deltaX = moveEvent.screenX - startX;
                const deltaY = moveEvent.screenY - startY;

                let newWidth = startWidth;
                let newHeight = startHeight;
                let newX = startWindowX;
                let newY = startWindowY;

                // Calculate new dimensions based on resize direction
                switch (resizeDirection) {
                    case 'right':
                        newWidth = Math.max(minWidth, startWidth + deltaX);
                        break;
                    case 'left':
                        newWidth = Math.max(minWidth, startWidth - deltaX);
                        newX = startWindowX + (startWidth - newWidth);
                        break;
                    case 'bottom':
                        newHeight = Math.max(minHeight, startHeight + deltaY);
                        break;
                    case 'top':
                        newHeight = Math.max(minHeight, startHeight - deltaY);
                        newY = startWindowY + (startHeight - newHeight);
                        break;
                    case 'bottom-right':
                        newWidth = Math.max(minWidth, startWidth + deltaX);
                        newHeight = Math.max(minHeight, startHeight + deltaY);
                        break;
                    case 'bottom-left':
                        newWidth = Math.max(minWidth, startWidth - deltaX);
                        newHeight = Math.max(minHeight, startHeight + deltaY);
                        newX = startWindowX + (startWidth - newWidth);
                        break;
                    case 'top-right':
                        newWidth = Math.max(minWidth, startWidth + deltaX);
                        newHeight = Math.max(minHeight, startHeight - deltaY);
                        newY = startWindowY + (startHeight - newHeight);
                        break;
                    case 'top-left':
                        newWidth = Math.max(minWidth, startWidth - deltaX);
                        newHeight = Math.max(minHeight, startHeight - deltaY);
                        newX = startWindowX + (startWidth - newWidth);
                        newY = startWindowY + (startHeight - newHeight);
                        break;
                }

                // Send resize request to main process
                window.electronAPI.resizeWindow({ x: newX, y: newY, width: newWidth, height: newHeight });
            };

            const handleMouseUp = () => {
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initialize();

    // Initialize opacity slider
    initializeOpacitySlider('opacitySlider', 'backgroundOpacity');

    // Initialize resize handles
    initializeResizeHandles();

    // Load passthrough keybind text
    loadPassthroughKeybind();

    // Listen for the passthrough toggle event from the main process
    window.electronAPI.onTogglePassthrough((isIgnoring) => {
        if (isIgnoring) {
            allButtons.forEach((button) => {
                button.classList.add('hidden');
            });
            passthroughTitle.classList.remove('hidden');
            passthroughKeybind.classList.remove('hidden');
            columnsContainer.classList.remove('hidden');
            helpContainer.classList.add('hidden');
        } else {
            allButtons.forEach((button) => {
                button.classList.remove('hidden');
            });
            passthroughTitle.classList.add('hidden');
            passthroughKeybind.classList.add('hidden');
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
