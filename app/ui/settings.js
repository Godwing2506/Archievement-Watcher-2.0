"use strict";

function settingsModule() {
  return require(require('path').join(window.appPath, 'settings.js'));
}
function userDirModule() {
  return require(require('path').join(window.appPath, 'parser/userDir.js'));
}
function blacklistModule() {
  return require(require('path').join(window.appPath, 'parser/blacklist.js'));
}
function backupModule() {
  return require(require('path').join(window.appPath, 'util/backup.js'));
}

// Watchdog functions
async function checkWatchdog(){
  return await new Promise((resolve)=>{
    try{
      const ws = new WebSocket("ws://localhost:8082");
      let resolved = false;
      const done = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(t);
        try { ws.close(); } catch (e) {}
        resolve(result);
      };
      const t = setTimeout(() => done(false), 3000);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
      ws.onclose = () => done(false);
    }catch(e){ console.error('checkWatchdog', e); resolve(false); }
  });
}

async function attemptStart(){
  const res = await window.api.watchdog.ensure();
  return !!(res && (res.started || res.pid));
}

let _ensureWatchdogPromise = null;
async function ensureWatchdogRunning(){
  if (await checkWatchdog()) return true;
  if (_ensureWatchdogPromise) return _ensureWatchdogPromise;
  
  _ensureWatchdogPromise = (async () => {
    try {
        if (await attemptStart()) {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (await checkWatchdog()) return true;
          }
      }
      return false;
    } finally {
      _ensureWatchdogPromise = null;
    }
  })();
  return _ensureWatchdogPromise;
}

let _verifierTimer = null;
let _verifierAttempts = 0;
const VERIFIER_INTERVAL_MS = 5000;
const VERIFIER_MAX_ATTEMPTS = 18;

function isWatchdogVerifierRunning() {
  return _verifierTimer !== null;
}

function stopWatchdogVerifier() {
  if (_verifierTimer) {
    clearInterval(_verifierTimer);
    _verifierTimer = null;
  }
  _verifierAttempts = 0;
}

async function syncWatchdogIndicator() {
  const ok = await checkWatchdog();
  const mainIndicator = $("#watchdog-indicator");
  if (mainIndicator.length) {
    mainIndicator.toggleClass("connected", !!ok)
      .removeClass("loading-watchdog")
      .attr("title", ok ? "Watchdog conectado" : "Watchdog desconectado (Click para reintentar)");
  }
  if (typeof app !== "undefined" && typeof app.setWatchdogStatus === "function") {
    app.setWatchdogStatus(ok);
  }
  return ok;
}

async function runWatchdogVerifierTick() {
  if (await syncWatchdogIndicator()) {
    console.log("[Watchdog] Verifier: conectado, deteniendo reintentos");
    stopWatchdogVerifier();
    if (typeof window.connectWatchdog === "function") {
      window.connectWatchdog();
    }
    return true;
  }

  _verifierAttempts += 1;
  if (_verifierAttempts > VERIFIER_MAX_ATTEMPTS) {
    console.log("[Watchdog] Verifier: máximo de intentos alcanzado");
    stopWatchdogVerifier();
    return false;
  }

  console.log(`[Watchdog] Verifier: intento ${_verifierAttempts}, activando watchdog...`);
  if (typeof app !== "undefined" && app.wsWatchdog) {
    app.wsWatchdog.spawnRequested = false;
  }
  await ensureWatchdogRunning();
  return false;
}

function startWatchdogVerifier() {
  stopWatchdogVerifier();
  runWatchdogVerifierTick();
  _verifierTimer = setInterval(() => {
    runWatchdogVerifierTick();
  }, VERIFIER_INTERVAL_MS);
}

window.ensureWatchdogRunning = ensureWatchdogRunning;
window.checkWatchdog = checkWatchdog;
window.startWatchdogVerifier = startWatchdogVerifier;
window.stopWatchdogVerifier = stopWatchdogVerifier;
window.syncWatchdogIndicator = syncWatchdogIndicator;
window.isWatchdogVerifierRunning = isWatchdogVerifierRunning;

let steamKeySaveTimeout = null;
let steamKeyDirty = false;

function mergeSteamKeyFromInput() {
  const typed = $("#steamwebapikey").val().trim();
  if (typed.length > 0) {
    app.config.steam = { apiKey: typed };
    return;
  }
  if (steamKeyDirty && app.config.steam) {
    delete app.config.steam.apiKey;
  }
}

