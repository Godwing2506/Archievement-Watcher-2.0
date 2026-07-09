"use strict";

const remote = require('@electron/remote');
const path = require("path");
const steam = require(path.join(appPath,"parser/steam.js"));
const uplay = require(path.join(appPath,"parser/uplay.js"));
const rpcs3 = require(path.join(appPath,"parser/rpcs3.js"));
const greenluma = require(path.join(appPath,"parser/greenluma.js"));
const userDir = require(path.join(appPath,"parser/userDir.js"));
const blacklist = require(path.join(appPath,"parser/blacklist.js"));
const watchdog = require(path.join(appPath,"parser/watchdog.js"));
const debug = new (require("@xan105/log"))({
  console: remote.getCurrentWindow().isDev || false,
  file: path.join(remote.app.getPath('userData'),"logs/parser.log")
});
const { crc32 } = require('crc');
const ffs = require("@xan105/fs");

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || `Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function discover(source, callbackProgress = () => {}) {

    callbackProgress(0);
    debug.log("Scanning for games ...");
    
    let data = [];
    
    //UserCustomDir
    let additionalSearch = [];
    try{
      const userDirs = await userDir.get();
      debug.log(`[DIAG] userDir.get() returned ${userDirs.length} custom dir(s)`);
      for (let dir of userDirs) {

          debug.log(`[userdir] ${dir.path}`);
          
          let scanned = [];
          if (source.rpcs3) scanned = await rpcs3.scan(dir.path);
          if (scanned.length > 0) {
              data = data.concat(scanned);
              debug.log("-> RPCS3 data added");
          } else if(source.steamEmu) {
              scanned = await userDir.scan(dir.path);
              if (scanned.length > 0) {
                  data = data.concat(scanned);
                  debug.log("-> Steam emu data added");
              } else {
                  additionalSearch.push(dir.path);
                  debug.log("-> will be scanned for appid folder(s)"); 
              }
          }
          
      }
    }catch(err){
      debug.log(err);
    }
    
    // Paralelizar scans independientes
    let scanPromises = [];
    let completedScans = 0;
    const totalScans = (source.steamEmu ? 1 : 0) + (source.greenLuma ? 1 : 0) + (source.legitSteam > 0 ? 1 : 0) + (source.lumaPlay ? 2 : 0) + (source.importCache ? 1 : 0);
    const onScanDone = () => {
      completedScans++;
      if (totalScans > 0) callbackProgress(Math.floor((completedScans / totalScans) * 15)); // up to 15% during discover
    };
    
    if (source.steamEmu){
      const t0 = Date.now();
      scanPromises.push(steam.scan(additionalSearch).then(r => { debug.log(`[DIAG] steam.scan took ${Date.now()-t0}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] steam.scan ERROR after ${Date.now()-t0}ms: ${err}`); onScanDone(); return []; }));
    }
    
    if (source.greenLuma){
      const t0 = Date.now();
      scanPromises.push(greenluma.scan().then(r => { debug.log(`[DIAG] greenluma.scan took ${Date.now()-t0}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] greenluma.scan ERROR after ${Date.now()-t0}ms: ${err}`); onScanDone(); return []; }));
    }
    
    if (source.legitSteam > 0) {
      const t0 = Date.now();
      scanPromises.push(steam.scanLegit(source.legitSteam).then(r => { debug.log(`[DIAG] steam.scanLegit took ${Date.now()-t0}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] steam.scanLegit ERROR after ${Date.now()-t0}ms: ${err}`); onScanDone(); return []; }));
    }
    
    if (source.lumaPlay){
      const t0 = Date.now();
      scanPromises.push(Promise.resolve(uplay.scan()).then(r => { debug.log(`[DIAG] uplay.scan took ${Date.now()-t0}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] uplay.scan ERROR after ${Date.now()-t0}ms: ${err}`); onScanDone(); return []; }));
      const t1 = Date.now();
      scanPromises.push(uplay.scanLegit().then(r => { debug.log(`[DIAG] uplay.scanLegit took ${Date.now()-t1}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] uplay.scanLegit ERROR after ${Date.now()-t1}ms: ${err}`); onScanDone(); return []; }));
    }
    
    if(source.importCache){
      const t0 = Date.now();
      scanPromises.push(watchdog.scan().then(r => { debug.log(`[DIAG] watchdog.scan took ${Date.now()-t0}ms, found ${r.length}`); onScanDone(); return r; }).catch(err => { debug.error(`[DIAG] watchdog.scan ERROR after ${Date.now()-t0}ms: ${err}`); onScanDone(); return []; }));
    }
    
    let scanResults = await Promise.all(scanPromises);
    
    for (let result of scanResults) {
      data = data.concat(result);
    }
    
    //AppID Blacklisting
    try{  
        let exclude = await blacklist.get();
        data = data.filter(appid => { return !exclude.some((id) => id == appid.appid) });   
    }catch(err){
        debug.error(err);
    }

    return data;

}

module.exports.makeList = async(option, callbackProgress = ()=>{}) => {

  try {
      const hasKey = !!(option.steam && option.steam.apiKey && option.steam.apiKey.trim());
      debug.log(`[DIAG] Config: lang=${option.achievement.lang}, Steam API key=${hasKey ? "SET" : "MISSING"}, sources=${JSON.stringify(option.achievement_source)}`);

      let result = [];
      let steamPollList = [];

      let appidList = await discover(option.achievement_source, callbackProgress);

      debug.log(`[DIAG] Discovered ${appidList.length} game(s). Types: ${appidList.map(a => `${a.appid}(${a.data.type})`).join(", ")}`);

      if ( appidList.length > 0) {
        let count = 1;

        for (let appid of appidList) 
        {

            let percent = Math.floor((count/appidList.length)*100);

            let game;
            let isDuplicate = false;

            try {

                if (result.some( res => res.appid == appid.appid) && option.achievement.mergeDuplicate) {
                  game = result.find( elem => elem.appid == appid.appid);
                  isDuplicate = true;
                }
                else if (appid.data.type === "rpcs3"){
                  game = await rpcs3.getGameData(appid.data.path);
                }                else if (appid.data.type === "uplay" || appid.data.type === "lumaplay"){
                  game = await uplay.getGameData(appid.appid,option.achievement.lang);
                }else{
                  game = await withTimeout(
                    steam.getGameData({appID: appid.appid, lang: option.achievement.lang, key: (option.steam && option.steam.apiKey) ? option.steam.apiKey : '', autoTranslate: option.achievement.autoTranslate }),
                    30000,
                    `Steam data timeout (${appid.appid})`
                  );
                }

                if (appid.data && appid.data.type === "steamAPI" && appid.data.userID && appid.data.userID.id) {
                  steamPollList.push({ appid: String(appid.appid), steamId64: String(appid.data.userID.id) });
                }

                if(!option.achievement.mergeDuplicate && appid.source) game.source = appid.source;

                if (game.achievement.total === 0) debug.log(`[DIAG] [${appid.appid}] Schema has 0 achievements (no API key or store fallback?)`);

                let root = {};
                try {
                  if (appid.data.type === "file") {
                      debug.log(`[DIAG] [${appid.appid}] FILE path: ${appid.data.path}`);
                      root = await steam.getAchievementsFromFile(appid.data.path);
                      debug.log(`[DIAG] [${appid.appid}] File OK => ${Object.keys(root).length} achievement(s)`);
                      if(root.constructor === Object && Object.entries(root).length === 0) debug.warn(`[${appid.appid}] Warning ! Achievement file in '${appid.data.path}' is probably empty`);

                   } else if (appid.data.type === "reg") {
                         
                      root = await greenluma.getAchievements(appid.data.root,appid.data.path);

                   } else if (appid.data.type === "steamAPI") {
                      debug.log(`[DIAG] [${appid.appid}] Steam API cachePath: ${appid.data.cachePath}`);
                     root = await steam.getAchievementsFromAPI({appID: appid.appid, user: appid.data.userID, path: appid.data.cachePath , key: (option.steam && option.steam.apiKey) ? option.steam.apiKey : '' });
                      debug.log(`[DIAG] [${appid.appid}] Steam API OK => ${Array.isArray(root) ? root.length : Object.keys(root || {}).length} achievement(s)`);

                   } else if (appid.data.type === "rpcs3"){
                    
                     root = await rpcs3.getAchievements(appid.data.path,game.achievement.total);
                     
                   } else if (appid.data.type === "lumaplay"){
                    
                     root = uplay.getAchievementsFromLumaPlay(appid.data.root,appid.data.path);
                     
                   } else if (appid.data.type === "cached"){
                   
                     root = await watchdog.getAchievements(appid.appid);
                     
                   } else {
                   
                     throw "Not yet implemented";
                    
                   }
                 }catch(err){
                    debug.error(`[${appid.appid}] Error parsing local achievements data => ${err}`);
                    debug.log(`[DIAG] [${appid.appid}] type=${appid.data.type} FAILED: ${String(err)}`);
                 }
                
                 for (let i in root)
                 {
                    if(Object.prototype.hasOwnProperty.call(root,i)){
                     try {

                          let achievement = game.achievement.list.find( (elem) => { 
                              if (root[i].crc) {
                                return root[i].crc.includes(crc32(elem.name).toString(16)); //(SSE) crc module removes leading 0 when dealing with anything below 0x1000 -.-'
                              } else {
                                let apiname = root[i].id || root[i].apiname || root[i].name || i;
                                return elem.name == apiname || elem.name.toString().toUpperCase() == apiname.toString().toUpperCase() //uppercase == uppercase : cdx xcom chimera (apiname doesn't match case with steam schema)
                              }
                          });
                          if(!achievement) throw "ACH_NOT_FOUND_IN_SCHEMA";

                          let parsed = {
                                Achieved : (root[i].Achieved == 1 || root[i].achieved == 1 || root[i].State == 1 || root[i].HaveAchieved == 1 || root[i].Unlocked == 1 || root[i].earned || root[i] === "1") ? true : false,
                                CurProgress : root[i].CurProgress || root[i].progress || 0,
                                MaxProgress : root[i].MaxProgress || root[i].max_progress || 0,
                                UnlockTime : root[i].UnlockTime || root[i].unlocktime || root[i].HaveAchievedTime || root[i].HaveHaveAchievedTime || root[i].Time || root[i].earned_time || 0
                          };
                          
                          if (!parsed.Achieved && parsed.MaxProgress != 0 && parsed.CurProgress != 0 && parsed.MaxProgress == parsed.CurProgress) { //CODEX Gears5 (09/2019)  && Gears tactics (05/2020)
                            parsed.Achieved = true;
                          }

                          if (isDuplicate) {
                              if (parsed.Achieved && !achievement.Achieved) {    
                                    achievement.Achieved = true;
                              }
                                    
                              if ((!achievement.CurProgress && parsed.CurProgress > 0) || (parsed.CurProgress > 0 && parsed.MaxProgress == achievement.MaxProgress && parsed.CurProgress > achievement.CurProgress)) {
                                    achievement.CurProgress = parsed.CurProgress;
                              }
                                    
                              if (!achievement.MaxProgress && parsed.MaxProgress > 0) {
                                    achievement.MaxProgress = parsed.MaxProgress;
                              }
                                    
                              if (option.achievement.timeMergeRecentFirst) {
                                if( (!achievement.UnlockTime || achievement.UnlockTime == 0) || parsed.UnlockTime > achievement.UnlockTime ){ //More recent first
                                      achievement.UnlockTime = parsed.UnlockTime;
                                }
                              } else {
                                if( (!achievement.UnlockTime || achievement.UnlockTime == 0) || (parsed.UnlockTime > 0 && parsed.UnlockTime < achievement.UnlockTime) ){ //Oldest first
                                      achievement.UnlockTime = parsed.UnlockTime;
                                }
                              }
                          } else {
                              Object.assign(achievement,parsed);
                          }
     
                       }catch(err){
                          if(err === "ACH_NOT_FOUND_IN_SCHEMA") {
                            debug.warn(`[${appid.appid}] Achievement not found in game schema data ?! ... Achievement was probably deleted or renamed over time`);
                          } else {
                            debug.error(`[${appid.appid}] Unexpected Error: ${err}`);
                          }
                       }          
                    }
                 }

                 game.achievement.unlocked = game.achievement.list.filter(ach => ach.Achieved == 1).length;
                 game.notifyToast = (appid.data && (appid.data.type === "steamAPI" || appid.data.type === "file" || appid.data.type === "cached" || appid.data.type === "lumaplay")) ? (appid.data.type === "steamAPI" ? "steam" : "emu") : "no";
                 if (!isDuplicate) {
                   game.data = { type: appid.data.type, path: appid.data.path, cachePath: appid.data.cachePath, userID: appid.data.userID };
                   result.push(game);
                 }

            //loop appid
            } catch(err) {
              debug.error(`[${appid.appid}] Error parsing local achievements data => ${err} > SKIPPING`);
            }
            
        callbackProgress(percent);
        count = count + 1;
        }

    }

    try {
      const seen = new Set();
      const unique = steamPollList.filter(({ appid, steamId64 }) => {
        const key = `${appid}_${steamId64}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const steamPollPath = path.join(remote.app.getPath('userData'), 'cfg', 'steam_poll.json');
      await ffs.writeFile(steamPollPath, JSON.stringify(unique, null, 0), 'utf8');
      if (unique.length > 0) debug.log(`[DIAG] steam_poll.json written: ${unique.length} Steam game(s) for notification polling`);
    } catch (e) {
      debug.warn('Could not write steam_poll.json: ' + (e && e.message));
    }

    callbackProgress(100);
    return result;
      
  }catch(err) {
    debug.error(err);
    throw err;
  }
};

