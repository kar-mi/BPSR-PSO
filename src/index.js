import { app, BrowserWindow, globalShortcut } from 'electron';
import { checkForNpcap } from './client/npcapHandler.js';
import logger from './services/Logger.js';

async function initialize() {
    const canProceed = await checkForNpcap();
    if (!canProceed) {
        return;
    }

    // --- Dynamic Imports ---
    // Now that we know NpCap is installed, we can safely import the rest of our application modules.
    const { default: window } = await import('./client/Window.js');
    const { default: bossHpWindow } = await import('./client/BossHpWindow.js');
    const { registerShortcuts } = await import('./client/shortcuts.js');
    const { default: server } = await import('./server.js');
    await import('./client/IpcListeners.js');
    // ---------------------

    if (process.platform === 'win32') {
        app.setAppUserModelId(app.name);
    }

    const mainWindow = window.create();
    registerShortcuts();

    try {
        console.log('[Main Process] Attempting to start server automatically...');
        const serverUrl = await server.start();

        console.log(`[Main Process] Server started. Loading URL: ${serverUrl}`);
        window.loadURL(serverUrl);

        // Create boss HP bar window as child of main window
        console.log('[Main Process] Creating boss HP bar window...');
        bossHpWindow.create(serverUrl, mainWindow);
    } catch (error) {
        console.error('[Main Process] CRITICAL: Failed to start server:', error);
        app.quit();
    }
}

app.on('ready', initialize);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        initialize();
    }
});

app.on('before-quit', () => {
    // Set shutdown flag early to prevent logging errors during window closure
    logger.isShuttingDown = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
