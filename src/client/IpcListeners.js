import { app, ipcMain, BrowserWindow } from 'electron';
import { keybindManager } from './shortcuts.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '../resources/app.ico');
const preloadPath = path.join(__dirname, '../preload.js');
const historyHtmlPath = path.join(__dirname, '../public/history.html');
const skillsHtmlPath = path.join(__dirname, '../public/skills.html');
const settingsHtmlPath = path.join(__dirname, '../public/settings.html');

let historyWindow = null;
let settingsWindow = null;
let skillWindows = {}; // Store multiple skill windows by UID

ipcMain.on('close-client', (event) => {
    app.quit();
});

// Keybind management IPC handlers
ipcMain.handle('get-keybinds', async (event) => {
    return keybindManager.getAllKeybinds();
});

ipcMain.handle('update-keybind', async (event, keybindName, newShortcut) => {
    return keybindManager.updateKeybind(keybindName, newShortcut);
});

ipcMain.handle('disable-keybinds', async (event) => {
    keybindManager.disableAllKeybinds();
});

ipcMain.handle('enable-keybinds', async (event) => {
    keybindManager.reEnableAllKeybinds();
});

ipcMain.on('open-history-window', async (event) => {
    if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.focus();
        return;
    }

    const mainWindow = BrowserWindow.fromWebContents(event.sender);

    historyWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        transparent: true,
        frame: false,
        title: 'Fight History - BPSR-PSO',
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoMenuBar: false,
        parent: mainWindow,
        modal: false,
    });

    historyWindow.setAlwaysOnTop(true, 'normal');
    historyWindow.setMovable(true);
    historyWindow.loadFile(historyHtmlPath);

    historyWindow.on('closed', () => {
        historyWindow = null;
    });
});

// Notify history window to refresh
ipcMain.on('refresh-history-window', () => {
    if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.webContents.send('history-data-updated');
    }
});

ipcMain.on('open-settings-window', async (event) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }

    const mainWindow = BrowserWindow.fromWebContents(event.sender);

    settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        transparent: true,
        frame: false,
        title: 'Settings - BPSR-PSO',
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoMenuBar: false,
        parent: mainWindow,
        modal: false,
    });

    settingsWindow.setAlwaysOnTop(true, 'normal');
    settingsWindow.setMovable(true);
    settingsWindow.loadFile(settingsHtmlPath);

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
});

ipcMain.on('open-skills-window', async (event, { uid, name, profession, fightId }) => {
    // Check if window for this UID already exists
    if (skillWindows[uid] && !skillWindows[uid].isDestroyed()) {
        skillWindows[uid].focus();
        return;
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];

    skillWindows[uid] = new BrowserWindow({
        width: 600,
        height: 700,
        minWidth: 400,
        minHeight: 300,
        transparent: true,
        frame: false,
        title: `Extra Details - ${name}`,
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoMenuBar: false,
        parent: mainWindow,
        modal: false,
    });

    skillWindows[uid].setAlwaysOnTop(true, 'normal');
    skillWindows[uid].setMovable(true);

    // Build URL with query parameters
    const params = new URLSearchParams({
        uid: uid,
        name: name || 'Unknown',
        profession: profession || 'Unknown',
    });

    if (fightId) {
        params.append('fightId', fightId);
    }

    const url = `${skillsHtmlPath}?${params.toString()}`;
    skillWindows[uid].loadFile(skillsHtmlPath, { query: Object.fromEntries(params) });

    skillWindows[uid].on('closed', () => {
        delete skillWindows[uid];
    });
});

// Window resize handlers
ipcMain.on('resize-window', (event, bounds) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        window.setBounds({
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
        });
    }
});

ipcMain.handle('get-window-bounds', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        return window.getBounds();
    }
    return null;
});

// Helper function to notify history window
export function notifyHistoryWindowRefresh() {
    if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.webContents.send('history-data-updated');
    }
}
