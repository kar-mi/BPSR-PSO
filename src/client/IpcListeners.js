import { app, ipcMain, BrowserWindow } from 'electron';
import { keybindManager } from './shortcuts.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '../resources/app.ico');
const preloadPath = path.join(__dirname, '../preload.js');
const historyHtmlPath = path.join(__dirname, '../public/history.html');

let historyWindow = null;

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

    // Get opacity from localStorage (much faster than CSS variable)
    const savedOpacity = await mainWindow.webContents.executeJavaScript(`
        localStorage.getItem('backgroundOpacity') || '0.05'
    `);

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

    // Set opacity once after page loads
    historyWindow.webContents.on('did-finish-load', () => {
        historyWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--main-bg-opacity', '${savedOpacity}');
        `);
    });

    historyWindow.on('closed', () => {
        historyWindow = null;
    });
});

// IPC handler for syncing opacity changes from main window to history window
ipcMain.on('opacity-changed', (_event, newOpacity) => {
    if (historyWindow && !historyWindow.isDestroyed()) {
        historyWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--main-bg-opacity', '${newOpacity}');
        `);
    }
});
