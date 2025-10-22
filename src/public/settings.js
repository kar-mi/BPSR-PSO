import { SERVER_URL, initializeOpacitySlider } from './utils.js';

// DOM elements
let networkAdapterSelect, refreshAdaptersButton;
let timeoutSlider, timeoutValue;
let keybindList;
let closeButton;

// Keybind management
let currentKeybinds = {};
let keybindMap = new Map();
let isRecordingKeybind = false;
let currentRecordingElement = null;
let keybindEventListeners = new Map();

/**
 * Initialize tab functionality
 */
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Remove active class from all buttons and contents
            tabButtons.forEach((btn) => btn.classList.remove('active'));
            tabContents.forEach((content) => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');

            // Load data for specific tabs when they're opened
            if (tabName === 'network') {
                loadNetworkAdapters();
            } else if (tabName === 'keybinds') {
                loadKeybinds();
            }
        });
    });
}

/**
 * Network Adapter Functions
 */
async function loadNetworkAdapters() {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/network/adapters`);
        const result = await response.json();

        if (result.code === 0) {
            populateNetworkAdapterSelect(result.data);
            await loadSelectedAdapter();
        } else {
            console.error('Failed to load network adapters:', result.msg);
        }
    } catch (error) {
        console.error('Error loading network adapters:', error);
    }
}

function populateNetworkAdapterSelect(adapters) {
    // Clear existing options except the first one (Auto-detect)
    while (networkAdapterSelect.options.length > 1) {
        networkAdapterSelect.remove(1);
    }

    // Add adapter options
    adapters.forEach((adapter) => {
        const option = document.createElement('option');
        option.value = adapter.index.toString();
        option.textContent = `${adapter.description} (${adapter.name})`;
        networkAdapterSelect.appendChild(option);
    });
}

async function loadSelectedAdapter() {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/network/selected`);
        const result = await response.json();

        if (result.code === 0) {
            networkAdapterSelect.value = result.data.selectedAdapter;
        } else {
            console.error('Failed to load selected adapter:', result.msg);
        }
    } catch (error) {
        console.error('Error loading selected adapter:', error);
    }
}

async function updateSelectedAdapter(selectedAdapter) {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/network/selected`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ selectedAdapter }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Network adapter updated:', result.msg);
            alert(result.msg);
        } else {
            console.error('Failed to update network adapter:', response.status);
        }
    } catch (error) {
        console.error('Error updating network adapter:', error);
    }
}

/**
 * Timeout Functions
 */
function updateTimeoutValue() {
    timeoutValue.textContent = timeoutSlider.value;
}

async function loadInitialTimeout() {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/timeout`);
        if (response.ok) {
            const result = await response.json();
            if (result.code === 0) {
                const timeoutSeconds = result.timeout / 1000;
                timeoutSlider.value = timeoutSeconds;
                updateTimeoutValue();
            }
        } else {
            console.error('Failed to load initial timeout:', response.status);
            updateTimeoutValue();
        }
    } catch (error) {
        console.error('Error loading initial timeout:', error);
        updateTimeoutValue();
    }
}

async function updateFightTimeout(seconds) {
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/timeout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeout: seconds * 1000 }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Fight timeout updated successfully:', result);
        } else {
            console.error('Failed to update fight timeout:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error updating fight timeout:', error);
    }
}

/**
 * Keybind Management Functions
 */
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
            keybindMap.set(keybindName, newShortcut);
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


/**
 * Initialize DOM elements and event listeners
 */
function initializeDOMElements() {
    networkAdapterSelect = document.getElementById('networkAdapter');
    refreshAdaptersButton = document.getElementById('refreshAdapters');
    timeoutSlider = document.getElementById('timeoutSlider');
    timeoutValue = document.getElementById('timeoutValue');
    keybindList = document.getElementById('keybindList');
    closeButton = document.getElementById('closeButton');
}

/**
 * Close the settings window
 */
function closeSettings() {
    window.close();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initializeTabs();

    // Initialize settings window opacity slider (affects this window)
    initializeOpacitySlider('settingsOpacitySlider', 'settingsWindowOpacity');

    // Load initial data for General tab (default)
    loadInitialTimeout();

    // Timeout slider
    timeoutSlider.addEventListener('input', () => {
        updateTimeoutValue();
        updateFightTimeout(parseInt(timeoutSlider.value));
    });

    // Network adapter events
    networkAdapterSelect.addEventListener('change', (event) => {
        const selectedAdapter = event.target.value;
        updateSelectedAdapter(selectedAdapter);
    });

    refreshAdaptersButton.addEventListener('click', () => {
        loadNetworkAdapters();
    });

    // Close button
    closeButton.addEventListener('click', closeSettings);
});
