"use strict";

const instance = new (require('single-instance'))('Achievement Watchdog');
const os = require('os');
const { spawn } = require("child_process");
const path = require('path');
const getStartApps = require('get-startapps');
const watch = require('node-watch');
const tasklist = require('win-tasklist');
const moment = require("moment");
const websocket = require("./websocket.js");
const processPriority = require("./util/priority.js");
const fs = require("@xan105/fs");
const settings = require('./settings.js');
const monitor = require('./monitor.js');
const steam = require("./steam.js");
const track = require("./track.js");
const playtimeMonitor = require("./playtime/monitor.js");
const notify = require("./notification/toaster.js");
const debug = require("./util/log.js");
const { crc32 } = require('crc');
const { isWinRTAvailable } = require('powertoast');

let isFullscreenAppRunning;
try {
  isFullscreenAppRunning = require('./queryUserNotificationState.js').isFullscreenAppRunning;
} catch(err) {
  debug.warn('Could not load fullscreen app detection (native module), using fallback');
  isFullscreenAppRunning = async () => false;
}

const cfg_file = {
  option: path.join(process.env['APPDATA'],"Achievement Watcher/cfg","options.ini"),
  userDir: path.join(process.env['APPDATA'],"Achievement Watcher/cfg","userdir.db")
};

const steamPollPaths = [
  path.join(process.env['APPDATA'], "Achievement Watcher", "cfg", "steam_poll.json"),
  path.join(process.env['APPDATA'], "Achievement-Watcher", "cfg", "steam_poll.json")
];