function syncSteamKeyUi() {
  const input = $("#steamwebapikey");
  const status = $("#steamwebapikey-status");
  const key = app.config.steam && app.config.steam.apiKey ? app.config.steam.apiKey.trim() : "";
  steamKeyDirty = false;
  input.val("");
  if (key) {
    status.text("Clave guardada en este equipo. No hace falta volver a escribirla tras reiniciar el PC.");
    status.addClass("steam-key-saved");
    input.attr("placeholder", "••••••••••••••••");
  } else {
    status.text("");
    status.removeClass("steam-key-saved");
    input.attr("placeholder", "");
  }
}

function reloadSteamKeyFromDisk() {
  try {
    const fresh = settingsModule().load();
    if (!app.config.steam) app.config.steam = {};
    app.config.steam.apiKey = (fresh.steam && fresh.steam.apiKey) ? fresh.steam.apiKey : "";
  } catch (e) {
    console.warn("[SteamKey] Could not reload from disk:", e);
  }
  syncSteamKeyUi();
}

window.refreshSteamKeyFromDisk = reloadSteamKeyFromDisk;

(function($, window, document) {
  $(function() {

     async function updateWatchdogStatus(){
       const ok = await syncWatchdogIndicator();
       const el = $("#watchdog_status");
       const infoEl = $("#watchdog_start_info");

       const pid = await window.api.watchdog.getPid();

       if (ok) {
        el.text(`Watchdog activo (ws://localhost:8082) PID ${(pid && pid > 0) ? pid : 'N/A'}`);
        infoEl.text("");
      } else {
        el.text(`Watchdog inactivo`);
        if (window.watchdogStartInfo) {
          infoEl.text(window.watchdogStartInfo);
        } else {
          infoEl.text("");
        }
      }
     }
     
     window.updateWatchdogStatus = updateWatchdogStatus;

     $("#steamwebapikey").off("input.steamKey blur.steamKey").on("input.steamKey", function() {
       steamKeyDirty = true;
       clearTimeout(steamKeySaveTimeout);
       steamKeySaveTimeout = setTimeout(() => {
         persistSteamKey($(this).val().trim());
       }, 400);
     }).on("blur.steamKey", function() {
       const val = $(this).val().trim();
       if (val.length > 0) persistSteamKey(val);
     });

     function persistSteamKey(val) {
       if (val.length === 0) return;
       app.config.steam = { apiKey: val };
       try {
         settingsModule().saveSteamKey(val);
         syncSteamKeyUi();
       } catch (err) {
         console.error("[SteamKey] Save failed:", err);
         settingsModule().save(app.config).catch((e) => console.error("[SteamKey] Fallback save failed:", e));
       }
     }

     $("title-bar").on('open-settings', function(){
     
        this.inSettings = true;
        $("#settings").show();
        $("#settings .box").fadeIn();
        if (typeof syncMasterModePanel === "function") syncMasterModePanel();
        
        for (let option in app.config.achievement) {
               if ( $(`#option_${option} option[value="${app.config.achievement[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.achievement[option].toString()).change();
               }
        }
        
        for (let option in app.config.achievement_source) {
               if ( $(`#option_${option} option[value="${app.config.achievement_source[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.achievement_source[option].toString()).change();
               }
        }
        
        for (let option in app.config.notification) {
               if ( $(`#option_${option} option[value="${app.config.notification[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.notification[option].toString()).change();
               }
        }
        
        for (let option in app.config.notification_toast) {
               if ( $(`#option_${option} option[value="${app.config.notification_toast[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.notification_toast[option].toString()).change();
               }
        }
        
        for (let option in app.config.notification_transport) {
               if ( $(`#option_${option} option[value="${app.config.notification_transport[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.notification_transport[option].toString()).change();
               }
        }

        $('#option_customToastAudio').find('option[value="1"]').attr("data-file",toastAudio.getDefault());
        if ( $('#option_customToastAudio option:selected').val() == 2 ) {
          $(`#option_customToastAudio option[data-file="${toastAudio.getCustom()}"]`).prop("selected", true);
        }
        $('#option_customToastAudio').on('change', async function() {
          try{
          
              let value = $(this).val();
              if (value >= 1) {

                let filename = $(this).find(':selected').data("file");
                if (!filename || filename == '') return;
                
                const winDir = await window.api.getWinDir();
                let file = await window.api.pathJoin(winDir, "Media", filename);
                // Nota: require('path') fallará aquí tras activar contextIsolation. 
                // Se recomienda mover la lógica de audio a una utilidad que no dependa de path.
                $('#customToastAudio_sample').attr("src",file).get(0).play();
              }
            
          }catch(err){
            console.log(err);
          }
        });
        
        for (let option in app.config.souvenir_screenshot) {    
               if ( option === "custom_dir" ) {
                    $("#custom_dir_screenshot div.btn").attr("data-path",app.config.souvenir_screenshot[option].toString());
               } 
               else if ( $(`#option_${option} option[value="${app.config.souvenir_screenshot[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.souvenir_screenshot[option].toString()).change();
               }
        }
        
        for (let option in app.config.souvenir_video) {
               if ( option === "custom_dir" ) {
                    $("#custom_dir_video div.btn").attr("data-path",app.config.souvenir_video[option].toString());
               } 
               else if ( $(`#option_${option} option[value="${app.config.souvenir_video[option]}"]`).length > 0 )
               {
                    $(`#option_${option}`).val(app.config.souvenir_video[option].toString()).change();
               }
        }
        
        reloadSteamKeyFromDisk();

        $("#dirlist").empty();
        userDirModule().get()
        .then( async (userDirList) => {
          
          for (let dir of userDirList) {
            try{
              if (await userDirModule().check(dir.path)) await populateUserDirList({dir: dir.path, notify: dir.notify, reverse: true});
            }catch(err){
              //Do nothing
              console.log(err);
            }
          }
          
        }).catch( (err) => {
          //Do nothing
          console.log(err);
        });
        
        try {
          //The API used by windows-focus-assist can change/break at any time in the future.
          //const focusAssist = getFocusAssist();
          const focusAssist = { value: -1, name: "Not Supported" };
          $("#focus-assist-state span").attr("data-state",focusAssist.value).text(focusAssist.name);
          $("#focus-assist-state").hide();
        }catch(err){
          $("#focus-assist-state").hide();
          console.log(err)
        }
        
        updateWatchdogStatus();
        if (typeof window.startWatchdogVerifier === "function") {
          window.startWatchdogVerifier();
        } else {
          ensureWatchdogRunning().catch(()=>{});
        }
           
     });
     
     $("#watchdog_start").click(async function(){
       let self = $(this);
       self.css("pointer-events","none");
       const ok = await ensureWatchdogRunning();
       await updateWatchdogStatus();
       self.css("pointer-events","initial");
       if (!ok) window.api.showMessageBox({type: "error", title: "Watchdog", message: "No se pudo iniciar Watchdog", detail: "Verifica instalación o usa el instalador para habilitar el servicio"});
     });
     
     $("#watchdog_stop").click(async function(){
       let self = $(this);
       self.css("pointer-events","none");
       const ok = await window.api.watchdog.stop();
       await updateWatchdogStatus();
       self.css("pointer-events","initial");
       if (!ok) window.api.showMessageBox({type: "error", title: "Watchdog", message: "No se pudo detener Watchdog", detail: "No se encontró proceso escuchando en el puerto 8082"});
     });
     
     updateWatchdogStatus();
     
     $("#btn-settings-cancel, #settings .overlay").click(function(){
          let self = $(this);
          self.css("pointer-events","none");
          $("#settings .box").fadeOut(()=>{
            $("#settings").hide();
            let elem = $("#settingNav li").first();
            $("#settingNav li").removeClass("active");
            elem.addClass("active");
            $("#settings .box section.content").removeClass("active");
            $("#settings .box section.content[data-view='"+elem.data("view")+"']").addClass("active");
            self.css("pointer-events","initial");
            $("title-bar")[0].inSettings = false;
            $('#option_customToastAudio').off('change');
          });
       });
       
     $("#btn-settings-save").click(function(){

     let self = $(this);
     self.css("pointer-events","none");
     
        $("#options-ui .right").children("select").each(function(index) {
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.achievement[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading general settings ui");
           }
                        
        });
        
        $("#options-source .right").children("select").each(function(index) {
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.achievement_source[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading ach source settings ui");
           }
                        
        });
       
        $("#options-notify-common .right").children("select").each(function(index) {  
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.notification[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading notification common settings ui");
           }
                        
        });
        
        $("#options-notify-toast .right").children("select").each(function(index) {  
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.notification_toast[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading notification toast settings ui");
           }
                        
        });
        
        $("#options-notify-transport .right").children("select").each(function(index) {  
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.notification_transport[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading notification transport settings ui");
           }
                        
        });
        
        $("#options-souvenir-screenshot .right").children("select").each(function(index) {  
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.souvenir_screenshot[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading notification transport settings ui");
           }
                        
        });
        
        $("#options-souvenir-video .right").children("select").each(function(index) {  
                  
           try {
             if ($(this)[0].id !== "" && $(this).val() !== "") {
                 app.config.souvenir_video[$(this)[0].id.replace("option_","")] = ($(this).val() === "true") ? true : ($(this).val() === "false") ? false : $(this).val();
             }
           }catch(e){
            console.warn(e);
            console.log("error while reading notification transport settings ui");
           }
                        
        });
        
        app.config.souvenir_screenshot.custom_dir = $("#custom_dir_screenshot div.btn").attr("data-path") || "";
        app.config.souvenir_video.custom_dir = $("#custom_dir_video div.btn").attr("data-path") || "";
        
        let customToastAudio = $('#option_customToastAudio').find(':selected');
        if (customToastAudio.val() == 2) toastAudio.setCustom(customToastAudio.data("file"))
        
        mergeSteamKeyFromInput();
        const typedSteamKey = $("#steamwebapikey").val().trim();
        if (typedSteamKey.length > 0) {
          settingsModule().saveSteamKey(typedSteamKey);
        } else if (steamKeyDirty) {
          settingsModule().saveSteamKey("");
        }
        
        let userDirList = [];
        $("#dirlist > li").each(function(){

          let dir = $(this).find(".path span").text();
          let notify = ($(this).find(".controls .notify").attr("data-notify") === "true") ? true : false;
        
          userDirList.push({"path":dir,"notify":notify});
        });

        userDirModule().save(userDirList).catch((err)=>{
        
          window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error while saving user dir list", detail: `${err}`});
        
        }).finally(()=>{
        settingsModule().save(app.config).then(()=>{
        
          syncSteamKeyUi();
          $("#settings .box").fadeOut(()=>{
                self.css("pointer-events","initial");
                resetUI();
            });

          }).catch((err)=>{
              
            $("#settings .box").fadeOut(()=>{
              $("#settings").hide();
              let elem = $("#settingNav li").first();
              $("#settingNav li").removeClass("active");
              elem.addClass("active");
              $("#settings .box section.content").removeClass("active");
              $("#settings .box section.content[data-view='"+elem.data("view")+"']").addClass("active");
              self.css("pointer-events","initial");
              $("title-bar")[0].inSettings = false;
              
              window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error while writing settings to file.", detail: `${err}`});
              
            });

          });       
        
        });

     });
     
    $("#settings .arrow-list .next").click(function(){
                     let sel = $(this).parent(".right").find("select")[0];
                     let i = sel.selectedIndex;
                     sel.options[++i%sel.options.length].selected = true;
            
                     if ("createEvent" in document) {
                          let evt = document.createEvent("HTMLEvents");
                          evt.initEvent("change", false, true);
                          sel.dispatchEvent(evt);
                     } else { sel.fireEvent("onchange"); }     
     });

     $("#settings .arrow-list .previous").click(function(){
                     let sel = $(this).parent(".right").find("select")[0];
                     let i = sel.selectedIndex;
                     if (i <= 0) { i = sel.options.length }
                     sel.options[--i%sel.options.length].selected = true;
                     
                     if ("createEvent" in document) {
                          let evt = document.createEvent("HTMLEvents");
                          evt.initEvent("change", false, true);
                          sel.dispatchEvent(evt);
                     } else { sel.fireEvent("onchange"); }
     });  
     
     $("#option_lang").mouseover(function() {
        let self = $(this);
        let tooltip = self.find("option:selected").data("tooltip");
        self.attr("title",tooltip);
      });  
      
      $("#settingNav li").click(async function(){
        let self = $(this);
        self.css("pointer-events","none");
        let view = self.data("view");
        
        $("#settingNav li").removeClass("active");
        self.addClass("active");
        
        $("#settings .box section.content").removeClass("active");
        $("#settings .box section.content[data-view='"+view+"']").addClass("active");
        
        if (view === "about") {
          try {
            const version = await window.api.getVersion();
            $("#about-version").text(`Versión ${version || "?"}`);
          } catch (e) { $("#about-version").text(""); }
        }
        
        self.css("pointer-events","initial");
      });
      
      
      $("#custom_dir_screenshot div.btn").click(async function(){
        let self = $(this);
        self.css("pointer-events","none");
        
        try {
          const userProfile = await window.api.getEnv('USERPROFILE');
          const options = {
            defaultPath : app.config.souvenir_screenshot.custom_dir || userProfile,
            properties : ['openDirectory','showHiddenFiles']
          };
          let dialog = await window.api.showOpenDialog(options);
          if (dialog.filePaths.length > 0){
            $("#custom_dir_screenshot div.btn").attr("data-path",dialog.filePaths[0].toString());
            console.log(`screenshot custom folder: ${dialog.filePaths[0]}`);
          }else{
            console.log("screenshot custom folder: User Cancel");
          }
        }catch(err){
          window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error changing screenshot custom folder", detail: `${err}`});
        };
        self.css("pointer-events","initial");
      });
      
      $("#custom_dir_video div.btn").click(async function(){
        let self = $(this);
        self.css("pointer-events","none");
        
        try {
          const userProfile = await window.api.getEnv('USERPROFILE');
          const options = {
            defaultPath : app.config.souvenir_video.custom_dir || userProfile,
            properties : ['openDirectory','showHiddenFiles']
          };
          let dialog = await window.api.showOpenDialog(options);
          if (dialog.filePaths.length > 0){
            $("#custom_dir_video div.btn").attr("data-path",dialog.filePaths[0].toString());
            console.log(`video custom folder: ${dialog.filePaths[0]}`);
          }else{
            console.log("video custom folder: User Cancel");
          }
        }catch(err){
          window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error changing video custom folder", detail: `${err}`});
        };
        self.css("pointer-events","initial");
      });
      
      $("#addCustomDir").click(async function(){
        
        let self = $(this);
        self.css("pointer-events","none");
        
        try {
        
          let dialog = await window.api.showOpenDialog({properties : ['openDirectory','showHiddenFiles']});
  
          if (dialog.filePaths.length > 0){
              console.log(`Adding folder: ${dialog.filePaths}`);

              if(await userDirModule().check(dialog.filePaths[0])) {
                  await populateUserDirList({dir: dialog.filePaths[0]});
               } else {
                  console.log("-> Invalid folder");
                  window.api.showMessageBox({type: "warning",title: "Invalid folder", message: $("#settings .content[data-view='folder'] > .controls .info p").html().replace(/\s{2,}/g,"").replace(/<br>/g,"\n")});
               }
          }else{
              console.log("Adding folder: User Cancel");
          }

        }catch(err){
          window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error adding custom folder", detail: `${err}`});
        };
        
        self.css("pointer-events","initial");

      });
      
      $("#smartFind").click(async function(){
      
        let self = $(this);
        self.css("pointer-events","none");
        $("#wrap-dirlist .loading-overlay").show();
        $("#addCustomDir").css("pointer-events","none");
        $("#btn-settings-save").css("pointer-events","none");
        
        console.log("auto-finding folder(s) ...");
        
          try{
            
            // Primero intentamos las rutas estándar identificadas (RUNE, Tenoke, etc.)
            const standardPaths = await window.api.getEmuPaths();
            for (const emuPath of standardPaths) {
              if(await userDirModule().check(emuPath)) {
                console.log(`Smart Find encontró ruta estándar: ${emuPath}`);
                await populateUserDirList({dir: emuPath});
              }
            }

            // Luego continuamos con la búsqueda profunda del motor original
            for (let dir of await userDirModule().find())
            {
              console.log(`Found folder: ${dir}`);
              if(await userDirModule().check(dir)) { //redundant ?
                await populateUserDirList({dir: dir});
              } else {
                console.log("-> Invalid folder");
              } 
            }
            
          }catch(err){
            window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error while auto-finding folder(s)", detail: `${err}`});
          }
          
          self.css("pointer-events","initial");
          $("#wrap-dirlist .loading-overlay").hide();
          $("#addCustomDir").css("pointer-events","initial");
          $("#btn-settings-save").css("pointer-events","initial");
          
      });
      
      $("#blacklist_reset").click(function(){
         let self = $(this);
         self.css("pointer-events","none");
        
         blacklistModule().reset()
         .then(()=>{
                if( $("#achievement").is(":visible")) {
                  $("#btn-previous").trigger( "click" );
                }
                $("#settings").hide();
                $("#game-list ul").empty();
                $("#game-list .loading .progressBar").attr("data-percent",0);
                $("#game-list .loading .progressBar > .meter").css("width","0%");
                self.css("pointer-events","initial");
                $("#win-settings").css("pointer-events","initial");
                $("#game-list .loading").show();
                $("#user-info").css("opacity",0).css("pointer-events","none");
                $("#game-list .isEmpty").hide();
                let elem = $("#settingNav li").first();
                $("#settingNav li").removeClass("active");
                elem.addClass("active");
                $("#settings .box section.content").removeClass("active");
                $("#settings .box section.content[data-view='"+elem.data("view")+"']").addClass("active");
                console.clear();
                if (app.args.appid) app.args.appid = null;
                app.onStart();
         })
         .catch((err)=>{  
            self.css("pointer-events","initial");
            window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error while trying to reset user blacklist", detail: `${err}`});     
         });
       });

      function backupL10n(key, fallback) {
        const b = window.__backupL10n;
        return (b && b[key]) ? b[key] : fallback;
      }

      function backupErrorMessage(err) {
        const code = err && err.message ? err.message : String(err);
        if (code === 'ERR_BACKUP_INVALID') return backupL10n('errorInvalid', 'Invalid backup file.');
        if (code === 'ERR_BACKUP_VERSION') return backupL10n('errorVersion', 'Unsupported backup version.');
        if (code === 'ERR_BACKUP_NOT_FOUND') return backupL10n('errorNotFound', 'Backup file was not found.');
        if (code === 'ERR_BACKUP_WRITE_FAILED') return backupL10n('errorWrite', 'Could not write backup. Check free space and permissions.');
        return backupL10n('errorGeneric', 'Backup operation failed.') + (code ? `\n${code}` : '');
      }

      $("#btn-backup-export").click(async function () {
        const self = $(this);
        self.css("pointer-events", "none");
        try {
          const backup = backupModule();
          const downloads = await window.api.getPath("downloads");
          const defaultPath = await window.api.pathJoin(downloads, backup.defaultBackupFilename());
          const dialog = await window.api.showSaveDialog({
            title: backupL10n("exportButton", "Export backup"),
            defaultPath,
            filters: [{ name: "Achievement Watcher Backup", extensions: ["zip"] }]
          });
          if (dialog.canceled || !dialog.filePath) return;

          const result = await backup.exportBackup(dialog.filePath);
          await window.api.showMessageBox({
            type: "info",
            title: backupL10n("exportSuccessTitle", "Backup created"),
            message: backupL10n("exportSuccessMessage", "Export completed."),
            detail: `${result.stats.files} archivo(s), ${Math.ceil(result.stats.bytes / 1024)} KB`
          });
        } catch (err) {
          await window.api.showMessageBox({
            type: "error",
            title: backupL10n("errorGeneric", "Error"),
            message: backupErrorMessage(err)
          });
        } finally {
          self.css("pointer-events", "initial");
        }
      });

      $("#btn-backup-import").click(async function () {
        const self = $(this);
        self.css("pointer-events", "none");
        try {
          const dialog = await window.api.showOpenDialog({
            title: backupL10n("importButton", "Restore from file"),
            properties: ["openFile"],
            filters: [{ name: "Achievement Watcher Backup / Config", extensions: ["zip", "ini"] }]
          });
          if (dialog.canceled || !dialog.filePaths || !dialog.filePaths[0]) return;
          const filePath = dialog.filePaths[0];
          const isConfig = require("path").extname(filePath).toLowerCase() === ".ini";
          const backup = backupModule();
          if (isConfig) {
            await backup.validateConfig(filePath);
          } else {
            await backup.validateBackup(filePath);
          }
          const confirm = await window.api.showMessageBox({
            type: "warning",
            title: backupL10n("importConfirmTitle", "Restore backup?"),
            message: isConfig
              ? backupL10n("importConfigConfirmMessage", "Restore the settings from this file?")
              : backupL10n("importConfirmMessage", "Restore settings and local progress from this backup?"),
            buttons: [backupL10n("cancel", "Cancel"), backupL10n("importButton", "Restore")],
            defaultId: 0,
            cancelId: 0
          });
          if (confirm.response !== 1) return;
          if (isConfig) await backup.importConfig(filePath);
          else await backup.importBackup(filePath);
          await window.api.showMessageBox({
            type: "info",
            title: backupL10n("importSuccessTitle", "Backup restored"),
            message: backupL10n("importSuccessMessage", "Data restored. The app will reload to apply changes.")
          });
          location.reload();
        } catch (err) {
          await window.api.showMessageBox({
            type: "error",
            title: backupL10n("errorGeneric", "Error"),
            message: backupErrorMessage(err)
          });
        } finally {
          self.css("pointer-events", "initial");
        }
      });

      function syncMasterModePanel() {
        const enabled = !!(app.config.master && app.config.master.enabled);
        $("#master-mode-active").toggle(enabled);
        $("#master-mode-locked").toggle(!enabled);
      }

      syncMasterModePanel();

      $("#btn-master-mode-enable").click(function() {
        const code = ($("#master-mode-code").val() || "").trim().toLowerCase();
        const masterUnlock = require(require("path").join(window.appPath, "parser", "masterUnlock.js"));
        if (!masterUnlock.MASTER_CODES.includes(code)) {
          window.api.showMessageBox({
            type: "error",
            title: "Modo Master",
            message: "Código incorrecto."
          });
          return;
        }
        try {
          settingsModule().saveMasterMode(true);
          if (!app.config.master) app.config.master = {};
          app.config.master.enabled = true;
          syncMasterModePanel();
          $("#master-mode-code").val("");
          if (typeof window.syncMasterButtons === "function") window.syncMasterButtons();
          window.api.showMessageBox({
            type: "info",
            title: "Modo Master",
            message: "Modo Master activado."
          });
        } catch (err) {
          window.api.showMessageBox({
            type: "error",
            title: "Modo Master",
            message: "No se pudo guardar la configuración.",
            detail: String(err)
          });
        }
      });

      $("#btn-master-mode-disable").click(function() {
        const confirm = remote.dialog.showMessageBoxSync({
          type: "question",
          title: "Modo Master",
          message: "¿Desactivar modo Master?",
          buttons: ["Cancelar", "Desactivar"]
        });
        if (confirm !== 1) return;
        try {
          settingsModule().saveMasterMode(false);
          if (!app.config.master) app.config.master = {};
          app.config.master.enabled = false;
          syncMasterModePanel();
          if (typeof window.syncMasterButtons === "function") window.syncMasterButtons();
        } catch (err) {
          window.api.showMessageBox({
            type: "error",
            title: "Modo Master",
            message: String(err)
          });
        }
      });

      $("#master-mode-code").on("keydown", function(e) {
        if (e.key === "Enter") $("#btn-master-mode-enable").trigger("click");
      });
       
      $("#gntp_test").click(function(){
        let self = $(this);
        self.css("pointer-events","none");
        
            const ws = new WebSocket("ws://localhost:8082");
              ws.onerror = (err) => {
                ws.close();
                self.css("pointer-events","initial");
                window.api.showMessageBox({type: "error", title: "WebSocket Connection Error", message: "Notification Test Failure.", detail: "Error in connection establishment: net::ERR_CONNECTION_REFUSED\nIs Watchdog Running ?"});
              }

              ws.onopen = () => { 
                  ws.onmessage = (evt) => {
                    try {
                      let res = JSON.parse(evt.data);
                      if (res.cmd === 'gntp-test') {
                         if (res.success === true) {
                            ws.close();
                            self.css("pointer-events","initial");
                          }
                          else if (res.success === false && res.error) {
                            throw res.error;
                          } else {
                            throw "Unexpected response";
                          }
                      } else {
                        throw "Unexpected response";
                      }
                    }catch(err){
                       ws.close();
                       self.css("pointer-events","initial");
                       window.api.showMessageBox({type: "error", title: "Unexpected Error", message: "Notification Test Failure.", detail: `${err}`});
                    }      
                  };
               try {
                 ws.send(JSON.stringify({cmd: "gntp-test"}));
               }catch(err){
                  ws.close();
                  self.css("pointer-events","initial");
                  window.api.showMessageBox({type: "error", title: "Unexpected Error", message: "Notification Test Failure.", detail: `${err}`});
               }  
              };

      });

      // Toast test SIN pantalla negra: solo envía el toast para verlo en el escritorio
      $("#notify_test_simple").click(function(){
         let self = $(this);
         self.css("pointer-events","none");
         ensureWatchdogRunning().then((running)=>{
           if (!running) {
             self.css("pointer-events","initial");
             window.api.showMessageBox({type: "error", title: "WebSocket Connection Error", message: "No se pudo conectar al Watchdog.", detail: "¿Está en ejecución?"});
             return;
           }
           const ws = new WebSocket("ws://localhost:8082");
           ws.onerror = () => {
             ws.close();
             self.css("pointer-events","initial");
             window.api.showMessageBox({type: "error", title: "Error", message: "No se pudo conectar al Watchdog (puerto 8082).", detail: "Asegúrate de que la app haya iniciado el Watchdog."});
           };
           ws.onopen = () => {
             ws.onmessage = (evt) => {
               try {
                 let res = JSON.parse(evt.data);
                 if (res.cmd === "toast-test") {
                   ws.close();
                   self.css("pointer-events","initial");
                   if (res.success === true) {
                     window.api.showMessageBox({type: "info", title: "Notificación", message: "Toast enviado. Revisa la esquina de la pantalla o el Centro de actividades de Windows."});
                   } else {
                     window.api.showMessageBox({type: "error", title: "Toast falló", message: res.error || "Error desconocido."});
                   }
                 }
               } catch (err) {
                 ws.close();
                 self.css("pointer-events","initial");
                 window.api.showMessageBox({type: "error", title: "Error", message: String(err)});
               }
             };
             ws.send(JSON.stringify({cmd: "toast-test"}));
           };
         }).catch(() => {
           self.css("pointer-events","initial");
         });
      });
       
      $("#notify_test").click(function(){ 
         let self = $(this);
         self.css("pointer-events","none");

         ensureWatchdogRunning().then((running)=>{
           if (!running) {
             self.css("pointer-events","initial");
             window.api.showMessageBox({type: "error", title: "WebSocket Connection Error", message: "Notification Test Failure.", detail: "No se pudo conectar ni iniciar Watchdog"});
             return;
           }
           
           window.api.window.testNotification();
 
           setTimeout(()=>{
                const ws = new WebSocket("ws://localhost:8082");
                ws.onerror = (err) => {
                  ws.close();
                  window.api.showMessageBox({type: "error", title: "WebSocket Connection Error", message: "Notification Test Failure.", detail: "Error in connection establishment: net::ERR_CONNECTION_REFUSED\nIs Watchdog Running ?"});
                }
 
                ws.onopen = () => { 
                    ws.onmessage = (evt) => {
                      try {
                        let res = JSON.parse(evt.data);
                        if (res.cmd === 'toast-test') {
                           if (res.success === true) {
                              ws.close();
                            }
                            else if (res.success === false && res.error) {
                              throw res.error;
                            } else {
                              throw "Unexpected response";
                            }
                        } else {
                          throw "Unexpected response";
                        }
                      }catch(err){
                         ws.close();
                         window.api.showMessageBox({type: "error", title: "Unexpected Error", message: "Notification Test Failure.", detail: `${err}`});
                      }      
                    };
                 try {
                   ws.send(JSON.stringify({cmd: "toast-test"}));
                 }catch(err){
                    ws.close();
                    window.api.showMessageBox({type: "error", title: "Unexpected Error", message: "Notification Test Failure.", detail: `${err}`});
                 }  
                };
  
           },500);
         });
 
      });
      
      $("#option_mergeDuplicate").parent(".right").find(".previous, .next").click(function(){
         $("#option_importCache").val($("#option_mergeDuplicate").val())
      });
        
  });
}(window.jQuery, window, document)); 

async function populateUserDirList(option){

            let options = {
              dir: option.dir,
              notify: option.notify || false,
              reverse: option.reverse || false
            }
            
            let alreadyInList = false;
            const items = $("#dirlist > li").get();
            for (const item of items) {
              let dir = $(item).find(".path span").text();
              const normDir = await window.api.pathNormalize(dir);
              const normOptDir = await window.api.pathNormalize(options.dir);
              if (normDir == normOptDir) {
                alreadyInList = true;
                break;
              }
            }
            
            if (alreadyInList) {
              console.log("-> Already in list");
              return;
            }

            let template = `<li>
                <div class="path"><span>${options.dir}</span></div>
                <div class="controls">
                  <ul>
                    <li class="edit"><i class="fas fa-pen"></i></li>
                    <li class="trash"><i class="fas fa-trash-alt"></i></li>
                    ${(options.notify) ? '<li class="notify" data-notify="true"><i class="fas fa-bell"></i></li>' : '<li class="notify" data-notify="false"><i class="fas fa-bell-slash"></i></li>'}
                  </ul>
                </div>
              </li>`;
            
            if (options.reverse) {
              $("#dirlist").append(template);
            } else {
              $("#dirlist").prepend(template);
            }

            let elem = (options.reverse) ? $("#dirlist > li").last() : $("#dirlist > li").first();

            if ( elem.find(".path span").width() >= 350 || options.dir.length > 42) {
              elem.find(".path").addClass("overflow");
            }
            
            elem.find(".controls .trash").click(function(){ elem.remove() });
            elem.find(".controls .notify").click(function(){ 

                if ($(this).attr("data-notify") === "false") {
                  $(this).attr("data-notify","true").html('<i class="fas fa-bell"></i>');
                } else {
                  $(this).attr("data-notify","false").html('<i class="fas fa-bell-slash"></i>');
                }

            });
            elem.find(".controls .edit").click(function(){ 
            
              let path = elem.find(".path span").text();
            
              window.api.showOpenDialog({defaultPath: path,properties : ['openDirectory','showHiddenFiles']}).then(async (filePaths) => {

               try {
                  if (filePaths){
                    console.log(`Editing folder to: ${filePaths}`);
 
                    if (await userDirModule().check(filePaths[0]) ) {
                    
                        elem.find(".path span").text(filePaths[0]);
                        elem.find(".path").removeClass("overflow");
                        if ( elem.find(".path span").width() >= 350) {
                          elem.find(".path").addClass("overflow");
                        }
                        console.log("-> Edited");
                        
                    } else {
                      console.log("-> Invalid folder");
                      window.api.showMessageBox({type: "warning",title: "Invalid folder", message: $("#settings .content[data-view='folder'] > .controls .info p").html().replace(/\s{2,}/g,"").replace(/<br>/g,"\n")});
                    }

                  }else{
                    console.log("Editing folder: User Cancel");
                  }
                  
               }catch(err){
                  window.api.showMessageBox({type: "error",title: "Unexpected Error", message: "Error editing custom folder", detail: `${err}`});
               }   
                  
              });

            });

}
