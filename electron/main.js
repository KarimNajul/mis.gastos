// Ventana de escritorio (Windows) que carga la misma app de www/.
// Los datos quedan guardados en %APPDATA%\Mis Gastos.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function crearVentana() {
  const win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 360,
    minHeight: 500,
    title: 'Mis Gastos',
    backgroundColor: '#0f766e',
    icon: path.join(__dirname, '..', 'www', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Los links externos se abren en el navegador, no dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.whenReady().then(crearVentana);
app.on('window-all-closed', () => app.quit());