var app = { 
  isRecording: false,
  cache : [],
  options : {},
  watcher: [],
  tick: 0,
  toastID: "Achievement-Watcher",
  steamPollIntervalId: null,
  steamPollRunning: false,
  start: async function() {
   try{
     let self = this;
     self.cache = [];
     if (self.steamPollIntervalId) {
       clearInterval(self.steamPollIntervalId);
       self.steamPollIntervalId = null;
     }
      
     debug.log("Achievement Watchdog starting ...");
     
     processPriority.set("above normal").then(()=>{
        debug.log("Process priority set to ABOVE NORMAL")
     }).catch((err) => { 
        debug.error("Fail to set process priority to ABOVE NORMAL");
     }); 

     debug.log("Loading Options ...");
     self.options = await settings.load(cfg_file.option);
     debug.log(self.options);
     
     if (isWinRTAvailable() === true && self.options.notification_transport.winRT === true) debug.log("[Toast] will use WinRT");
     else debug.warn("[Toast] will use PowerShell");
     
     getStartApps.has({id:"GamingOverlay"}).then((hasXboxOverlay) => {

        let win_ver = os.release().split(".");

        if (self.options.notification_advanced.appID && self.options.notification_advanced.appID !== '') {
                self.toastID = self.options.notification_advanced.appID;
        } else if (win_ver[0] == '6' && ( win_ver[1] == '3' || win_ver[1] == '2') ) {
                self.toastID = "microsoft.XboxLIVEGames_8wekyb3d8bbwe!Microsoft.XboxLIVEGames";
        } else if (hasXboxOverlay === true){
                self.toastID = "Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App";
        }

        debug.log(`[Toast] will use appid: "${self.toastID}"`);
         
      })
      .then(()=>{ return getStartApps.isValidAUMID(self.toastID)})
      .then((res)=>{ 
      
		if(!res){ 
			debug.warn("[Toast] which is not a valid AUMID !");
			if(!self.options.notification_advanced.iconPrefetch) {
				self.options.notification_advanced.iconPrefetch = true;
				debug.warn("[Toast] Forcing iconPrefetch to true so you will have achievement icon");
			}
        } else {
			debug.log("[Toast] which is a valid AUMID");
        }
      
      })
      .catch(()=>{});

     try {
        self.watcher[0] = watch(cfg_file.option, function(evt, name) {
              if (evt === "update") {
                debug.log("option file change detected -> reloading");
                self.watcher.forEach( (watcher) => watcher.close() );
                self.start();
              } 
        });
     }catch(err){
        debug.warn("No option file > settings live reloading disabled");
     }
     
     let i = 1;        
     for (let folder of await monitor.getFolders(cfg_file.userDir)) {
        try{
          if (await fs.exists(folder.dir)) {
            self.watch(i,folder.dir,folder.options);
            i = i+1;
          }
        }catch(err){
          debug.log(err);
        }
     }

     if (self.options.notification.notify && self.options.notification.notifySteamLegit) {
       const intervalSec = Math.max(30, self.options.notification_advanced.steamPollInterval || 60);
       self.steamPollIntervalId = setInterval(() => { self.steamPoll().catch(() => {}); }, intervalSec * 1000);
       setTimeout(() => { self.steamPoll().catch(() => {}); }, 5000);
       debug.log(`Steam (legit) notification polling every ${intervalSec}s`);
     }
      
    }catch(err){
      debug.error(err);
      instance.unlock();
      process.exit();
    }
  },
  watch: function (i, dir, options) {
    let self = this;
    debug.log(`Monitoring ach change in "${dir}" ...`);
    
    self.watcher[i] = watch(dir, {recursive: options.recursive, filter: options.filter}, async function(evt, name) {
      try{

        if (evt !== "update") return;
        
        const currentTime = Date.now();
		const fileLastModified = (await fs.stats(name)).mtimeMs || 0;
		// Only discard really stale events (e.g. touched by an antivirus/backup); emus that buffer writes stay within this window
		if ( (currentTime - fileLastModified) > 120000) return;
        
        let filePath = path.parse(name);
        const normalizedName = name.replace(/\\/g, "/").toLowerCase();
        const fileMatches = options.file.some((file) => {
           const f = file.replace(/\\/g, "/").toLowerCase();
           return f === filePath.base.toLowerCase() || normalizedName.endsWith("/" + f);
        });
        if (!fileMatches) return;
        
        debug.log(`Achievement file change detected: ${name}`);

        // Spam protection only throttles notifications: the UI refresh signal is always sent (see below)
        const isSpam = moment().diff(moment(self.tick)) <= self.options.notification_advanced.tick;
        self.tick = moment().valueOf();
        
        let appID;
        try{
          if (options.appid) {
            appID = options.appid;
          } else {
            // 1. Try to find AppID in the path
            const cleanPath = filePath.dir.replace(/(\\stats$)|(\\SteamEmu$)|(\\SteamEmu\\UserStats$)|(\\remote$)|(\\local$)/g,"");
            const matches = cleanPath.match(/([0-9]+)/g);
            if (matches && matches.length > 0) {
              appID = matches[matches.length - 1]; 
            } else {
              // 2. Try to find a config file in parent folders to get AppID
              const iniFiles = ["steam_emu.ini", "SteamConfig.ini", "valve.ini", "tenoke.ini", "RUNE.ini", "flt.ini", "Achievements.ini"];
              let currentDir = filePath.dir;
              for (let i = 0; i < 5; i++) { // search up to 5 levels up
                for (const iniFile of iniFiles) {
                  const iniPath = path.join(currentDir, iniFile);
                  if (await fs.exists(iniPath)) {
                    try {
                      const content = await fs.readFile(iniPath, "utf8");
                      const parsed = (require("@xan105/ini")).parse(content);
                      const foundId = parsed.Settings?.AppId || parsed.Settings?.AppID || parsed.GameSettings?.AppId || parsed.GameSettings?.AppID;
                      if (foundId) {
                        appID = foundId;
                        break;
                      }
                    } catch (e) {}
                  }
                }
                if (appID) break;
                currentDir = path.dirname(currentDir);
              }
            }
            
            // 3. Last resort: check if AppId is INSIDE the achievement file (some emus do this)
            if (!appID && filePath.ext === ".ini") {
              try {
                const content = await fs.readFile(name, "utf8");
                const parsed = (require("@xan105/ini")).parse(content);
                appID = parsed.SteamAchievements?.AppId || parsed.Steam?.AppId || parsed.Achievements?.AppId;
              } catch (e) {}
            }

            if (!appID) throw "No numeric AppID found in path or config files";
          }
        }catch(err){
          debug.log(`Watchdog detection error for ${name}: ${err}`);
          return; // Skip instead of throwing to keep watcher alive
        }

        // UI refresh signal: decoupled from notifications, process detection and timestamp filters
        websocket.broadcast({ type: "achievements-changed", appID: String(appID), path: name, time: Date.now() });

        if (isSpam) { debug.log("Spamming protection is enabled > skipping notification (UI refresh already sent)"); return; }

        debug.log(`Processing achievements for AppID: ${appID} from file: ${filePath.base}`);
        let game = await self.load(appID);
        if (!game || !game.achievement || !game.achievement.list || game.achievement.list.length === 0) {
          debug.log(`No achievement schema found for AppID ${appID}. Refreshing...`);
          // Try one more time to force load from Steam
          game = await self.load(appID, true); // true to ignore cache if I had that param
          if (!game || !game.achievement || !game.achievement.list || game.achievement.list.length === 0) {
            debug.log(`Still no schema for ${appID}. Notifications will not work.`);
            return;
          }
        }
        
        let isRunning = false;
        
        if (options.disableCheckIfProcessIsRunning === true) {
          isRunning = true;
        } else if (self.options.notification_advanced.checkIfProcessIsRunning) {
          if(await isFullscreenAppRunning()){
              isRunning = true;
              debug.log("Fullscreen application detected on primary display. Assuming process is running");
          }
          else if (game.binary) 
          {
            isRunning = await tasklist.isProcessRunning(game.binary).catch((err) => {
              debug.error(err);
              debug.warn("Assuming process is NOT running");
              return false
            });
            
            if (!isRunning) {
              debug.log("Trying with '-Win64-Shipping' (Unreal Engine Game) ...");
              isRunning = await tasklist.isProcessRunning(game.binary.replace(".exe","-Win64-Shipping.exe")).catch((err) => {
                debug.error(err);
                debug.warn("Assuming process is NOT running");
                return false
              });
            }
            
          } 
          else {
            debug.warn(`Warning! Missing "${game.name}" (${game.appid}) binary name > Overriding user choice to check if process is running`);
            isRunning = true;
          }
        } else {
          isRunning = true;
        }

        if (isRunning) {
          
          let achievements = await monitor.parse(name, appID, self.options.achievement.lang);
          
          if (achievements.length > 0) {
            
            let cache = await track.load(appID);
            
            let j = 0;
            for (let i in achievements) {
              if(Object.prototype.hasOwnProperty.call(achievements,i)){
                    try{

                        let ach = game.achievement.list.find( (achievement ) => { 
                              if (achievements[i].crc) {
                                return achievements[i].crc.includes(crc32(achievement.name).toString(16)); //(SSE) crc module removes leading 0 when dealing with anything below 0x1000 -.-'
                              } else {
                                return achievement.name == achievements[i].name || achievement.name.toUpperCase() == achievements[i].name.toUpperCase() //uppercase == uppercase : cdx xcom chimera (apiname doesn't match case with steam schema)
                              }
                        });
                        if (!ach) throw "ACH_NOT_FOUND_IN_SCHEMA";
                       
                        if(achievements[i].crc) {
                          achievements[i].name = ach.name;
                          delete achievements[i].crc;
                        }
                       
                        let previous = cache.find(achievement => achievement.name === ach.name) || {
                             Achieved : false,
                             CurProgress : 0,
                             MaxProgress : 0,
                             UnlockTime : 0              
                        };

                       if (!previous.Achieved && achievements[i].Achieved) {

                           if (!achievements[i].UnlockTime || achievements[i].UnlockTime == 0) achievements[i].UnlockTime = moment().unix();
                           const ts = achievements[i].UnlockTime;
                           const momentTs = (ts > 1e11) ? moment(ts) : moment.unix(ts);
                           let elapsedTime = moment().diff(momentTs, 'seconds');
                           const timeOk = options.disableCheckTimestamp || (elapsedTime >= 0 && elapsedTime <= self.options.notification_advanced.timeTreshold);
                           if (timeOk) {
                              if (options.disableCheckTimestamp) debug.log("[Emu] timestamp check skipped (disableCheckTimestamp)");
                              debug.log("Unlocked:"+ ach.displayName);

                  try{
                    if (self.options.action.target){
                      debug.log(`Action: ${self.options.action.target}`);
                      if (await fs.exists(self.options.action.target))
                      {
                        const exec = spawn(self.options.action.target, { cwd: self.options.action.cwd || path.parse(self.options.action.target).dir, stdio: "ignore", detached: true, windowsHide: self.options.action.hide ?? true,
                          env : { ...process.env, 
                            AW_APPID: appID.toString(), 
                            AW_GAME: game.name.toString(),
                            AW_ACHIEVEMENT: ach.name.toString(),
                            AW_DISPLAYNAME: ach.displayName.toString(),
                            AW_DESCRIPTION: ach.description?.toString() || "",
                            AW_ICON: ach.icon?.toString() || "",
                            AW_TIME: achievements[i].UnlockTime.toString()
                          }
                        });
                        exec.unref();
                      } else {
                        debug.warn("Action target missing");
                      }
                    }else{
                      debug.log("No action set");
                    }
                  }catch(err){
                    debug.error(`Action failed: ${err}`);
                  }
                              
								  await notify({
									 appid: game.appid,
									 gameDisplayName: game.name,
									 achievementName: ach.name,
									 achievementDisplayName: ach.displayName,
									 achievementDescription: ach.description, 
									 icon: ach.icon,
									 time: achievements[i].UnlockTime,
									 delay: j
								  },{
									notify: self.options.notification.notify,
									transport: {
									  toast: self.options.notification_transport.toast,
									  gntp: self.options.notification_transport.gntp,
									  websocket: self.options.notification_transport.websocket
									},
									toast: {
									  appid: self.toastID,
									  winrt: self.options.notification_transport.winRT,
									  balloonFallback: self.options.notification_transport.balloon,
									  customAudio: self.options.notification_toast.customToastAudio,
									  imageIntegration: self.options.notification_toast.toastSouvenir,
									  group: self.options.notification_toast.groupToast,
									  attribution: "Achievement"
									},
									prefetch: self.options.notification_advanced.iconPrefetch,
									souvenir: {
										screenshot: self.options.souvenir_screenshot.screenshot,
										video: self.options.souvenir_video.video,
										screenshot_options: self.options.souvenir_screenshot,
										video_options: self.options.souvenir_video
									},
									rumble: self.options.notification.rumble
								  });
                                      
                              j+=1;
                           } else {
                              debug.warn("Outatime:"+ ach.displayName + " (elapsed " + elapsedTime + "s > " + self.options.notification_advanced.timeTreshold + "s)");
                           }
                       } else if (previous.Achieved && achievements[i].Achieved){
                       
                          debug.log("Already unlocked:"+ ach.displayName);
                          if (previous.UnlockTime > 0 && previous.UnlockTime != achievements[i].UnlockTime) achievements[i].UnlockTime = previous.UnlockTime;
                          
                       } else if (!achievements[i].Achieved && achievements[i].MaxProgress > 0 && +previous.CurProgress < +achievements[i].CurProgress ) {
                          
                          debug.log("Progress update:"+ ach.displayName);
                          
                              await notify({
                                 appid: game.appid,
                                 gameDisplayName: game.name,
                                 achievementName: ach.name,
                                 achievementDisplayName: ach.displayName,
                                 achievementDescription: ach.description, 
                                 icon: ach.icongray,
                                 progress: {
									current: achievements[i].CurProgress,
									max: achievements[i].MaxProgress
                                 }
                              },{
								notify: self.options.notification.notify,
								transport: {
								  toast: self.options.notification_transport.toast,
								  gntp: self.options.notification_transport.gntp,
							      websocket: self.options.notification_transport.websocket
								},
								toast: {
									appid: self.toastID,
							      winrt: self.options.notification_transport.winRT,
								  balloonFallback: self.options.notification_transport.balloon,
								  customAudio: 0,
								  imageIntegration: self.options.notification_toast.toastSouvenir,
								  group: self.options.notification_toast.groupToast
								},
								prefetch: self.options.notification_advanced.iconPrefetch,
								souvenir: {
									screenshot: false,
									video: 0
								},
								rumble: false
                              });
                        }
              
                }catch(err){
                   if(err === "ACH_NOT_FOUND_IN_SCHEMA") {
                     debug.warn(`${(achievements[i].crc) ? `${achievements[i].crc} (CRC32)` : `${achievements[i].name}`} not found in game schema data ?! ... Achievement was probably deleted or renamed over time > SKIPPING`);
                   }else {
                     debug.error(`Unexpected Error for achievement "${achievements[i].name}": ${err}`);
                   }
                }
              }
            }
            await track.save(appID,achievements);
          
          }
        }
        else {
          debug.warn(`game's process "${game.binary}" not running`);
        }
          
      }catch(err){
        debug.warn(err);
      }
    });
  },
  steamPoll: async function() {
    const self = this;
    if (self.steamPollRunning) return;
    let list = [];
    for (const p of steamPollPaths) {
      try {
        if (await fs.exists(p)) {
          list = JSON.parse(await fs.readFile(p, "utf8"));
          break;
        }
      } catch (e) { /* try next path */ }
    }
    if (!Array.isArray(list) || list.length === 0) {
      return;
    }
    debug.log("Steam poll: " + list.length + " game(s)");
    self.steamPollRunning = true;
    try {
      for (const { appid, steamId64 } of list) {
        try {
          const apiKey = (self.options.steam && self.options.steam.apiKey) ? self.options.steam.apiKey : "";
          const current = await steam.getPlayerAchievements(steamId64, appid, apiKey);
          const previous = await track.loadSteam(appid, steamId64);
          if (previous.length === 0) {
            await track.saveSteam(appid, steamId64, current);
            continue;
          }
          let j = 0;
          for (const achievement of current) {
            if (!achievement.Achieved) continue;
            const prev = previous.find((a) => a.name === achievement.name);
            if (prev && prev.Achieved) continue;
            const game = await self.load(appid);
            const ach = game.achievement.list.find((a) => a.name === achievement.name || (a.name && a.name.toUpperCase() === (achievement.name || "").toUpperCase()));
            if (!ach) continue;
            const unlockTime = achievement.UnlockTime || moment().unix();
            debug.log("Unlocked (Steam): " + ach.displayName);
            await notify({
              appid: game.appid,
              gameDisplayName: game.name,
              achievementName: ach.name,
              achievementDisplayName: ach.displayName,
              achievementDescription: ach.description,
              icon: ach.icon,
              time: unlockTime,
              delay: j
            }, {
              notify: self.options.notification.notify,
              transport: {
                toast: self.options.notification_transport.toast,
                gntp: self.options.notification_transport.gntp,
                websocket: self.options.notification_transport.websocket
              },
              toast: {
                appid: self.toastID,
                winrt: self.options.notification_transport.winRT,
                balloonFallback: self.options.notification_transport.balloon,
                customAudio: self.options.notification_toast.customToastAudio,
                imageIntegration: self.options.notification_toast.toastSouvenir,
                group: self.options.notification_toast.groupToast,
                attribution: "Achievement"
              },
              prefetch: self.options.notification_advanced.iconPrefetch,
              souvenir: { screenshot: false, video: 0 },
              rumble: self.options.notification.rumble
            });
            j += 1;
          }
          if (j > 0) websocket.broadcast({ type: "achievements-changed", appID: String(appid), source: "steamAPI", time: Date.now() });
          await track.saveSteam(appid, steamId64, current);
        } catch (err) {
          const msg = (err && err.message) ? err.message : String(err);
          debug.warn("Steam poll " + appid + ": " + msg);
        }
      }
    } finally {
      self.steamPollRunning = false;
    }
  },
  load : async function(appID, force = false){
    try {
    
      let self = this;
      
      debug.log(`loading steam schema for ${appID}`);
    
      let search = self.cache.find(game => game.appid == appID);
      let game;  

      if (search && !force) {
        game = search;  
        debug.log("from memory cache");
      } else {
        const apiKey = (self.options.steam && self.options.steam.apiKey) ? self.options.steam.apiKey : "";
        game = await steam.loadSteamData(appID, self.options.achievement.lang, apiKey, force);
        if (search) {
          const index = self.cache.indexOf(search);
          self.cache[index] = game;
        } else {
          self.cache.push(game); 
        }
        debug.log("from file cache or remote");  
      }
  
      return game;
    
    }catch(err) {
      throw err;
    }
  }
}

