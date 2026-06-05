const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  downloadClip: (clipData) => ipcRenderer.invoke('download-clip', clipData),
  cancelClipDownload: (clipId) => ipcRenderer.invoke('cancel-download', clipId),
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
});
