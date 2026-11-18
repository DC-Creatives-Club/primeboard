import { app, BrowserWindow, dialog, Menu, net, protocol, screen, session, shell } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_URL, CONTENT_SECURITY_POLICY, allowedDownload, allowedPermission, assetPath, externalURL, isAppURL } from './security.mjs';

app.setName('Primeboard');
app.setAppUserModelId('com.squirrel.primeboard.Primeboard');
protocol.registerSchemesAsPrivileged([{
  scheme: 'primeboard', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

const webPreferences = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };
let mainWindow;

async function openExternal(value) {
  const url = externalURL(value);
  if (!url) return;
  try { await shell.openExternal(url); }
  catch { dialog.showErrorBox('Could not open link', 'Please open this link in your web browser.'); }
}

function protectWindow(window) {
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppURL(url)) return;
    event.preventDefault(); void openExternal(url);
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAppURL(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppURL(url)) {
      const reference = new BrowserWindow({
        title: 'Primeboard — Reference', width: 850, height: 650,
        backgroundColor: '#111214', webPreferences,
      });
      protectWindow(reference);
      void reference.loadURL(url);
    } else void openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}

function createWindow() {
  // Keep the initial window usable on a small Pi display as well as a desktop.
  const area = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: 'Primeboard', width: Math.min(1180, area.width), height: Math.min(900, area.height),
    minWidth: 600, minHeight: 420,
    backgroundColor: '#111214', show: false,
    icon: path.join(app.getAppPath(), 'desktop/assets/icon.png'), webPreferences,
    autoHideMenuBar: process.platform !== 'darwin',
  });
  mainWindow = window;
  protectWindow(window);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) dialog.showErrorBox('Primeboard could not start', `${description}\nPlease reopen the app or reinstall it.`);
  });
  void window.loadURL(APP_URL);
  return window;
}

function showSection(hash = '') {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  void mainWindow.loadURL(`${APP_URL}${hash}`);
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Instrument', accelerator: 'CmdOrCtrl+Home', click: () => showSection() },
      { label: 'Back', accelerator: 'Alt+Left', click: (_item, win) => {
        if (win?.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
      } },
      { type: 'separator' }, { role: 'reload' }, { role: 'resetZoom' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [
      { label: 'How to use', click: () => showSection('#how-to-use') },
      { label: 'The math', click: () => showSection('#the-math') },
      { type: 'separator' },
      { label: 'Primeboard website', click: () => openExternal('https://primeboard.jacksonwalters.com') },
      ...(process.platform === 'darwin' ? [] : [{ role: 'about' }]),
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  await app.whenReady();
  app.setAboutPanelOptions({ applicationName: 'Primeboard', applicationVersion: app.getVersion(),
    copyright: 'Jackson Walters', website: 'https://primeboard.jacksonwalters.com' });
  const root = path.join(app.getAppPath(), 'web');
  protocol.handle('primeboard', async request => {
    const file = assetPath(request.url, root);
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowedPermission(permission, origin, contents?.getURL(), details.isMainFrame));
  ses.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowedPermission(permission, details.requestingUrl, contents?.getURL(), details.isMainFrame)));
  ses.on('will-download', (event, item, contents) => {
    if (!allowedDownload(item.getURL(), contents?.getURL())) { event.preventDefault(); return; }
    item.setSaveDialogOptions({ title: 'Save from Primeboard',
      defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });
  buildMenu();
  createWindow();
}

if (squirrelStartup || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  start().catch(error => { dialog.showErrorBox('Primeboard could not start', error.message); app.quit(); });
}
