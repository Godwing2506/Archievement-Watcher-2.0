"use strict";

const { ipcRenderer } = require("electron");
const os = require('os');
const path = require('path');
const args_split = require('argv-split');
const args = require('minimist');
const moment = require('moment');
const humanizeDuration = require("humanize-duration");
const appPath = window.appPath;
const settings = require(path.join(appPath,"settings.js"));
const achievements = require(path.join(appPath,"parser/achievements.js"));
const steam = require(path.join(appPath,"parser/steam.js"));
const blacklist = require(path.join(appPath,"parser/blacklist.js"));
const userDir = require(path.join(appPath,"parser/userDir.js"));
const PlaytimeTracking = require(path.join(appPath,"parser/playtime.js"));
const masterUnlockMod = require(path.join(appPath,"parser/masterUnlock.js"));
const l10n = window.l10n;
const debug = new (require("@xan105/log"))({
  console: ipcRenderer.sendSync("win-isDev") || false,
  file: path.join(remote.app.getPath('userData'),`logs/${remote.app.name}.log`)
});

var app = {
  args: getArgs(remote.process.argv),
  config : settings.load(),
  errorExit: function(err, message = "An unexpected error has occured"){
       remote.dialog.showMessageBoxSync({type: "error", title: "Unexpected Error", message: `${message}`, detail: `${err}`});
       remote.app.quit();
  },
  isMasterModeEnabled: function() {
    return !!(this.config && this.config.master && this.config.master.enabled);
  },
  masterUnlock: async function(gameOrNames, namesMaybe) {
    let game = gameOrNames;
    let names = namesMaybe;
    if (Array.isArray(gameOrNames) || typeof gameOrNames === "string") {
      names = Array.isArray(gameOrNames) ? gameOrNames : [gameOrNames];
      game = $("#achievement .wrapper > .header").data("currentGame");
    }
    if (!this.isMasterModeEnabled()) {
      throw new Error("Modo Master no está activado. Ve a Ajustes → Depurar.");
    }
    if (!game) throw new Error("Abre un juego primero.");
    if (!names || names.length === 0) {
      names = masterUnlockMod.getLockedNames(game);
    }
    const lang = (this.config && this.config.achievement && this.config.achievement.lang) || "latam";
    const result = await masterUnlockMod.unlock(game, names, lang);
    await this.refreshCurrentGame(names.length === 1 ? names[0] : null);
    return result;
  },
  onStart : function(){

   let self = this;

   try {
     self.config = settings.load();
     if (typeof window.refreshSteamKeyFromDisk === "function") {
       window.refreshSteamKeyFromDisk();
     }
   } catch (e) {
     debug.log("Config reload warning:", e);
   }
   
   const hasSteamKey = !!(self.config.steam && self.config.steam.apiKey && self.config.steam.apiKey.trim());
   debug.log(`App loading... Steam API key=${hasSteamKey ? "SET" : "MISSING"}`);
   
   // Notificar inicio y disparar watchdog inmediatamente vía IPC directo
   ipcRenderer.invoke('components-loaded').catch((e) => {
     debug.log('Error disparando components-loaded:', e);
   });
   
   app.wsWatchdog = { reconnectInterval: 3000, ensurePending: false, spawnRequested: false, failedConnects: 0, healthTimer: null };
   
   // Update UI status and allow manual start on click
   app.setWatchdogStatus = function(isConnected) {
     const mainIndicator = $("#watchdog-indicator");
     if (mainIndicator && mainIndicator.length) {
       mainIndicator.toggleClass("connected", !!isConnected)
                     .removeClass("loading-watchdog")
                     .attr("title", isConnected ? "Watchdog conectado" : "Watchdog desconectado (Click para reintentar)");
     }
   };

   $(document).on('click', '#watchdog-indicator', function() {
     if (!$(this).hasClass('connected')) {
       $(this).addClass("loading-watchdog");
       debug.log("Iniciando watchdog manualmente (verifier)...");
       if (typeof window.startWatchdogVerifier === 'function') {
         window.startWatchdogVerifier();
       } else {
         startWatchdogIfNeeded();
       }
     }
   });
   
   function scheduleWatchdogReconnect() {
     if (app.wsWatchdog.reconnectTimer) return;
     app.wsWatchdog.reconnectTimer = setTimeout(() => {
       app.wsWatchdog.reconnectTimer = null;
       connectWatchdog();
     }, app.wsWatchdog.reconnectInterval);
   }

   function startWatchdogHealthLoop() {
     if (app.wsWatchdog.healthTimer) clearInterval(app.wsWatchdog.healthTimer);
     app.wsWatchdog.healthTimer = setInterval(() => {
       const connected = $("#watchdog-indicator").hasClass("connected");
       if (!connected && typeof window.isWatchdogVerifierRunning === "function" && !window.isWatchdogVerifierRunning()) {
         debug.log("Watchdog health check: not connected, restarting verifier...");
         if (typeof window.startWatchdogVerifier === "function") {
           window.startWatchdogVerifier();
         } else {
           startWatchdogIfNeeded();
           connectWatchdog();
         }
       }
     }, 30000);
   }

   function startWatchdogIfNeeded() {
     if (app.wsWatchdog.spawnRequested) return;
     app.wsWatchdog.spawnRequested = true;
     ipcRenderer.invoke('watchdog:ensure')
       .then((res) => {
         debug.log(`Watchdog ensure: started=${res?.started} pid=${res?.pid ?? 'N/A'}`);
         setTimeout(connectWatchdog, 1000);
       })
       .catch((err) => {
         debug.log('Error en watchdog:ensure:', err);
         app.setWatchdogStatus?.(false);
       })
       .finally(() => {
         setTimeout(() => { app.wsWatchdog.spawnRequested = false; }, 4000);
       });
   }
   function refreshGameFromWatchdog(appID, achName) {
     if (!app.gameList || app.gameList.length === 0) return;
     const game = app.gameList.find(g => String(g.appid) === String(appID));
     if (!game) return;
     achievements.refreshAchievements(game, self.config).then((refreshed) => {
       if (!refreshed) return;
       const percent = game.achievement.total > 0 ? Math.round(100 * game.achievement.unlocked / game.achievement.total) : 0;
       const box = $(`#game-list .game-box[data-appid="${game.appid}"]`);
       if (box.length) {
         box.find(".progressBar").attr("data-percent", percent).find(".meter").css("width", percent + "%");
         box.find(".achievement-count").text(`${game.achievement.unlocked}/${game.achievement.total}`);
       }
       const progress_cache = app.gameList.map(g => g.achievement.total > 0 ? Math.round((100 * g.achievement.unlocked) / g.achievement.total) : 0);
       const avg = progress_cache.length > 0 ? Math.floor(progress_cache.reduce((a, c) => a + c, 0) / progress_cache.length) : 0;
       $("#user-info .info .stats li:eq(2) span.data").text(avg);
       $("#user-info .info .stats li:eq(1) span.data").text(app.gameList.filter(g => g.achievement.unlocked == g.achievement.total).length);
       $("#user-info .info .stats li:eq(0) span.data").text(app.gameList.filter(g => g.achievement.unlocked > 0).reduce((acc, curr) => acc + parseInt(curr.achievement.unlocked), 0));
       const currentGame = $("#achievement .wrapper > .header").data("currentGame");
       if (currentGame && String(currentGame.appid) === String(appID) && $("#achievement").is(":visible")) {
         app.renderAchievementList(game, percent, achName);
       }
     }).catch((err) => { debug.log('refreshGameFromWatchdog', err); });
   }
   function connectWatchdog() {
      try {
        if (app.wsWatchdog.socket) {
          try {
            if (app.wsWatchdog.socket.readyState === WebSocket.OPEN) return;
            app.wsWatchdog.socket.close();
          } catch (e) { debug.log('ws close previous', e); }
          app.wsWatchdog.socket = null;
        }
        const ws = new WebSocket("ws://127.0.0.1:8082");
        app.wsWatchdog.socket = ws;
        ws.onopen = () => { 
          app.wsWatchdog.failedConnects = 0;
          app.setWatchdogStatus?.(true);
          if (typeof window.stopWatchdogVerifier === "function") {
            window.stopWatchdogVerifier();
          }
          if (app.wsWatchdog.reconnectTimer) { clearTimeout(app.wsWatchdog.reconnectTimer); app.wsWatchdog.reconnectTimer = null; } 
          debug.log('Watchdog WebSocket connected');
        };
       ws.onclose = () => { 
         if (app.wsWatchdog.socket === ws) app.wsWatchdog.socket = null;
         app.setWatchdogStatus?.(false); 
         try { ws.close(); } catch (e) { debug.log('ws close', e); } 
         scheduleWatchdogReconnect();
       };
       ws.onerror = () => { 
         debug.log('Watchdog WebSocket error, will retry connection...');
         try { ws.close(); } catch (e) { debug.log('ws error close', e); } 
         app.wsWatchdog.failedConnects += 1;
         if (app.wsWatchdog.failedConnects >= 2) {
           if (typeof window.startWatchdogVerifier === "function") {
             window.startWatchdogVerifier();
           } else {
             startWatchdogIfNeeded();
           }
           app.wsWatchdog.failedConnects = 0;
         }
         scheduleWatchdogReconnect();
       };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const appID = String(msg.appID || msg.appid || "");
            const achName = msg.achievement || msg.achievementName || "";
            if (appID) {
              refreshGameFromWatchdog(appID, achName);
            }
          } catch (e) { debug.log('ws message parse', e); }
        };
      } catch (e) { debug.log('connectWatchdog', e); }
    }
 
    window.connectWatchdog = connectWatchdog;
    startWatchdogHealthLoop();
    if (typeof window.startWatchdogVerifier === "function") {
      window.startWatchdogVerifier();
    } else {
      startWatchdogIfNeeded();
      setTimeout(connectWatchdog, 2000);
    }

    $("#btn-add-manual").click(async function() {
      // Use a simple prompt pattern since electron-prompt is not installed
      // We can use a small hidden div for this
      if ($("#manual-add-overlay").length === 0) {
        $("body").append(`
          <div id="manual-add-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1b2838;padding:30px;border-radius:8px;border:1px solid #2d455f;width:400px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
              <h3 style="margin-top:0;color:#fff;font-family:'Raleway-Bold';">Añadir juego manualmente</h3>
              <p style="color:#aebad0;font-size:14px;">Introduce el AppID de Steam del juego:</p>
              <input type="number" id="manual-appid-input" style="width:100%;padding:10px;background:rgba(0,0,0,0.2);border:1px solid #2d455f;color:#fff;margin-bottom:20px;border-radius:4px;" placeholder="Ej: 3419520">
              <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="btn-manual-cancel" style="padding:8px 20px;background:transparent;border:1px solid #2d455f;color:#aebad0;cursor:pointer;border-radius:4px;">Cancelar</button>
                <button id="btn-manual-confirm" style="padding:8px 20px;background:#66c0f4;border:none;color:#1b2838;cursor:pointer;font-family:'Open-Sans-Bold';border-radius:4px;">Añadir</button>
              </div>
            </div>
          </div>
        `);
        $("#btn-manual-cancel").click(() => $("#manual-add-overlay").hide());
        $("#btn-manual-confirm").click(async function() {
          const appid = $("#manual-appid-input").val().trim();
          if (!appid) return;
          $("#manual-add-overlay").hide();
          try {
            await steam.getGameData({
              appID: appid, 
              lang: app.config.achievement.lang, 
              key: (app.config.steam && app.config.steam.apiKey) ? app.config.steam.apiKey : '',
              autoTranslate: app.config.achievement.autoTranslate 
            });
            app.onStart(); 
          } catch (e) {
            remote.dialog.showErrorBox('Error', `No se pudo añadir el juego: ${e}`);
          }
        });
      }
      $("#manual-appid-input").val("");
      $("#manual-add-overlay").css("display", "flex").show();
      $("#manual-appid-input").focus();
    });

   $("title-bar")[0].inSettings = true;
   
   l10n.load(self.config.achievement.lang).then((locale)=>{
      moment.locale(locale);
   }).catch((err)=>{
      debug.log(err);
      app.errorExit(err,"Error loading lang.");
   });

   $("#user-info .info .name").text(os.userInfo().username || "User");
   // create hidden editable input for manual display name
   if ($("#user-info .info .name-edit").length === 0) {
     $("#user-info .info .name").after('<input class="name-edit" type="text" style="display:none;width:250px;margin-left:8px;padding:4px;border-radius:4px;border:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.25);color:#fff;" />');
   }
   // allow user to click avatar or name to edit their display name
   $(document).on('click', '#user-info .avatar, #user-info .info .name', function(){
     const nameSpan = $("#user-info .info .name");
     const input = $("#user-info .info .name-edit");
     input.val(nameSpan.text()).show().focus();
     nameSpan.hide();
     input.off('blur').on('blur', function(){
       const v = $(this).val().trim();
       if (v) {
         nameSpan.text(v);
         nameSpan.data('manual', true);
       }
       $(this).hide();
       nameSpan.show();
     });
     input.off('keydown').on('keydown', function(e){
       if (e.key === 'Enter') $(this).blur();
       if (e.key === 'Escape') { $(this).hide(); nameSpan.show(); }
     });
   });

   function updateDisplayNameFromSteam(list) {
     const apiKey = self.config.steam && self.config.steam.apiKey ? self.config.steam.apiKey.trim() : "";
     if (!apiKey) return;
     for (let i = 0; i < list.length; i++) {
       const g = list[i];
       if (g && g.data && g.data.type === "steamAPI" && g.data.userID && g.data.userID.id) {
         steam.getSteamProfileName(apiKey, String(g.data.userID.id)).then(function (personaname) {
          // only set name from Steam if the user has not manually edited it
          const nameSpan = $("#user-info .info .name");
          if (personaname && !nameSpan.data('manual')) nameSpan.text(personaname);
         }).catch(function () {});
         return;
       }
     }
   }

   let loadingElem = {
      elem: $("#game-list .loading"),
      progress: $("#game-list .loading .progressBar"),
      meter: $("#game-list .loading .progressBar > .meter")
   };
  
   $("#user-info .info .stats li:eq(0) span.data").text("0");
   $("#user-info .info .stats li:eq(1) span.data").text("0");
   $("#user-info .info .stats li:eq(2) span.data").text("0");
   
   $("#search-bar input[type=search]").val("").change().blur();
   
   setTimeout(() => {
   achievements.makeList(self.config,(percent)=>{
   
      loadingElem.progress.attr("data-percent",percent);
      loadingElem.meter.css("width",percent + "%");
     }).then((list) => {

      loadingElem.elem.hide();

      if (list.length == 0) {
        debug.log("No game found !");
        $("#game-list .isEmpty").show();
        return;
      }

      updateDisplayNameFromSteam(list);

      debug.log("Populating game list ...");

      let elem = $("#game-list ul");
      
      elem.empty();
      
      let progress_cache = [];

      for (let game in list) {

        if ( list[game].achievement.unlocked > 0 || self.config.achievement.hideZero == false) {
        
        let progress = list[game].achievement.total === 0 ? 0 : Math.round((100 * list[game].achievement.unlocked) / list[game].achievement.total);
        
        progress_cache.push(progress);
       
        let timeMostRecent = Math.max.apply(Math,list[game].achievement.list.filter(ach => ach.Achieved && ach.UnlockTime > 0).map((ach) => { return ach.UnlockTime }));
        
        let portrait = self.config.achievement.thumbnailPortrait;

        (portrait) ? $("#game-list").addClass("view-portrait") : $("#game-list").removeClass("view-portrait");
             
        let isPlatinum = (progress === 100);

        let template = `
            <li>
                <div class="game-box${isPlatinum ? ' platinum' : ''}" data-index="${game}" data-appid="${list[game].appid}" data-time="${(timeMostRecent > 0) ? timeMostRecent : 0}" ${(list[game].system) ? `data-system="${list[game].system}"` : ''}>
                  <div class="loading-overlay"><div class="content"><i class="fas fa-spinner fa-spin"></i></div></div>
                  ${(portrait && list[game].img.portrait) ? `<div class="header glow" style="background: url('${list[game].img.portrait}');">` : `<div class="header" style="background: url('${list[game].img.header}');">`}
                  </div>
                  <div class="info">
                       ${isPlatinum ? `<div class="plat-icon"><i class="fas fa-trophy"></i></div>` : ''}
                       <div class="title"></div>
                       <div class="progressBar" data-percent="${progress}"><span class="meter" style="width:${progress}%"></span></div>
                       <div class="achievement-count">${list[game].achievement.unlocked}/${list[game].achievement.total}</div>
                       ${(list[game].source) ? `<div class="source">${list[game].source}</div>`: ''}
                  </div>
                </div>
            </li>
            `;

         elem.append(template);
         elem.find('li').last().find('.info .title').text(list[game].name || '');

         }

      }
      
      let average_progress = (progress_cache.length > 0) ? Math.floor(progress_cache.reduce((acc, curr) => ( acc + curr )) / progress_cache.length) : 0;
      
      $("#user-info .info .stats li:eq(2) span.data").text(average_progress);
      
      $("#user-info .info .stats li:eq(1) span.data").text(list.filter( game => game.achievement.unlocked == game.achievement.total ).length);
      
      $("#user-info .info .stats li:eq(0) span.data").text(list.filter( game => game.achievement.unlocked > 0).reduce((acc, curr) => { return acc + parseInt(curr.achievement.unlocked) }, 0));

      if ($('#game-list .game-box[data-system="playstation"]').length > 0) {
      
         $("#user-info .info .trophy li.platinum span").text(list.filter( game => game.system === "playstation").reduce((acc, curr) => { return acc + curr.achievement.list.filter( ach => ach.Achieved && ach.type === "P").length }, 0));
         
         $("#user-info .info .trophy li.gold span").text(list.filter( game => game.system === "playstation").reduce((acc, curr) => { return acc + curr.achievement.list.filter( ach => ach.Achieved && ach.type === "G").length }, 0));
         
         $("#user-info .info .trophy li.silver span").text(list.filter( game => game.system === "playstation").reduce((acc, curr) => { return acc + curr.achievement.list.filter( ach => ach.Achieved && ach.type === "S").length }, 0));
         
         $("#user-info .info .trophy li.bronze span").text(list.filter( game => game.system === "playstation").reduce((acc, curr) => { return acc + curr.achievement.list.filter( ach => ach.Achieved && ach.type === "B").length }, 0));
         
          $("#user-info .info .trophy").show();
      
      } else {
        $("#user-info .info .trophy").hide();
      }

      app.gameList = list;
      $("#game-list .game-box").click(function(){ self.onGameBoxClick($(this),list) });
      
      $("#game-list .game-box").contextmenu(function(e) { 
         e.preventDefault();
         let self = $(this);
         let appid = self.data("appid");

         const { Menu, MenuItem, nativeImage } = remote;
         const menu = new Menu();
         menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/cross.png")), label: $("#game-list").attr("data-contextMenu0"), click() { 
          try{
            blacklist.add(appid);
            app.onStart();
          }catch(err){
            remote.dialog.showMessageBoxSync({type: "error", title: "Unexpected Error", message: `Failed to add item to user blacklist`, detail: `${err}`});
          }
         } }));
          
         if (!self.data("system")) //Steam only
         {
           menu.append(new MenuItem({ label: "Actualizar logros", async click() {
             const game = list.find(g => g.appid == appid && list.indexOf(g) == self.data("index"));
             if (game && game.data && (game.data.type === "file" || game.data.type === "cached" || game.data.type === "steamAPI")) {
               const refreshed = await achievements.refreshAchievements(game, app.config);
               if (refreshed) {
                 const idx = list.indexOf(game);
                 const box = $(`#game-list .game-box[data-appid="${appid}"][data-index="${idx}"]`);
                 const percent = game.achievement.total > 0 ? Math.round(100 * game.achievement.unlocked / game.achievement.total) : 0;
                 if (box.length) { box.find(".progressBar").attr("data-percent", percent).find(".meter").css("width", percent + "%"); box.find(".achievement-count").text(`${game.achievement.unlocked}/${game.achievement.total}`); }

                 game.notifyToast = (game.data && (game.data.type === "steamAPI" || game.data.type === "file" || game.data.type === "cached" || game.data.type === "lumaplay")) ? (game.data.type === "steamAPI" ? "steam" : "emu") : "no";

                 const progress_cache = list.map(g => g.achievement.total > 0 ? Math.round(100 * g.achievement.unlocked / g.achievement.total) : 0);
                 const avg = progress_cache.length > 0 ? Math.floor(progress_cache.reduce((a,c)=>a+c) / progress_cache.length) : 0;
                 $("#user-info .info .stats li:eq(2) span.data").text(avg);
                 $("#user-info .info .stats li:eq(1) span.data").text(list.filter(g => g.achievement.unlocked == g.achievement.total).length);
                 $("#user-info .info .stats li:eq(0) span.data").text(list.filter(g => g.achievement.unlocked > 0).reduce((acc,curr)=>acc+parseInt(curr.achievement.unlocked),0));
                 if ($("#achievement").is(":visible") && $("#achievement .wrapper > .header").data("currentGame") === game) app.renderAchievementList(game);
               }
             }
           } }));
           menu.append(new MenuItem({type: 'separator'}));
           menu.append(new MenuItem({label: "Reset playtime and last played", async click() { 
             self.css("pointer-events","none");
             await PlaytimeTracking.reset(appid).catch((err)=>{debug.error(err)});
             self.css("pointer-events","initial");
           } }));
           menu.append(new MenuItem({type: 'separator'}));

           if (app.config.notification_advanced.iconPrefetch){
                menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/image.png")), label: $("#game-list").attr("data-contextMenu1"), async click() { 
                  self.css("pointer-events","none");
                  self.addClass("wait");
                  try{
                  
                    const request = require('request-zero');
                    const cache = path.join(remote.app.getPath('userData'),`steam_cache/icon/${appid}`);
                  
                    for (let achievement of list.find(game => game.appid == appid).achievement.list)
                    {
                      await Promise.all([
                          request.download(achievement.icon,cache),
                          request.download(achievement.icongray,cache)
                      ]).catch(()=>{});
                    }
                   }catch(err){
                    remote.dialog.showMessageBoxSync({type: "error", title: "Unexpected Error", message: `Failed to build icon cache`, detail: `${err}`});
                   }
                   self.removeClass("wait");
                   self.css("pointer-events","initial");
                } }));
            } 

            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/file-text.png")), label: "Generate achievements.json for Goldberg Emu", async click() { 
                  self.css("pointer-events","none");
                  try{
                    const request = require('request-zero');
                    const ffs = require("@xan105/fs");
                    
                    let dialog = await remote.dialog.showSaveDialog(remote.getCurrentWindow(),{ 
                      title: "Choose where to generate achievements.json",
                      buttonLabel: "Generate",
                      defaultPath: "achievements.json",
                      properties: ['showHiddenFiles', 'dontAddToRecent']
                    });
                    
                    self.addClass("wait");
                    
                    if (dialog.filePath.length > 0){
                      const filePath = dialog.filePath;
                      const dir = path.parse(filePath).dir;
                      const achievements = list.find(game => game.appid == appid).achievement.list;
 
                      let result = [];
                      
                      for (let achievement of achievements)
                      {
                        try{
                          let icons = await Promise.all([
                              request.download(achievement.icon,path.join(dir,"images")),
                              request.download(achievement.icongray,path.join(dir,"images"))
                          ]);
                          result.push({
                            description: achievement.description || "",
                            displayName: achievement.displayName,
                            hidden: achievement.hidden,
                            icon: "images/" + path.parse(icons[0].path).base,
                            icongray: "images/" + path.parse(icons[1].path).base,
                            name: achievement.name
                          });
                        }catch{
                          result.push({
                            description: achievement.description || "",
                            displayName: achievement.displayName,
                            hidden: achievement.hidden,
                            name: achievement.name
                          });
                        }
                      }
                      
                      if (result.length > 0){
                         await ffs.writeFile(filePath,JSON.stringify(result, null, 2));
                      }
                      
                    }

                  }catch(err){
                    remote.dialog.showMessageBoxSync({type: "error", title: "Unexpected Error", message: `Failed to generate achievements.json`, detail: `${err}`});
                  }
                  self.removeClass("wait");
                  self.css("pointer-events","initial");
            } })); 

            menu.append(new MenuItem({type: 'separator'}));
            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/globe.png")), label: "Steam", click() {remote.shell.openExternal(`https://store.steampowered.com/app/${appid}/`)} }));
            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/globe.png")), label: "SteamDB", click() {remote.shell.openExternal(`https://steamdb.info/app/${appid}/`)} }));
            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/globe.png")), label: "PCGamingWiki", click() {remote.shell.openExternal(`https://pcgamingwiki.com/api/appid.php?appid=${appid}`)} }));
            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/globe.png")), label: "API (Achievement schema)", click() {remote.shell.openExternal(`https://api.xan105.com/steam/ach/${appid}?lang=${app.config.achievement.lang}`)} }));
            menu.append(new MenuItem({ icon: nativeImage.createFromPath(path.join(appPath,"resources/img/globe.png")), label: "API (App info)", click() {remote.shell.openExternal(`https://api.xan105.com/v2/steam/appinfo/${appid}`)} }));
          }

         menu.popup({ window: remote.getCurrentWindow() });
         
       });
      
      if (self.args.appid) $(`#game-list .game-box[data-appid="${self.args.appid.toString().replace(/[^\d]/g, '')}"]`).first().trigger("click");

      sort(elem,sortOptions());
     }).catch((err) => {
      loadingElem.elem.hide();
      $("#game-list .isEmpty").show();
      debug.error("Game list generation failure: " + (err && (err.message || err)));
      window.api.showMessageBox({type: "error", title: "Unexpected Error", message: "Game list generation failure", detail: `${err}`});
     }).finally(() => {
      $("#user-info").fadeTo('fast', 1).css("pointer-events","initial");
      if (typeof window.updateWatchdogStatus === 'function') {
        window.updateWatchdogStatus().catch(() => {});
      }
      $("#sort-box").fadeTo('fast', 1).css("pointer-events","initial");
      $("#search-bar").fadeTo('fast', 1).css("pointer-events","initial");
      $("title-bar")[0].inSettings = false;
   });
   }, 300);

  },
  renderAchievementList: function(game, percentFromBox, highlightAchievementName){
    const percent = (percentFromBox !== undefined && percentFromBox !== null) ? percentFromBox : (game.achievement.total > 0 ? Math.round(100 * game.achievement.unlocked / game.achievement.total) : 0);
    $("#achievement .wrapper > .header .stats .counter").attr("data-count", game.achievement.unlocked).attr("data-max", game.achievement.total).attr("data-percent", percent);
    if (game.system === "playstation") {
      $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.platinum span').text(game.achievement.list.filter(ach => ach.Achieved && ach.type === "P").length);
      $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.gold span').text(game.achievement.list.filter(ach => ach.Achieved && ach.type === "G").length);
      $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.silver span').text(game.achievement.list.filter(ach => ach.Achieved && ach.type === "S").length);
      $('#achievement .wrapper > .header[data-system="playstation"] .trophy li.bronze span').text(game.achievement.list.filter(ach => ach.Achieved && ach.type === "B").length);
    }
    let unlock = $("#unlock ul");
    let lock = $("#lock ul");
    unlock.empty();
    lock.empty();
    let hidden_counter = 0;
    let i = 0;
    for (let achievement of game.achievement.list) {
      const pct = (achievement.MaxProgress > 0) ? Math.floor((achievement.CurProgress / achievement.MaxProgress) * 100) : '0';
      let template = `
        <li>
          <div class="achievement" data-name="${achievement.name}" data-index="${i}">
            <div class="box">
              <div class="glow mask contain"><div class="glow mask ray "><div class="glow fx"></div></div></div>
              <div class="icon" style="background: url('${achievement.Achieved ? achievement.icon : achievement.icongray}');"></div>
            </div>
            <div class="content">
              <div class="title">${game.system === "playstation" ? `<i class="fas fa-trophy" data-type="${achievement.type}"></i> ${achievement.displayName}` : achievement.displayName}</div>
              <div class="description">${achievement.description || ''}</div>
              <div class="progressBar" data-current="${achievement.CurProgress || '0'}" data-max="${achievement.MaxProgress || '0'}" data-percent="${pct}"><span class="meter" style="width:${pct}%"></span></div>
            </div>
            <div class="stats">
              <div class="time" data-time="${achievement.UnlockTime}"><i class="fas fa-clock"></i> <span>${moment.unix(achievement.UnlockTime).format('L LT')}</span><span>${moment.unix(achievement.UnlockTime).fromNow()}</span></div>
              <div class="community"><i class="fab fa-steam"></i> <span class="data">--</span>% ${$("#achievement .achievements").data("lang-globalStat")}</div>
            </div>
          </div>
        </li>`;
      if (achievement.Achieved) {
        unlock.append(template);
        i += 1;
      } else {
        if (achievement.hidden == 1 && !app.config.achievement.showHidden) {
          hidden_counter += 1;
          $(template).appendTo(lock).addClass("hidden");
        } else {
          const masterOn = app.isMasterModeEnabled && app.isMasterModeEnabled()
            && game.data && game.data.type === "file"
            && game.system !== "playstation" && game.system !== "uplay";
          if (masterOn) {
            lock.append(template.replace('class="achievement"', 'class="achievement master-clickable" title="Clic para desbloquear (Modo Master)"'));
          } else {
            lock.append(template);
          }
          i += 1;
        }
      }
    }
    if ($("#unlock > .header .sort-ach .sort.time").hasClass("show") && localStorage.sortAchByTime === "true") {
      $("#unlock > .header .sort-ach .sort.time").trigger("click");
    }
    const count_unlocked = game.achievement.list.filter(elem => elem.Achieved).length;
    const count_locked = game.achievement.list.length - count_unlocked;
    $("#unlock .header .title").attr("data-count", count_unlocked);
    $("#lock .header .title").attr("data-count", count_locked);
    if (count_unlocked == 0) {
      unlock.append(`<li><div class="notice"><p>${$("#unlock").data("lang-noneUnlocked")} <i class="fas fa-frown-open"></i> ${$("#unlock").data("lang-play")}</p><p>⚠️ Why is nothing unlocking ? please kindly read the "FAQ / Troubleshoot" section of the <a href="https://github.com/xan105/Achievement-Watcher/wiki" target="_blank">Wiki</a>.</p></div></li>`);
    }
    if (count_locked == 0) $("#lock").hide(); else $("#lock").show();
    if (hidden_counter > 0) {
      lock.append(`<li id="hidden-disclaimer"><div class="achievement"><div class="icon"><i class="fas fa-plus" data-remaining="${hidden_counter}"></i></div><div class="content"><div class="title">${hidden_counter} ${$("#lock").data("lang-title")}</div><div class="description">${$("#lock").data("lang-message")}</div></div><div class="show-hidden"><div id="btn-show-hidden">${$("#lock").data("lang-hidden")}</div></div></div></li>`);
      $("#btn-show-hidden").off("click").click(function(){ $(this).css("pointer-events","none"); $("#lock ul li.hidden").insertAfter("#hidden-disclaimer"); $("#hidden-disclaimer").fadeOut(400, function(){ $("#lock ul li:not(#hidden-disclaimer)").fadeIn(800); }); });
    }
    if (game.system) $(".achievement .stats .community").hide();
    else { $(".achievement .stats .community").show(); getSteamGlobalStat(game.appid); }
    if (highlightAchievementName) {
      const target = $(`#unlock .achievement[data-name="${String(highlightAchievementName).replace(/["'<>]/g, "")}"]`).parent("li");
      if (target.length) { target.addClass("highlight"); target[0].scrollIntoView({ behavior: "smooth", block: "nearest" }); setTimeout(() => target.removeClass("highlight"), 3000); }
    }
    const idx = app.gameList && app.gameList.indexOf(game);
    if (app.gameList && idx >= 0) {
      const box = $(`#game-list .game-box[data-appid="${game.appid}"][data-index="${idx}"]`);
      if (box.length) {
        box.find(".progressBar").attr("data-percent", percent).find(".meter").css("width", percent + "%");
        box.find(".achievement-count").text(`${game.achievement.unlocked}/${game.achievement.total}`);
      }
    }
    if (app.gameList) {
      const list = app.gameList;
      const progress_cache = list.map(g => g.achievement.total > 0 ? Math.round(100 * g.achievement.unlocked / g.achievement.total) : 0);
      const avg = progress_cache.length > 0 ? Math.floor(progress_cache.reduce((a, c) => a + c) / progress_cache.length) : 0;
      $("#user-info .info .stats li:eq(2) span.data").text(avg);
      $("#user-info .info .stats li:eq(1) span.data").text(list.filter(g => g.achievement.unlocked == g.achievement.total).length);
      $("#user-info .info .stats li:eq(0) span.data").text(list.filter(g => g.achievement.unlocked > 0).reduce((acc, curr) => acc + parseInt(curr.achievement.unlocked), 0));
    }
  },
  refreshCurrentGame: async function(newlyUnlockedName){
    const game = $("#achievement .wrapper > .header").data("currentGame");
    if (!game || !game.appid || game.system === "playstation" || game.system === "uplay") return;
    if (!game.data || (game.data.type !== "file" && game.data.type !== "cached" && game.data.type !== "steamAPI" && game.data.type !== "lumaplay")) return;
    const btn = $("#btn-refresh-ach");
    if (btn.length) btn.addClass("refreshing").css("pointer-events","none");
    try {
      const refreshed = await achievements.refreshAchievements(game, app.config);
      if (refreshed) app.renderAchievementList(game, null, newlyUnlockedName);
    } finally {
      if (btn.length) setTimeout(() => { btn.removeClass("refreshing").css("pointer-events",""); }, 800);
    }
  },
  setWatchdogStatus: function(connected) {
    const el = $("#watchdog-indicator");
    if (el.length) {
      el.toggleClass("connected", !!connected).attr("title", connected ? "Watchdog conectado" : "Watchdog desconectado");
      debug.log(`Watchdog status UI updated: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    } else {
      debug.log('Watchdog status UI element NOT FOUND');
    }
  },
  onGameBoxClick: function(self,list){
        self.css("pointer-events","none");

        let game = list.find( elem => elem.appid == self.data("appid") && list.indexOf(elem) == self.data("index"));

        if (self.data('time') > 0) $("#unlock > .header .sort-ach .sort.time").addClass("show");
        
        $("#search-bar-float input[type=search]").val("").blur().removeClass("has"); //reset
        
        $("#home").fadeOut(function() {
            
            if(game.img.background) {

              if (game.system === "uplay" || game.img?.overlay === true) {
                let gradient = `linear-gradient(to bottom right, rgba(0, 47, 75, .8), rgba(35, 54, 78, 0.9))`;
                $("body").fadeIn().attr("style",`background: ${gradient}, url('${game.img.background}')`);
              } else {
                $("body").fadeIn().css("background",`url('${game.img.background}')`);
              }
              
            } else {
              $("body").fadeIn().css("background",`url('../resources/img/ach_background.jpg')`);
            }
            
            if (game.system) {
              $("#achievement .wrapper > .header").attr("data-system",game.system);
            } else {
              $("#achievement .wrapper > .header").removeAttr("data-system");
            }
            
            if(game.img.icon) {
              $("#achievement .wrapper > .header .title .icon").css("background",`url('${game.img.icon}')`);
            }

            $("#achievement .wrapper > .header .title span").text(game.name);
            
            // Platinum Label in Header
            const platLabel = $("#achievement .wrapper > .header .platinum-label");
            if (game.achievement.total > 0 && game.achievement.unlocked === game.achievement.total) {
              if (platLabel.length === 0) {
                $("#achievement .wrapper > .header .title").after('<div class="platinum-label"><i class="fas fa-certificate"></i> 100% PLATINADO</div>');
              } else {
                platLabel.show();
              }
            } else if (platLabel.length) {
              platLabel.hide();
            }

            $('#achievement .wrapper > .header .playtime').hide();
            $('#achievement .wrapper > .header .lastplayed').hide();
            const notifyStatus = $('#achievement .wrapper > .header .notify-status');
            notifyStatus.show();
            if (game.notifyToast === "steam") {
              notifyStatus.removeClass("no").addClass("yes").find("span").text("Toast: Sí (Steam)");
              notifyStatus.attr("title", "Recibirás notificación al desbloquear (polling ~60 s). Requiere: recarga la lista al menos una vez; perfil Steam con «Datos del juego» en Público. Si no llega, revisa %APPDATA%\\Achievement Watcher\\logs.");
            } else if (game.notifyToast === "emu") {
              notifyStatus.removeClass("no").addClass("yes").find("span").text("Toast: Sí (emulador)");
              notifyStatus.attr("title", "El Watchdog vigila la carpeta de guardado; verás notificación al desbloquear.");
            } else {
              notifyStatus.removeClass("yes").addClass("no").find("span").text("Toast: No");
              notifyStatus.attr("title", "Este juego no está en la lista de notificaciones. Steam oficial: recarga la lista. Emulador: añade la carpeta en Ajustes con «Notificar».");
            }
            if (game.system === "playstation" || game.system === "uplay") notifyStatus.hide();
            $("#achievement .wrapper > .header").data("currentGame", game);
            if (game.system === "playstation" || game.system === "uplay") { $("#btn-reset-track").hide(); $("#btn-refresh-ach").hide(); $("#btn-master-unlock").hide(); } else { $("#btn-reset-track").show(); $("#btn-refresh-ach").show(); if (typeof window.syncMasterButtons === "function") window.syncMasterButtons(); }
            if (game.system !== "playstation" && game.system !== "uplay"){
              PlaytimeTracking(game.appid).then(({playtime, lastplayed})=>{
                if(playtime > 0) {
                  let humanized;
                  if ( playtime < 60 ) {
                    humanized = moment.duration(playtime,'seconds').humanize();
                  } else if (playtime >= 86400){
                    humanized = humanizeDuration(playtime * 1000, { language: moment.locale(), fallbacks: ["en"], units: ["h", "m"], round: true }) + " (~ " + moment.duration(playtime,'seconds').humanize() + ")";
                  } else {
                    humanized = humanizeDuration(playtime * 1000, { language: moment.locale(), fallbacks: ["en"], units: ["h", "m"], round: true });
                  }
                  $('#achievement .wrapper > .header .playtime span').text(`${humanized}`);
                  $('#achievement .wrapper > .header .playtime').css("display","inline-block");
                }
                
                if(lastplayed > 0){
                  $('#achievement .wrapper > .header .lastplayed span').text(`${moment.unix(lastplayed).format('ll')}`);
                  $('#achievement .wrapper > .header .lastplayed').css("display","inline-block");
                }
              }).catch((err)=>{debug.error(err)});
            }
            
            $("#unlock > .header .sort-ach .sort.time").removeClass("active");
            app.renderAchievementList(game, self.find(".progressBar").data("percent"));

            let elem = $("#achievement .achievement-list ul > li");
            elem.removeClass("highlight");

            $("#achievement").fadeIn(600,function() {
              if(app.args.appid && app.args.name) {
                  let target = elem.find(`.achievement[data-name="${app.args.name.toString().replace(/<\/?[^>]+>/gi, '')}"]`).parent("li");
                  target.addClass("highlight");
                  
                  let pos = (target.offset().top + $(this).scrollTop()) - target.outerHeight(true);

                  $(this).animate({
                    scrollTop:(pos)
                  }, 250, 'swing');
              }
            
                self.css("pointer-events","initial");
            });
        });
      }
};

(function($, window, document) {
  $(function() {
  
      try {
        
        app.onStart();

        remote.app.on('second-instance', (event, argv, cwd) => {
          app.args = getArgs(argv);
          if (app.args.appid) {
            app.onStart();  
          }    
        });
      
      }catch(err) {
        debug.log(err);
        app.errorExit(err);
      }

  });
}(window.jQuery, window, document)); 

function getArgs(argv){

  if(argv[1]){
    if (argv[1].includes("ach:")) {
     argv[1] = argv[1].replace("ach:","");
     argv = args_split(argv[1]);
    }
  }

  return args(argv);
}
