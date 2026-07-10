"use strict";

function getSteamGlobalStat(appid) {

   $.ajax({ 
      url: `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`,
      dataType: 'json',
      ContentType: 'json',
      type: 'GET',
      cache: true,
      timeout: 5000,
      beforeSend: ()=>{},
      success: (data) => { 
        for (const globalStat of data.achievementpercentages.achievements) {      
           
           const percent = Math.round(globalStat.percent * 10) / 10;
           if(percent > 100) percent = 100;
        
           const elem = $(`#achievement li .achievement[data-name="${globalStat.name}"]`);
           
           elem.find(".stats .community span.data").text(percent);
           
           if(percent >= 0 && percent <= 10) { elem.addClass("rare") }
 
        }
        $(".ach-toolbar-sort .sort.percentage, .achievement-list > .header .sort-ach .sort.percentage").addClass("show");
      },
      error: ()=>{},
      complete: ()=>{}
   });
   
}

(function($, window, document) {
  $(function() {
  
     $(document).mouseup(function(e){
          if(e.which === 4) {
            if( $("#achievement").is(":visible")) {
              $("#btn-previous").trigger( "click" );
            } 
          } 
      });
      
      $("#btn-previous").click(function(){
        let self = $(this);
        self.css("pointer-events","none");
        
        if(app.args.name) app.args.name = null;
        
        $("#achievement").fadeOut(500,function() {
            setTimeout(()=>{  
              $("body").removeAttr("style");
              $(".achievement-list > .header .sort-ach .sort, .ach-toolbar-sort .sort").removeClass("show active");
              $("#home").fadeIn(500,function() {
                  self.css("pointer-events","initial");
              });
            }, 300);
        }).scrollTop(0);
    });

    $("#btn-refresh-ach").click(async function(){
      await app.refreshCurrentGame(null);
    });

    function syncMasterButtons() {
      const enabled = typeof app.isMasterModeEnabled === "function" && app.isMasterModeEnabled();
      const game = $("#achievement .header").data("currentGame");
      const canUse = enabled && game && game.data && game.data.type === "file"
        && game.system !== "playstation" && game.system !== "uplay";
      $("#btn-master-unlock").toggle(!!canUse);
    }

    const path = require("path");
    const appRoot = typeof appPath !== "undefined" ? appPath : window.appPath;

    $("#btn-master-unlock").click(async function() {
      if (!app.isMasterModeEnabled || !app.isMasterModeEnabled()) return;
      const game = $("#achievement .header").data("currentGame");
      if (!game) return;
      const masterUnlock = require(path.join(appRoot, "parser", "masterUnlock.js"));
      const locked = masterUnlock.getLockedNames(game);
      if (locked.length === 0) {
        remote.dialog.showMessageBoxSync({ type: "info", title: "Modo Master", message: "Ya tienes todos los logros desbloqueados." });
        return;
      }
      const confirm = remote.dialog.showMessageBoxSync({
        type: "warning",
        title: "Modo Master",
        message: `¿Desbloquear ${locked.length} logro(s) restante(s) de «${game.name}»?`,
        detail: "Se modificarán los archivos del emulador en disco. Cierra el juego antes de continuar.",
        buttons: ["Cancelar", "Desbloquear todos"]
      });
      if (confirm !== 1) return;
      try {
        await app.masterUnlock(game, locked);
        remote.dialog.showMessageBoxSync({ type: "info", title: "Modo Master", message: `${locked.length} logro(s) desbloqueado(s).` });
      } catch (err) {
        remote.dialog.showMessageBoxSync({ type: "error", title: "Modo Master", message: "No se pudo desbloquear.", detail: String(err) });
      }
    });

    $(document).on("click", "#lock .achievement.master-clickable", async function() {
      if (!app.isMasterModeEnabled || !app.isMasterModeEnabled()) return;
      const game = $("#achievement .header").data("currentGame");
      if (!game) return;
      const name = $(this).data("name");
      const displayName = $(this).find(".title").first().text().trim() || name;
      const confirm = remote.dialog.showMessageBoxSync({
        type: "question",
        title: "Modo Master",
        message: `¿Desbloquear «${displayName}»?`,
        buttons: ["Cancelar", "Desbloquear"]
      });
      if (confirm !== 1) return;
      try {
        await app.masterUnlock(game, [name]);
      } catch (err) {
        remote.dialog.showMessageBoxSync({ type: "error", title: "Modo Master", message: "No se pudo desbloquear.", detail: String(err) });
      }
    });

    window.syncMasterButtons = syncMasterButtons;
    
    $("#btn-reset-track").click(async function(){
      const game = $("#achievement .header").data("currentGame");
      if (!game || !game.appid) return;
      const path = require("path");
      const fs = require("fs");
      const userData = remote.app.getPath("userData");
      const dataDir = path.join(userData, "steam_cache", "data");
      const appID = String(game.appid);
      const confirm = remote.dialog.showMessageBoxSync({
        type: "question",
        title: "Reset registro de logros",
        message: "¿Borrar el registro de logros de este juego?",
        detail: "La próxima vez que desbloquees un logro se volverá a notificar. (Solo para pruebas.)",
        buttons: ["Cancelar", "Borrar registro"]
      });
      if (confirm !== 1) return;
      try {
        const emuFile = path.join(dataDir, `${appID}.db`);
        if (fs.existsSync(emuFile)) fs.unlinkSync(emuFile);
        if (fs.existsSync(dataDir)) {
          const files = fs.readdirSync(dataDir);
          const steamPrefix = `steam_${appID}_`;
          files.forEach(function(name) {
            if (name.startsWith(steamPrefix) && name.endsWith(".db")) {
              fs.unlinkSync(path.join(dataDir, name));
            }
          });
        }
        if (game.data && game.data.type === "file" && game.data.path) {
          const steam = require(path.join(typeof appPath !== "undefined" ? appPath : window.appPath, "parser", "steam.js"));
          const root = await steam.getAchievementsFromFile(game.data.path);
          // Convertir a formato array que usa el watchdog (track.load espera array)
          const cache = [];
          for (const name of Object.keys(root)) {
            const a = root[name];
            const achieved = a.Achieved == 1 || a.achieved == 1 || a.Achieved === "1" || a.State === 1;
            cache.push({
              name: name,
              Achieved: !!achieved,
              CurProgress: a.CurProgress || a.progress || 0,
              MaxProgress: a.MaxProgress || a.max_progress || 0,
              UnlockTime: a.UnlockTime || a.unlocktime || a.Time || a.HaveAchievedTime || 0
            });
          }
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(emuFile, JSON.stringify(cache), "utf8");
        }
        remote.dialog.showMessageBoxSync({
          type: "info",
          title: "Registro reseteado",
          message: "Registro de logros borrado. Al desbloquear de nuevo el logro debería notificarse."
        });
      } catch (err) {
        remote.dialog.showMessageBoxSync({
          type: "error",
          title: "Error",
          message: "No se pudo borrar el registro.",
          detail: String(err)
        });
      }
    });
    
    $("#btn-scrollup").click(function(){
        let self = $(this);
        self.css("pointer-events","none");
        
        $("#achievement").animate({scrollTop:0}, 500, 'swing', function() { 
           self.css("pointer-events","initial");
        }); 
    });
    
    $("#achievement .achievement-list .header .toggle").click(function(){

        let self = $(this);
        self.css("pointer-events", "none");
        
        let list = self.parent().next("ul");
        let elem = self.closest(".achievement-list");
        let speed = 400;
        
        if (elem.hasClass("active")) {
          list.slideUp(speed);
          elem.removeClass("active");
        } else {
          list.slideDown(speed);
          elem.addClass("active");
        }
        setTimeout(()=>{ self.css("pointer-events", "initial") }, speed);
    });
    
  });
}(window.jQuery, window, document)); 