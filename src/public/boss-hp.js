import { SERVER_URL } from './utils.js';

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
    if (!bossData || !bossHpOverlay) {
        hideBossHp();
        return;
    }

    const { name, hp, maxHp } = bossData;

    if (hp > 0 && maxHp > 0) {
        bossHpOverlay.classList.remove('hidden');
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
    } else {
        hideBossHp();
    }
}

/**
 * Hide boss HP bar
 */
function hideBossHp() {
    if (bossHpOverlay) {
        bossHpOverlay.classList.add('hidden');
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
        hideBossHp();
    });

    socket.on('boss_hp_update', (bossData) => {
        updateBossHp(bossData);
    });

    socket.on('data_cleared', () => {
        hideBossHp();
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
    initializeDOMElements();
    initSocket();
});