instance.lock().then(() => {
  app.start().catch(()=>{});
  
  try {
    websocket();
  }catch(err){
	debug.error(err);
  }

  playtimeMonitor.init()
  .then((monitor)=>{
	
	debug.log("Playtime monitoring activated");
	
	monitor.on("notify",([game, time]) => {
	  if(app.options.notification.playtime){

		    notify({
                appid: game.appid,
                gameDisplayName: game.name,
                achievementDisplayName: game.name,
                achievementDescription: (time) ? time : "Tracking playtime", 
                icon: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.icon}.jpg`,
                image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
            },{
				notify: app.options.notification.notify,
				transport: {
					toast: app.options.notification_transport.toast,
					gntp: app.options.notification_transport.gntp,
					websocket: false
				},
				toast: {
					appid: app.toastID,
					winrt: app.options.notification_transport.winRT,
					balloonFallback: app.options.notification_transport.balloon,
					customAudio: 0,
					imageIntegration: 1,
					group: app.options.notification_toast.groupToast,
					cropIcon: true,
					attribution: "Achievement Watcher"
				},
				gntpLabel: "Playtime",
				prefetch: app.options.notification_advanced.iconPrefetch,
				souvenir: {
					screenshot: false,
					video: 0
				},
				rumble: false
            });
  
	  } 
	}); 
  
  })
  .catch((err)=>{debug.error(err)});
})
.catch((err) => {
  debug.error(err);
  process.exit();
});