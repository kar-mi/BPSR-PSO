import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '../resources/app.ico');
const preloadPath = path.join(__dirname, '../preload.js');
const htmlPath = path.join(__dirname, '../public/boss-hp.html');

/**
 * A manager class to handle the boss HP bar overlay window
 */
class BossHpWindow {
    _window = null;

    /**
     * Creates and displays the boss HP bar overlay window
     * @param {string} serverUrl - The server URL to pass to the window
     * @returns {BrowserWindow} The created BrowserWindow instance
     */
    create(serverUrl) {
        // Get primary display dimensions to center the window at the top
        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

        // Window dimensions
        const windowWidth = 600;
        const windowHeight = 100;

        // Calculate position (centered at top of screen)
        const x = Math.floor((screenWidth - windowWidth) / 2);
        const y = 0;

        this._window = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            x: x,
            y: y,
            transparent: true,
            frame: false,
            title: 'Boss HP Bar',
            icon: iconPath,
            webPreferences: {
                preload: preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: true,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: false,
        });

        this._window.setIgnoreMouseEvents(true, { forward: true });
        this._window.loadFile(htmlPath);

        this._window.on('closed', () => (this._window = null));

        return this._window;
    }

    /**
     * Retrieves the active BrowserWindow instance
     * @returns {BrowserWindow|null} The active window instance or null
     */
    getWindow() {
        return this._window;
    }

    /**
     * Closes the boss HP bar window
     */
    close() {
        if (this._window) {
            this._window.close();
        }
    }

    /**
     * Shows the boss HP bar window
     */
    show() {
        if (this._window) {
            this._window.show();
        }
    }

    /**
     * Hides the boss HP bar window
     */
    hide() {
        if (this._window) {
            this._window.hide();
        }
    }
}

const bossHpWindow = new BossHpWindow();
export default bossHpWindow;
