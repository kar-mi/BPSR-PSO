const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeClient: () => ipcRenderer.send('close-client'),
    onTogglePassthrough: (callback) => ipcRenderer.on('passthrough-toggled', (_event, value) => callback(value)),

    // Keybind management
    getKeybinds: () => ipcRenderer.invoke('get-keybinds'),
    updateKeybind: (keybindName, newShortcut) => ipcRenderer.invoke('update-keybind', keybindName, newShortcut),
    disableKeybinds: () => ipcRenderer.invoke('disable-keybinds'),
    enableKeybinds: () => ipcRenderer.invoke('enable-keybinds'),

    // Action triggers
    onTriggerPauseResume: (callback) => ipcRenderer.on('trigger-pause-resume', callback),
    onTriggerClearData: (callback) => ipcRenderer.on('trigger-clear-data', callback),

    // Window management
    openHistoryWindow: () => ipcRenderer.send('open-history-window'),
    openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
    openSkillsWindow: (data) => ipcRenderer.send('open-skills-window', data),
    openDeathsWindow: (data) => ipcRenderer.send('open-deaths-window', data),
    refreshHistoryWindow: () => ipcRenderer.send('refresh-history-window'),
    onHistoryDataUpdated: (callback) => ipcRenderer.on('history-data-updated', callback),

    // Window resizing
    resizeWindow: (bounds) => ipcRenderer.send('resize-window', bounds),
    getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),

    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Font size changes
    onFontSizeChanged: (callback) => ipcRenderer.on('font-size-changed', (_event, percentage) => callback(percentage)),
    broadcastFontSizeChange: (percentage) => ipcRenderer.send('broadcast-font-size-change', percentage),

    // Theme changes
    onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_event, theme) => callback(theme)),
    broadcastThemeChange: (theme) => ipcRenderer.send('broadcast-theme-change', theme),

    // Background image
    selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
    onBackgroundImageChanged: (callback) => ipcRenderer.on('background-image-changed', (_event, imageData) => callback(imageData)),
    broadcastBackgroundImageChange: (imagePath) => ipcRenderer.send('broadcast-background-image-change', imagePath),
    loadBackgroundImageData: (imagePath) => ipcRenderer.invoke('load-background-image-data', imagePath),

    // Boss HP bar toggle
    toggleBossHpBar: (enabled) => ipcRenderer.send('toggle-boss-hp-bar', enabled),
});
