const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', Boolean(flag)),
  ...(process.platform === 'win32' ? {
    battleReports: {
      getState: () => ipcRenderer.invoke('battle-reports-get'),
      showDiagnostics: () => ipcRenderer.invoke('battle-reports-diagnostics'),
      setEnabled: (enabled) => ipcRenderer.invoke('battle-reports-enable', enabled),
      onState: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('battle-reports-state', listener);
        return () => ipcRenderer.removeListener('battle-reports-state', listener);
      },
    },
  } : {}),
});
