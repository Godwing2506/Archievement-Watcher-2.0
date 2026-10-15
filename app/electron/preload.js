'use strict';

/**
 * Preload: exposes a minimal API for when contextIsolation is enabled.
 * Use window.api instead of require('@electron/remote') after migrating renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Información de la App y Rutas
  getAppPath: () => ipcRenderer.invoke('app:getAppPath'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getEmuPaths: () => ipcRenderer.invoke('app:getEmuPaths'),
  componentsLoaded: () => ipcRenderer.invoke('components-loaded'),
  pathJoin: (...args) => ipcRenderer.invoke('path:join', ...args),
  pathNormalize: (p) => ipcRenderer.invoke('path:normalize', p),
  getWinDir: () => ipcRenderer.invoke('app:getWinDir'),
  getEnv: (name) => ipcRenderer.invoke('app:getEnv', name),
  readJson: (path) => ipcRenderer.invoke('fs:readJson', path),

  // Acciones de Sistema (Shell)
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),

  // Diálogos (para seleccionar carpetas de usuario)
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options),

  // Control de Ventana y Pruebas
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    unmaximize: () => ipcRenderer.send('window:unmaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    testNotification: () => ipcRenderer.send('window:test-notification')
  },

  // Auto-refresh de logros
  achWatch: {
    setTargets: (games) => ipcRenderer.invoke('achwatch:set', games),
    onChange: (cb) => ipcRenderer.on('achievements-changed', (event, msg) => cb(msg))
  },

  // Gestión del Watchdog (Lógica movida al Main)
  watchdog: {
    start: () => ipcRenderer.invoke('watchdog:start'),
    stop: () => ipcRenderer.invoke('watchdog:stop'),
    getPid: () => ipcRenderer.invoke('watchdog:getPid'),
    ensure: () => ipcRenderer.invoke('watchdog:ensure'),
    reportPong: (pid) => ipcRenderer.send('watchdog:pong', pid)
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api);
} else {
  window.api = api;
}
