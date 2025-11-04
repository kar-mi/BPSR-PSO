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
});