function mergeRootIntoGame(root, game, option) {
  if (!root || !game.achievement || !game.achievement.list) return;
  const isArray = Array.isArray(root);
  const keys = isArray ? root.map((_, i) => i) : Object.keys(root);
  for (const i of keys) {
    const item = root[i];
    if (!item) continue;
    try {
      const achievement = game.achievement.list.find((elem) => {
        const apiname = item.id || item.apiname || item.name || (isArray ? item.name : i);
        if (item.crc) return item.crc.includes(crc32(elem.name).toString(16));
        return elem.name == apiname || elem.name.toString().toUpperCase() == String(apiname).toUpperCase();
      });
      if (!achievement) continue;
      let parsed = {
        Achieved: (item.Achieved == 1 || item.Achieved === "1" || item.achieved == 1 || item.State == 1 || item.HaveAchieved == 1 || item.Unlocked == 1 || item.earned || item === "1") ? true : false,
        CurProgress: item.CurProgress || item.progress || 0,
        MaxProgress: item.MaxProgress || item.max_progress || 0,
        UnlockTime: item.UnlockTime || item.unlocktime || item.HaveAchievedTime || item.HaveHaveAchievedTime || item.Time || item.earned_time || 0
      };
      if (!parsed.Achieved && parsed.MaxProgress != 0 && parsed.CurProgress != 0 && parsed.MaxProgress == parsed.CurProgress) parsed.Achieved = true;
      if (achievement.Achieved && !parsed.Achieved) parsed.Achieved = true;
      Object.assign(achievement, parsed);
    } catch (e) { /* skip */ }
  }
  game.achievement.unlocked = game.achievement.list.filter(ach => ach.Achieved == 1).length;
}

