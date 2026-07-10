'use strict';

const { 
  app, 
  BrowserWindow, 
  dialog, 
  session, 
  shell,
  ipcMain,
  Tray,
  Menu
} = require('electron');
const remote = require('@electron/remote/main');

const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const ipc = require(path.join(__dirname,"ipc.js"));

// Force cache dir to a writable location
(function setWritableCacheDir() {
  const base = process.env.APPDATA || process.env.LOCALAPPDATA || os.homedir() || '';
  const cacheDir = path.join(base, "Achievement-Watcher", "Cache");
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
  } catch (e) {
    app.commandLine.appendSwitch("disk-cache-dir", path.join(os.tmpdir(), "Achievement-Watcher-Cache"));
  }
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache", "1");
})();

try {

  const manifest = require("../package.json");

  if (app.requestSingleInstanceLock() !== true) {
    app.quit();
    process.exit(0);
  }

  // Use same folder as installer (Achievement Watcher) so options.ini and cfg are found
  const appDataDir = path.join(app.getPath('appData'), 'Achievement Watcher');
  const oldUserDataDir = path.join(app.getPath('appData'), 'Achievement-Watcher');
  app.setPath('userData', appDataDir);

  // Migrate from old folder (Achievement-Watcher) so user keeps Steam key and config
  try {
    fs.mkdirSync(path.join(appDataDir, 'cfg'), { recursive: true });
    const oldCfg = path.join(oldUserDataDir, 'cfg', 'options.ini');
    const newCfg = path.join(appDataDir, 'cfg', 'options.ini');
    if (fs.existsSync(oldCfg)) {
      fs.copyFileSync(oldCfg, newCfg);
    }
    const oldUserDirDb = path.join(oldUserDataDir, 'cfg', 'userdir.db');
    const newUserDirDb = path.join(appDataDir, 'cfg', 'userdir.db');
    if (fs.existsSync(oldUserDirDb)) {
      fs.copyFileSync(oldUserDirDb, newUserDirDb);
    }
  } catch (e) { console.error('Migration config/userdir', e); }

  if (manifest.config["disable-gpu"]) app.disableHardwareAcceleration();
  if (manifest.config.appid) app.setAppUserModelId(manifest.config.appid);
  
  let MainWin = null;
  let tray = null;
  let forceQuit = false;
  
  app.on('ready', async function(){
    try {
    if (!remote.isInitialized()) remote.initialize();
    const userData = app.getPath('userData');
    try {
      fs.mkdirSync(path.join(userData, "logs"), { recursive: true });
      fs.mkdirSync(path.join(userData, "cfg"), { recursive: true });
    } catch (e) {}

    const configWindow = manifest.config && manifest.config.window;
    if (!configWindow) throw new Error('package.json config.window is missing');
    let options = Object.assign({}, configWindow);
    options.webPreferences = {
        devTools: !!manifest.config.debug,
        nodeIntegration: true,
        contextIsolation: false,
        webviewTag: false,
        v8CacheOptions: (manifest.config.debug) ? "none" : "code",
        sandbox: false,
        preload: path.join(__dirname, 'preload.js')
    };
    
    //electron 9 crash if no icon exists to specified path
    const iconRel = (configWindow && configWindow.icon) ? configWindow.icon : 'resources/icon/icon.png';
    try{
      const iconPath = path.join(__dirname, "..", iconRel);
      if (typeof iconPath === 'string' && fs.existsSync(iconPath)) {
        fs.accessSync(iconPath, fs.constants.F_OK);
        options.icon = iconPath;
      } else {
        delete options.icon;
      }
    }catch{
      delete options.icon;
    }

    MainWin = new BrowserWindow(options);
    remote.enable(MainWin.webContents);

    //Frameless
    if (options.frame === false) MainWin.isFrameless = true;
    
    //Tray icon
    const trayIconPath = path.join(__dirname, "..", iconRel);
    if (typeof trayIconPath === 'string' && fs.existsSync(trayIconPath)) {
      tray = new Tray(trayIconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Mostrar Aplicación', click: () => { MainWin.show(); } },
        { label: 'Salir', click: () => { forceQuit = true; app.quit(); } }
      ]);
      tray.setToolTip(manifest.name);
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => {
        MainWin.show();
      });
    }

    //Debug tool
    if (manifest.config.debug) {
      MainWin.webContents.openDevTools({mode: "undocked"});
      MainWin.isDev = true;
      console.info((({node,electron,chrome })=>({node,electron,chrome}))(process.versions));
      try {
        const { default: contextMenu } = await import('electron-context-menu');
        contextMenu({
			append: (defaultActions, params, browserWindow) => [
				{
					label: 'Reload', visible: params, click: () => { MainWin.reload() }
				}
			]
        });
      }catch(err){
        dialog.showMessageBoxSync({type: "warning",title: "Context Menu", message: "Failed to initialize context menu.", detail: `${err}`});
      }
    }

    //User agent
    MainWin.webContents.userAgent = manifest.config["user-agent"];
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = manifest.config["user-agent"];
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    //External open links
    const openExternal = function(event, url) {
      if (!url.startsWith("file:///")) {
        event.preventDefault();
        shell.openExternal(url).catch(()=>{});
      }
    };
    MainWin.webContents.on('will-navigate', openExternal); //a href
    MainWin.webContents.on('new-window', openExternal); //a href target="_blank"
    
    // Capturar errores del renderer en la consola de la terminal
    ipcMain.on('error-message', (event, error) => {
      console.error("Renderer Error:", error);
    });

    //enable ipc
    ipc.window(MainWin);

    // Función auxiliar para obtener el PID del Watchdog
    const getWatchdogPid = () => {
      return new Promise((resolve) => {
        const ps = cp.spawn("powershell", ["-NoProfile", "-Command", "(Get-NetTCPConnection -LocalPort 8082 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess)"]);
        let out = "";
        ps.stdout.on("data", (d) => { out += d.toString(); });
        ps.on("close", () => {
          const pid = parseInt(out.trim(), 10);
          resolve(Number.isFinite(pid) ? pid : null);
        });
      });
    };

    // Manejadores IPC para la API expuesta en preload.js
    ipcMain.handle('app:getAppPath', () => app.getAppPath());
    ipcMain.handle('app:getPath', (event, name) => app.getPath(name));
    ipcMain.handle('app:getVersion', () => {
      const manifest = require("../package.json");
      return manifest.version;
    });
    ipcMain.handle('app:getWinDir', () => process.env['WINDIR']);
    ipcMain.handle('app:getEnv', (event, name) => process.env[name]);
    ipcMain.handle('app:isDev', () => manifest.config.debug || false);

    // Utilidades de ruta
    ipcMain.handle('path:join', (event, ...args) => path.join(...args));
    ipcMain.handle('path:normalize', (event, p) => path.normalize(p));

    // Lectura de archivos JSON (para l10n y esquemas)
    ipcMain.handle('fs:readJson', async (event, filePath) => {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    });

    // Obtener rutas estándar de emuladores para Smart Find
    ipcMain.handle('app:getEmuPaths', () => {
      const appData = app.getPath('appData');
      const publicDir = process.env.PUBLIC || path.join(process.env.SystemRoot || "C:\\Windows", "..", "Users", "Public");
      
      const paths = [
        path.join(appData, "Goldberg SteamEmu Saves"),
        path.join(publicDir, "Documents", "Steam", "RUNE"),
        path.join(publicDir, "Documents", "Steam", "CODEX"),
        path.join(publicDir, "Documents", "Steam", "Tenoke")
      ];
      return paths.filter(p => fs.existsSync(p));
    });

    ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
    ipcMain.handle('shell:showItemInFolder', (event, path) => shell.showItemInFolder(path));

    ipcMain.handle('dialog:showOpenDialog', (event, options) => dialog.showOpenDialog(MainWin, options));
    ipcMain.handle('dialog:showMessageBox', (event, options) => dialog.showMessageBox(MainWin, options));

    ipcMain.on('window:minimize', () => { if (MainWin) MainWin.minimize(); });
    ipcMain.on('window:maximize', () => { if (MainWin) MainWin.maximize(); });
    ipcMain.on('window:unmaximize', () => { if (MainWin) MainWin.unmaximize(); });
    ipcMain.on('window:close', () => { if (MainWin) MainWin.close(); });
    ipcMain.handle('window:isMaximized', () => MainWin ? MainWin.isMaximized() : false);

    // Lógica de gestión del Watchdog (migrada desde settings.js)
    ipcMain.handle('watchdog:getPid', async () => await getWatchdogPid());

    ipcMain.handle('watchdog:start', async () => {
      const appRoot = app.getAppPath();
      const baseDir = app.isPackaged ? path.join(appRoot, "..") : path.join(appRoot, "..");
      
      // Intentar modo NW o Node según el entorno
      const trySpawn = (bin, args, cwd) => {
        if (!fs.existsSync(bin)) return false;
        try {
          const stat = fs.statSync(bin);
          if (!stat.isFile()) return false;
        } catch (e) {
          return false;
        }
        try {
          const proc = cp.spawn(bin, args, { cwd, stdio: "ignore", detached: true, windowsHide: true, env: { ...process.env, NODE_SKIP_PLATFORM_CHECK: "1", ELECTRON_RUN_AS_NODE: "1" } });
          proc.on('error', () => {});
          proc.unref();
          return true;
        } catch (e) {
          return false;
        }
      };

      // Lógica de búsqueda de binarios simplificada para el Main Process
      const paths = [
        { bin: path.join(baseDir, "nw", "nw.exe"), args: ["-config", "watchdog.json"], cwd: path.join(baseDir, "nw") },
        { bin: path.join(baseDir, "node", "node.exe"), args: [path.join(baseDir, "service", "watchdog", "watchdog.js")], cwd: path.join(baseDir, "service", "watchdog") },
        { bin: "node", args: [path.join(baseDir, "service", "watchdog", "watchdog.js")], cwd: path.join(baseDir, "service", "watchdog") }
      ];

      for (const p of paths) {
        if (trySpawn(p.bin, p.args, p.cwd)) return true;
      }
      return false;
    });

    ipcMain.handle('watchdog:stop', async () => {
      const pid = await getWatchdogPid();
      if (pid) {
        cp.spawn("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`]);
        return true;
      }
      return false;
    });

    // Manejo de la ventana de prueba de notificaciones
    ipcMain.on('window:test-notification', () => {
      let dummy = new BrowserWindow({ frame: false, backgroundColor: "#000000", fullscreen: true });
      setTimeout(() => {
        if (dummy && !dummy.isDestroyed()) dummy.close();
      }, 7000);
    });

    MainWin.loadFile(manifest.config.window.view);

    MainWin.once('ready-to-show', () => {
      if (MainWin && !MainWin.isDestroyed()) {
        MainWin.show();
        MainWin.focus();
      }
    });

    ipcMain.handleOnce('components-loaded', () => {
      if (MainWin && !MainWin.isDestroyed()) {
        MainWin.show();
        MainWin.focus();
      }
    });

    const hasTray = () => tray && !tray.isDestroyed();
    MainWin.on('close', (event) => {
      if (!forceQuit) {
        if (hasTray()) {
          event.preventDefault();
          MainWin.hide();
        }
      }
    });

    MainWin.on('closed', () => {
      MainWin = null
    });

    } catch (err) {
      dialog.showErrorBox('Achievement Watcher', `Failed to start:\n${err.message || err}`);
      app.quit();
    }
  })
  .on('window-all-closed', function() {
      if (process.platform !== 'darwin') {
        app.quit();
      }
  })
  .on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, url) => {
        event.preventDefault();
      });
   })
   .on('second-instance', (event, argv, cwd) => {
    if (MainWin) {
      if (MainWin.isMinimized()) MainWin.restore();
      MainWin.focus();
    }
  });

}catch(err) {
  dialog.showErrorBox("Critical Error", `Failed to initialize:\n${err}`);
  app.quit();
}