const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', Boolean(flag)),
  ...(process.platform === 'win32' ? { battleReports: {
    getState: () => ipcRenderer.invoke('battle-reports-get'),
    showDiagnostics: () => ipcRenderer.invoke('battle-reports-diagnostics'),
    setEnabled: (enabled) => ipcRenderer.invoke('battle-reports-enable', enabled),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('battle-reports-state', listener);
      return () => ipcRenderer.removeListener('battle-reports-state', listener);
    },
  } } : {}),
  covenantOcr: {
    listSources: () => ipcRenderer.invoke('covenant-ocr-sources'),
    getState: () => ipcRenderer.invoke('covenant-ocr-state'),
    selectSource: (id) => ipcRenderer.invoke('covenant-ocr-select', id),
    start: (mode) => ipcRenderer.invoke('covenant-ocr-start', mode),
    cancel: () => ipcRenderer.invoke('covenant-ocr-cancel'),
    reset: () => ipcRenderer.invoke('covenant-ocr-reset'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('covenant-ocr-state', listener);
      return () => ipcRenderer.removeListener('covenant-ocr-state', listener);
    },
    onOpen: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('covenant-ocr-open', listener);
      return () => ipcRenderer.removeListener('covenant-ocr-open', listener);
    },
  },
});
