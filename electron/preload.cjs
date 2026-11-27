// 青逝痕 Tenkinoko 制作
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', Boolean(flag)),
  relaunchApp: () => ipcRenderer.invoke('app-relaunch'),
  hotUpdate: {
    getState: () => ipcRenderer.invoke('hot-update-get'),
    check: () => ipcRenderer.invoke('hot-update-check'),
    downloadUi: () => ipcRenderer.invoke('hot-update-download-ui'),
    applyRestart: () => ipcRenderer.invoke('hot-update-apply-restart'),
    confirmHealthy: () => ipcRenderer.invoke('hot-update-confirm-healthy'),
    rollback: () => ipcRenderer.invoke('hot-update-rollback'),
    openNativeDownload: () => ipcRenderer.invoke('hot-update-open-native'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('hot-update-state', listener);
      return () => ipcRenderer.removeListener('hot-update-state', listener);
    },
  },
  windowLayout: {
    getMode: () => ipcRenderer.invoke('window-layout-get'),
    setMode: (mode) => ipcRenderer.invoke('window-layout-set', mode === 'rail' ? 'rail' : mode === 'mumu-drawer' ? 'mumu-drawer' : 'wide'),
    snapToMumu: () => ipcRenderer.invoke('window-layout-snap-mumu'),
    collapseToHud: () => ipcRenderer.invoke('window-layout-collapse-mumu'),
    setAutoMumu: (enabled) => ipcRenderer.invoke('window-layout-set-auto-mumu', Boolean(enabled)),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('window-layout-state', listener);
      return () => ipcRenderer.removeListener('window-layout-state', listener);
    },
  },
  ...(process.platform === 'win32' ? {
    battleReports: {
      getState: () => ipcRenderer.invoke('battle-reports-get'),
      showDiagnostics: () => ipcRenderer.invoke('battle-reports-diagnostics'),
      setEnabled: (enabled) => ipcRenderer.invoke('battle-reports-enable', enabled),
      restart: () => ipcRenderer.invoke('battle-reports-restart'),
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
      setScale: (scale) => ipcRenderer.invoke('hud-overlay-scale', scale),
      expandDrawer: () => ipcRenderer.invoke('hud-overlay-expand-drawer'),
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