module.exports.refreshAchievements = async (game, option) => {
  if (!game || !game.data) return null;
  let root;
  try {
    let gotRoot = false;
    if (game.data.type === "file" && game.data.path) {
      // First try the normal path
      try {
        root = await steam.getAchievementsFromFile(game.data.path);
        gotRoot = root && Object.keys(root).length > 0;
      } catch (e) { /* ignore, try fallback */ }
      
      // If normal path failed, search ALL files/subfolders in game's path for ANY achievement file!
      if (!gotRoot) {
        debug.log(`[${game.appid}] Normal path failed, doing deep search for achievement files in ${game.data.path} ...`);
        const glob = require('fast-glob');
        const path = require('path');
        const ffs = require('@xan105/fs');
        const ini = require('@xan105/ini');
        
        // Look for ANY relevant file up to 5 levels deep
        const deepFiles = await glob("**/*.{ini,json,dat,bin}", { 
          cwd: game.data.path, 
          absolute: true, 
          deep: 5 
        });
        
        for (const filePath of deepFiles) {
          try {
            let local;
            if (path.extname(filePath) === '.json') {
              local = JSON.parse(await ffs.readFile(filePath, 'utf8'));
            } else if (filePath.endsWith('.bin')) {
              const sse = require(path.join(appPath,"parser/sse.js"));
              local = sse.parse(await ffs.readFile(filePath));
            } else {
              const buffer = await ffs.readFile(filePath);
              let content;
              if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
                content = buffer.toString('utf16le');
              } else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                content = buffer.toString('utf8').slice(1);
              } else {
                content = buffer.toString('utf8');
              }
              local = ini.parse(content);
            }
            
            // Check if this file has any achievement-looking keys
            let hasAchievements = false;
            // First check common sections
            const checkObj = local.ACHIEVE_DATA || local.Achievements || local.SteamAchievements || local;
            if (checkObj && typeof checkObj === 'object') {
              for (let key in checkObj) {
                if (Object.prototype.hasOwnProperty.call(checkObj, key)) {
                  const val = checkObj[key];
                  if (typeof val === 'object' && val !== null && 
                      (val.Achieved !== undefined || val.achieved !== undefined || val.earned !== undefined ||
                       val.State !== undefined || val.UnlockTime !== undefined || val.progress !== undefined)) {
                    hasAchievements = true;
                    break;
                  }
                }
              }
            }
            
            if (hasAchievements) {
              debug.log(`[${game.appid}] Found achievement file at ${filePath} !`);
              // Now parse it like getAchievementsFromFile does
              let result = {};
              const filter = ["SteamAchievements","Steam64","Steam"];
              
              if (local.AchievementsUnlockTimes && local.Achievements) {
                for (let i in local.Achievements) {
                  if(Object.prototype.hasOwnProperty.call(local.Achievements,i)){
                    if (local.Achievements[i] == 1) {
                      result[`${i}`] = { Achieved: "1", UnlockTime: local.AchievementsUnlockTimes[i] || null };
                    }
                  }
                }
              } else if (local.State && local.Time) {
                for (let i in local.State) {
                  if(Object.prototype.hasOwnProperty.call(local.State,i)){
                    if(local.State[i] == "0101") {
                      const DataView = require('@xan105/data-view').DataView;
                      result[i] = { Achieved: "1", UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(),'hex')).buffer).getUint32(0, true) || null }; 
                    }
                  }
                }
              } else {
                const omit = require('lodash.omit');
                result = omit(local, filter);
                if (Object.keys(result).length === 0) {
                  const modernData = local.ACHIEVE_DATA || local.Achievements || local.SteamAchievements;
                  if (modernData) result = omit(modernData, filter);
                }
                if (Object.keys(result).length === 0) {
                  for (let key in local) {
                    if (Object.prototype.hasOwnProperty.call(local, key)) {
                      const val = local[key];
                      if (typeof val === 'object' && val !== null && 
                          (val.Achieved !== undefined || val.achieved !== undefined || 
                           val.State !== undefined || val.UnlockTime !== undefined)) {
                        result[key] = val;
                      }
                    }
                  }
                }
              }
              
              if (Object.keys(result).length > 0) {
                root = result;
                gotRoot = true;
                debug.log(`[${game.appid}] Successfully parsed ${Object.keys(result).length} achievements from found file`);
                break;
              }
            }
          } catch (e) { /* skip this file */ }
        }
      }
    } else if (game.data.type === "cached") {
      root = await watchdog.getAchievements(game.appid);
    } else if (game.data.type === "steamAPI" && game.data.userID && game.data.cachePath) {
      root = await steam.getAchievementsFromAPI({ appID: game.appid, user: game.data.userID, path: game.data.cachePath, key: (option.steam && option.steam.apiKey) ? option.steam.apiKey : "" });
    } else {
      return null;
    }
  } catch (err) {
    debug.error(`[${game.appid}] refresh failed: ${err}`);
    return null;
  }
  if (root) mergeRootIntoGame(root, game, option);
  return game;
};