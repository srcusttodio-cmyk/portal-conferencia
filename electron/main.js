// Processo principal do Electron (equivalente ao "backend/servidor" do app desktop).
// Aqui ficam: criação da janela, integração com o sistema operacional,
// leitura/escrita de arquivos locais, etc. NÃO deve conter lógica de negócio da UI.

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
