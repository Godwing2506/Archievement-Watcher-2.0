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
const net = require("net");
const ipc = require(path.join(__dirname,"ipc.js"));
const achWatcher = require(path.join(__dirname,"achWatcher.js"));

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

    // Backup achievement watcher (independent from the Watchdog service)
    achWatcher.init((msg) => {
      if (MainWin && !MainWin.isDestroyed()) MainWin.webContents.send('achievements-changed', msg);
    });
    ipcMain.handle('achwatch:set', (event, games) => achWatcher.setTargets(games));

    // Watchdog liveness: cheap TCP probe on 8082 + PID reported by the renderer's WebSocket ping/pong.
    // netstat is only used as a last resort when we need a PID to kill a stale process.
    let watchdogPidCache = { pid: null, at: 0 };
    let lastPongPid = null;
    ipcMain.on('watchdog:pong', (event, pid) => { if (Number.isFinite(+pid)) lastPongPid = +pid; });
    const probePort = () => new Promise((resolve) => {
      const sock = net.connect({ port: 8082, host: '127.0.0.1' });
      const done = (ok) => { try { sock.destroy(); } catch (e) {} resolve(ok); };
      sock.setTimeout(400, () => done(false));
      sock.once('connect', () => done(true));
      sock.once('error', () => done(false));
    });
    const netstatPid = () => new Promise((resolve) => {
      try {
        cp.exec(`netstat -ano | findstr :8082`, { windowsHide: true }, (err, stdout) => {
          if (err || !stdout) return resolve(null);
          const line = stdout.split('\r\n').find(l => l.includes(':8082') && (l.includes('LISTENING') || l.includes('ESCUCHANDO')));
          if (!line) return resolve(null);
          const pid = parseInt(line.trim().split(/\s+/).pop(), 10);
          resolve(Number.isFinite(pid) ? pid : null);
        });
      } catch (e) { resolve(null); }
    });
    // Returns a truthy value (PID if known, otherwise -1) when the Watchdog is listening, null otherwise
    const getWatchdogPid = async () => {
      const now = Date.now();
      if (now - watchdogPidCache.at < 400) return watchdogPidCache.pid;
      const alive = await probePort();
      const pid = alive ? (lastPongPid || -1) : null;
      if (!alive) lastPongPid = null;
      watchdogPidCache = { pid, at: now };
      return pid;
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
      
      let paths = [
        path.join(appData, "Goldberg SteamEmu Saves"),
        path.join(publicDir, "Documents", "Steam", "RUNE"),
        path.join(publicDir, "Documents", "Steam", "CODEX"),
        path.join(publicDir, "Documents", "Steam", "Tenoke")
      ];
      try { paths = paths.concat(require(path.join(__dirname, "..", "parser", "emulators.js")).allRoots()); } catch (e) { /* ignore */ }
      paths = [...new Set(paths)];
      return paths.filter(p => fs.existsSync(p));
    });

    ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
    ipcMain.handle('shell:showItemInFolder', (event, path) => shell.showItemInFolder(path));

    ipcMain.handle('dialog:showOpenDialog', (event, options) => dialog.showOpenDialog(MainWin, options));
    ipcMain.handle('dialog:showSaveDialog', (event, options) => dialog.showSaveDialog(MainWin, options));
    ipcMain.handle('dialog:showMessageBox', (event, options) => dialog.showMessageBox(MainWin, options));

    ipcMain.on('window:minimize', () => { if (MainWin) MainWin.minimize(); });
    ipcMain.on('window:maximize', () => { if (MainWin) MainWin.maximize(); });
    ipcMain.on('window:unmaximize', () => { if (MainWin) MainWin.unmaximize(); });
    ipcMain.on('window:close', () => { if (MainWin) MainWin.close(); });
    ipcMain.handle('window:isMaximized', () => MainWin ? MainWin.isMaximized() : false);

    // Lógica de gestión del Watchdog (migrada desde settings.js)
    ipcMain.handle('watchdog:getPid', async () => await getWatchdogPid());

    // Helper: kill anything listening on port 8082 and clean up single-instance pipe
    const killPort8082 = async () => {
      let pid = await getWatchdogPid();
      if (pid === -1) pid = await netstatPid();
      if (pid) {
        logMain(`[Watchdog] Puerto 8082 ocupado por PID ${pid}. Intentando terminar...`);
        await new Promise((resolve) => {
          cp.exec(`taskkill /F /T /PID ${pid}`, { windowsHide: true }, () => resolve());
        });
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 400));
          watchdogPidCache = { pid: null, at: 0 };
          const stillThere = await getWatchdogPid();
          if (!stillThere) break;
        }
      }
      try {
        fs.unlinkSync('\\\\.\\pipe\\Achievement Watchdog-sock');
      } catch (e) {}
      watchdogPidCache = { pid: null, at: 0 };
      return true;
    };

    // Logger para empaquetado (console.log no se ve en .exe)
    const mainLogFile = path.join(app.getPath('userData'), 'logs', 'main.log');
    const logMain = (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      try { fs.appendFileSync(mainLogFile, line); } catch (e) {}
      if (manifest.config.debug) console.log(msg);
    };

    const resolveWatchdogPaths = () => {
      const appRoot = app.getAppPath();
      const baseDir = app.isPackaged ? path.join(appRoot, "..", "..") : path.join(appRoot, "..");
      const relParts = app.isPackaged ? ["watchdog", "watchdog.js"] : ["service", "watchdog", "watchdog.js"];
      const watchdogScript = path.join(baseDir, ...relParts);
      return {
        appRoot,
        baseDir,
        watchdogScript,
        watchdogCwd: path.dirname(watchdogScript)
      };
    };

    const candidateExists = (bin) => {
      if (bin === "node") return !app.isPackaged;
      return fs.existsSync(bin);
    };

    let spawnWatchdogPromise = null;

    const spawnAndVerify = (bin, args, cwd, extraEnv = {}) => {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        try {
          const logFile = path.join(app.getPath('userData'), 'logs', 'watchdog.log');
          const out = fs.openSync(logFile, 'a');
          const err = fs.openSync(logFile, 'a');
          const proc = cp.spawn(bin, args, {
            cwd,
            stdio: ['ignore', out, err],
            detached: true,
            windowsHide: true,
            env: { ...process.env, NODE_SKIP_PLATFORM_CHECK: "1", ...extraEnv }
          });
          proc.on('error', (e) => {
            logMain('[Watchdog] Spawn error for ' + bin + ': ' + e.message);
            finish({ ok: false, pid: null });
          });
          proc.on('exit', (code) => {
            logMain('[Watchdog] Process exited with code ' + code + ' for ' + bin);
            // The spawned process is the Watchdog itself, so any exit before the port opens is a failure.
            finish({ ok: false, pid: null });
          });
          proc.unref();
          logMain('[Watchdog] Spawned PID: ' + proc.pid + ' using ' + bin);

          (async () => {
            for (let i = 0; i < 40; i++) {
              if (settled) return;
              const pid = await getWatchdogPid();
              if (pid) {
                logMain('[Watchdog] Port 8082 listening (PID ' + pid + ') via ' + bin);
                finish({ ok: true, pid });
                return;
              }
              await new Promise(r => setTimeout(r, 500));
            }
            if (!settled) {
              logMain('[Watchdog] Timed out waiting for port 8082 from ' + bin);
              finish({ ok: false, pid: proc.pid });
            }
          })();
        } catch (e) {
          logMain('[Watchdog] Exception spawning ' + bin + ': ' + e.message);
          finish({ ok: false, pid: null });
        }
      });
    };

    const isStartupLaunch = () => {
      if (process.argv.some((a) => /--startup/i.test(String(a)))) return true;
      try { return os.uptime() < 180; } catch (e) { return false; }
    };

    const getWatchdogStartupDelay = () => {
      if (isStartupLaunch()) return 10000;
      try {
        if (os.uptime() < 300) return 4000;
      } catch (e) { /* ignore */ }
      return 500;
    };

    const ensureWatchdogWithRetries = async (reason) => {
      const existing = await getWatchdogPid();
      if (existing) {
        logMain('[Watchdog] Already running (PID ' + existing + ') [' + reason + ']');
        return true;
      }
      const initialDelay = getWatchdogStartupDelay();
      if (initialDelay > 0) {
        logMain('[Watchdog] Waiting ' + initialDelay + 'ms before spawn [' + reason + ']');
        await new Promise((r) => setTimeout(r, initialDelay));
      }
      const maxAttempts = isStartupLaunch() ? 10 : 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const running = await getWatchdogPid();
        if (running) return true;
        const ok = await doSpawnWatchdog();
        if (ok) {
          logMain('[Watchdog] Started on attempt ' + attempt + ' [' + reason + ']');
          return true;
        }
        const waitMs = Math.min(15000, 2500 * attempt);
        logMain('[Watchdog] Attempt ' + attempt + '/' + maxAttempts + ' failed, retry in ' + waitMs + 'ms [' + reason + ']');
        await new Promise((r) => setTimeout(r, waitMs));
      }
      logMain('[Watchdog] Failed after retries [' + reason + ']');
      return false;
    };

    let watchdogBackgroundTimer = null;
    const startWatchdogBackgroundLoop = () => {
      if (watchdogBackgroundTimer) return;
      let tries = 0;
      watchdogBackgroundTimer = setInterval(async () => {
        tries++;
        if (tries > 24) {
          clearInterval(watchdogBackgroundTimer);
          watchdogBackgroundTimer = null;
          return;
        }
        const pid = await getWatchdogPid();
        if (pid) {
          clearInterval(watchdogBackgroundTimer);
          watchdogBackgroundTimer = null;
          return;
        }
        await ensureWatchdogWithRetries('background-' + tries);
      }, 15000);
    };

    const doSpawnWatchdog = async () => {
      if (spawnWatchdogPromise) return spawnWatchdogPromise;

      spawnWatchdogPromise = (async () => {
      const { appRoot, baseDir, watchdogScript, watchdogCwd } = resolveWatchdogPaths();

      logMain('[Watchdog] appRoot: ' + appRoot);
      logMain('[Watchdog] baseDir: ' + baseDir);
      logMain('[Watchdog] script: ' + watchdogScript);
      logMain('[Watchdog] cwd: ' + watchdogCwd);

      if (!fs.existsSync(watchdogScript)) {
        logMain('[Watchdog] ERROR: No se encuentra el script en ' + watchdogScript);
        return false;
      }

      const existingPid = await getWatchdogPid();
      if (existingPid) {
        logMain('[Watchdog] Already listening on port 8082 (PID ' + existingPid + ')');
        return true;
      }

      await killPort8082();

      const candidates = [
        { bin: path.join(baseDir, "node", "node.exe"), args: [watchdogScript], cwd: watchdogCwd, env: {} },
      ];

      if (!app.isPackaged) {
        candidates.push({ bin: "node", args: [watchdogScript], cwd: watchdogCwd, env: {} });
      }

      for (const c of candidates) {
        logMain('[Watchdog] Trying candidate: ' + c.bin + ' exists? ' + candidateExists(c.bin));
        if (!candidateExists(c.bin)) continue;
        const result = await spawnAndVerify(c.bin, c.args, c.cwd, c.env);
        if (result.ok) {
          logMain('[Watchdog] Successfully started with PID ' + result.pid + ' using ' + c.bin);
          return true;
        }
        logMain('[Watchdog] Candidate ' + c.bin + ' failed, trying next...');
      }

      logMain('[Watchdog] All spawn attempts failed');
      return false;
      })().finally(() => {
        spawnWatchdogPromise = null;
      });

      return spawnWatchdogPromise;
    };

    ipcMain.handle('watchdog:start', async () => doSpawnWatchdog());

    ipcMain.handle('watchdog:stop', async () => {
      let pid = await getWatchdogPid();
      if (pid === -1) pid = await netstatPid();
      if (pid) {
        cp.spawn("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`]);
        return true;
      }
      return false;
    });

    // Auto-start watchdog when app is ready (ensures notifications work)
    ipcMain.handle('watchdog:ensure', async () => {
      const pid = await getWatchdogPid();
      if (pid) return { started: false, pid };
      const ok = await ensureWatchdogWithRetries('ipc-ensure');
      return { started: ok, pid: ok ? await getWatchdogPid() : null };
    });

    // Manejo de la ventana de prueba de notificaciones
    ipcMain.on('window:test-notification', () => {
      let dummy = new BrowserWindow({ frame: false, backgroundColor: "#000000", fullscreen: true });
      setTimeout(() => {
        if (dummy && !dummy.isDestroyed()) dummy.close();
      }, 7000);
    });

    MainWin.loadFile(manifest.config.window.view);

    setTimeout(() => {
      ensureWatchdogWithRetries('app-ready').catch(() => {});
      startWatchdogBackgroundLoop();
    }, 1500);

    MainWin.once('ready-to-show', () => {
      if (MainWin && !MainWin.isDestroyed()) {
        MainWin.show();
        MainWin.focus();
      }
    });

    ipcMain.handle('components-loaded', async () => {
      if (MainWin && !MainWin.isDestroyed()) {
        MainWin.show();
        if (!MainWin.isMinimized()) MainWin.focus();
      }
      await ensureWatchdogWithRetries('components-loaded');
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