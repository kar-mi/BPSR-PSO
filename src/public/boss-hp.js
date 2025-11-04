import { SERVER_URL, initializeFontSize, initializeTheme, setupFontSizeListener, setupThemeListener } from './utils.js';

// DOM elements
let bossHpOverlay, bossName, bossHpFill, bossHpCurrent, bossHpMax, bossHpPercent;

// Socket connection
let socket;

/**
 * Format numbers with commas
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Update boss HP display
 */
function updateBossHp(bossData) {
    if (!bossHpOverlay) {
        return;
    }

    // Always show the overlay
    bossHpOverlay.classList.remove('hidden');

    if (!bossData || !bossData.hp || !bossData.maxHp || bossData.hp <= 0) {
        // Show N/A when no boss is active
        showNoBoss();
        return;
    }

    const { name, hp, maxHp } = bossData;

    bossName.textContent = name || 'Unknown Boss';
    bossHpCurrent.textContent = formatNumber(hp);
    bossHpMax.textContent = formatNumber(maxHp);

    const percentage = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    bossHpPercent.textContent = percentage.toFixed(1);
    bossHpFill.style.width = `${percentage}%`;

    // Update color based on HP percentage
    bossHpFill.classList.remove('medium', 'low');
    if (percentage <= 20) {
        bossHpFill.classList.add('low');
    } else if (percentage <= 50) {
        bossHpFill.classList.add('medium');
    }
}

/**
 * Show N/A state when no boss is active
 */
function showNoBoss() {
    if (bossHpOverlay) {
        bossName.textContent = 'No Active Boss';
        bossHpCurrent.textContent = 'N/A';
        bossHpMax.textContent = 'N/A';
        bossHpPercent.textContent = 'N/A';
        bossHpFill.style.width = '0%';
        bossHpFill.classList.remove('medium', 'low');
    }
}

/**
 * Initialize socket connection
 */
function initSocket() {
    socket = io(`http://${SERVER_URL}`);

    socket.on('connect', () => {
        console.log('Boss HP bar connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Boss HP bar disconnected from server');
        showNoBoss();
    });

    socket.on('boss_hp_update', (bossData) => {
        updateBossHp(bossData);
    });

    socket.on('data_cleared', () => {
        showNoBoss();
    });
}

/**
 * Initialize DOM elements
 */
function initializeDOMElements() {
    bossHpOverlay = document.getElementById('bossHpOverlay');
    bossName = document.getElementById('bossName');
    bossHpFill = document.getElementById('bossHpFill');
    bossHpCurrent = document.getElementById('bossHpCurrent');
    bossHpMax = document.getElementById('bossHpMax');
    bossHpPercent = document.getElementById('bossHpPercent');
}

/**
 * Initialize the boss HP bar
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize font size and theme
    initializeFontSize();
    initializeTheme();

    // Set up font size and theme listeners
    setupFontSizeListener();
    setupThemeListener();

    initializeDOMElements();

    // Show N/A state initially
    showNoBoss();

    initSocket();
});
