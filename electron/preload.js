// Ponte segura entre o processo do Electron e o frontend (renderer).
// Exponha aqui só o que o frontend realmente precisa do sistema operacional.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  // ex: getAppVersion: () => ipcRenderer.invoke('get-version')
});
