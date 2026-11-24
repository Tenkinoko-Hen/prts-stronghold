const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', Boolean(flag)),
  ...(process.platform === 'win32' ? {
    battleReports: {
      getState: () => ipcRenderer.invoke('battle-reports-get'),
      showDiagnostics: () => ipcRenderer.invoke('battle-reports-diagnostics'),
      setEnabled: (enabled) => ipcRenderer.invoke('battle-reports-enable', enabled),
      installNpcap: () => ipcRenderer.invoke('battle-reports-install-npcap'),
      recheckNpcap: () => ipcRenderer.invoke('battle-reports-recheck-npcap'),
      openNpcapPage: () => ipcRenderer.invoke('battle-reports-open-npcap'),
      onState: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('battle-reports-state', listener);
        return () => ipcRenderer.removeListener('battle-reports-state', listener);
      },
    },
    covenantOcr: {
      getState: () => ipcRenderer.invoke('covenant-ocr-get'),
      scanWindow: () => ipcRenderer.invoke('covenant-ocr-window'),
      scanClipboard: () => ipcRenderer.invoke('covenant-ocr-clipboard'),
      setAutoPoll: (enabled) => ipcRenderer.invoke('covenant-ocr-auto', Boolean(enabled)),
      reset: () => ipcRenderer.invoke('covenant-ocr-reset'),
      onState: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('covenant-ocr-state', listener);
        return () => ipcRenderer.removeListener('covenant-ocr-state', listener);
      },
    },
    hud: {
      getState: () => ipcRenderer.invoke('hud-overlay-get'),
      setOpen: (flag) => ipcRenderer.invoke('hud-overlay-open', Boolean(flag)),
      setLocked: (locked) => ipcRenderer.invoke('hud-overlay-lock', Boolean(locked)),
      syncGuide: (guide) => ipcRenderer.invoke('hud-overlay-guide', guide),
      onState: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('hud-overlay-state', listener);
        return () => ipcRenderer.removeListener('hud-overlay-state', listener);
      },
    },
    lanSync: {
      getState: () => ipcRenderer.invoke('lan-sync-get'),
      setEnabled: (enabled) => ipcRenderer.invoke('lan-sync-enable', Boolean(enabled)),
      refreshPin: () => ipcRenderer.invoke('lan-sync-refresh-pin'),
      syncGuide: (guide) => ipcRenderer.invoke('lan-sync-guide', guide),
      onState: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('lan-sync-state', listener);
        return () => ipcRenderer.removeListener('lan-sync-state', listener);
      },
    },
  } : {}),
});
