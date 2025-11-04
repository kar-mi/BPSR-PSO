import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { paths } from '../config/paths.js';
import { loadWindowConfig, saveWindowConfig } from '../utils/windowConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '../resources/app.ico');
const preloadPath = path.join(__dirname, '../preload.js');
const htmlPath = path.join(__dirname, '../public/boss-hp.html');
const configPath = paths.bossHpWindowConfig;

/**
 * A manager class to handle the boss HP bar overlay window
 */
class BossHpWindow {
    _window = null;
    config = {};
    defaultConfig = {
        width: 600,
        height: 50,
        x: undefined,
        y: undefined,
    };

    constructor() {
        this.config = this._loadConfig();
    }

    /**
     * Loads window configuration from the JSON file.
     * @private
     */
    _loadConfig() {
        return loadWindowConfig(configPath, this.defaultConfig);
    }

    /**
     * Saves the current window position to the JSON file.
     * @private
     */
    _saveConfig() {
        saveWindowConfig(this._window, configPath);
    }

    /**
     * Creates and displays the boss HP bar overlay window
     * @param {string} serverUrl - The server URL to pass to the window
     * @param {BrowserWindow} mainWindow - The main window to set as parent
     * @returns {BrowserWindow} The created BrowserWindow instance
     */
    create(serverUrl, mainWindow = null) {
        // Get primary display dimensions to center the window at the top if no saved position
        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

        // Window dimensions
        const windowWidth = this.config.width;
        const windowHeight = this.config.height;

        // Use saved position or calculate default (centered at top of screen)
        const x = this.config.x !== undefined ? this.config.x : Math.floor((screenWidth - windowWidth) / 2);
        const y = this.config.y !== undefined ? this.config.y : 0;

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
                sandbox: true,
            },
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: true,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: false,
            parent: mainWindow,
            modal: false,
        });

        // Don't ignore mouse events so window can be dragged
        this._window.loadFile(htmlPath);

        // Save position when window is moved
        this._window.on('move', () => this._saveConfig());
        this._window.on('close', () => this._saveConfig());
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
            this._saveConfig();
            this._window.destroy();
            this._window = null;
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

    /**
     * Sets the passthrough mode for the boss HP bar window
     * @param {boolean} enabled - Whether to enable passthrough mode
     */
    setPassthrough(enabled) {
        if (this._window) {
            if (enabled) {
                this._window.setIgnoreMouseEvents(true, { forward: true });
            } else {
                this._window.setIgnoreMouseEvents(false);
            }
        }
    }
}

const bossHpWindow = new BossHpWindow();
export default bossHpWindow;
