"use strict";

const remote = require('@electron/remote');
const path = require("path");
const glob = require("fast-glob");
const normalize = require('normalize-path');
const ini = require("@xan105/ini");
const omit = require('lodash.omit');
const moment = require('moment');
const request = require('request-zero');
const urlParser = require('url');
const ffs = require("@xan105/fs");
const regedit = require('../util/reg_shim');

const resolveAppPath = require(path.join(__dirname, "../util/resolveAppPath.js"));
const appPath = resolveAppPath(remote);

const steamID = require(path.join(appPath,"util/steamID.js"));
const steamLanguages = require(path.join(appPath,"locale/steam.json"));
const sse = require(path.join(appPath,"parser/sse.js"));
const htmlParser = require("node-html-parser");
const translator = require(path.join(appPath,"util/translator.js"));
const { normalizeGoldbergUserAchievements } = require(path.join(__dirname, "goldbergAchievements.js"));
const { statsLocalToAchievements, hasClassicAchievementSections, buildAchievementStatLinks } = require(path.join(__dirname, "statsIniAchievements.js"));

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || `Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const cacheRoot = remote.app.getPath('userData');

const SCHEMA_LANG_FALLBACK = ["latam", "spanish", "english"];

function loadFallbackStatLinks(appId) {
  try {
    const filePath = path.join(__dirname, "statAchievementFallback", `${appId}.json`);
    if (!ffs.exists(filePath)) return [];
    const data = JSON.parse(require("fs").readFileSync(filePath, "utf8"));
    return Array.isArray(data.links) ? data.links : [];
  } catch (e) {
    return [];
  }
}

async function loadSchemaFromCache(appId, lang) {
  const langs = lang ? [lang, ...SCHEMA_LANG_FALLBACK.filter((l) => l !== lang)] : SCHEMA_LANG_FALLBACK;
  for (const l of langs) {
    const filePath = path.join(cacheRoot, "steam_cache", "schema", l, `${appId}.db`);
    try {
      if (await ffs.exists(filePath)) {
        const data = JSON.parse(await ffs.readFile(filePath, "utf8"));
        if (data.achievement && data.achievement.total > 0) return data;
      }
    } catch (e) { /* try next */ }
  }
  return null;
}

function enrichSchemaStatLinks(result, appId) {
  if (!result) return result;
  if (!Array.isArray(result.achievementStatLinks) || result.achievementStatLinks.length === 0) {
    const fromList = buildAchievementStatLinks(result.achievement && result.achievement.list);
    result.achievementStatLinks = fromList.length > 0 ? fromList : loadFallbackStatLinks(appId);
  }
  return result;
}

/** Steam AppID folders under Goldberg (skip SteamID64 roots, typically 17 digits). */
function isLikelySteamAppIdFolder(name) {
  return /^[0-9]+$/.test(name) && name.length <= 10;
}

async function resolveGoldbergScanPath(dir) {
  const appid = path.parse(dir).name;
  if (await ffs.exists(path.join(dir, "achievements.json"))) return dir;
  if (await ffs.exists(path.join(dir, "achievements.ini"))) return dir;
  const parent = path.dirname(dir);
  if (path.basename(parent) === "remote" && isLikelySteamAppIdFolder(appid)) {
    const appidRoot = path.join(parent, "..");
    if (await ffs.exists(path.join(appidRoot, "achievements.json"))) return appidRoot;
    if (await ffs.exists(path.join(appidRoot, "achievements.ini"))) return appidRoot;
  }
  return dir;
}

module.exports.scan = async (additionalSearch = []) => {
  try {
    const scanStart = Date.now();

    let search = [
        path.join(process.env['Public'],"Documents/Steam/CODEX"), 
        path.join(process.env['APPDATA'],"Goldberg SteamEmu Saves"),
        path.join(process.env['Public'],"Documents/Steam/Goldberg SteamEmu Saves"),
        path.join(process.env['APPDATA'],"EMPRESS"),
        path.join(process.env['Public'],"Documents/EMPRESS"),
        path.join(process.env['APPDATA'],"Steam/CODEX"),
        path.join(process.env['PROGRAMDATA'] || '', 'Steam', '*'),
        path.join(process.env['LOCALAPPDATA'],"SKIDROW"),
        path.join(process.env['APPDATA'],"SmartSteamEmu"),
        path.join(process.env['APPDATA'],"CreamAPI"),
        path.join(process.env['Public'],"Documents/Steam/RUNE"),
        path.join(process.env['Public'],"Documents/Steam/CreamAPI"),
        path.join(process.env['Public'],"Documents/Steam/TENOKE"),
        path.join(process.env['Public'],"Documents/Steam/DOGE"),
        path.join(process.env['Public'],"Documents/Steam/Fairlight"),
        path.join(process.env['APPDATA'],"FLT/Steam")
    ];
    
    const mydocs = await regedit.promises.RegQueryStringValueAndExpand("HKCU","Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders","Personal");
    if (mydocs) {
      search = search.concat([
        path.join(mydocs,"SkidRow")
      ]);
    }
    
    if(additionalSearch.length > 0) search = search.concat(additionalSearch);
    
    // Pattern for numeric AppID folders
    const numericSearch = search.map((dir) => { return normalize(dir) + "/([0-9]+)" });
    // Pattern for any folder that might contain an emulator config (for named folders)
    const namedSearch = search.map((dir) => { return normalize(dir) + "/*" });
    
    let data = [];
    const goldbergRoots = [
      path.join(process.env['APPDATA'] || '', 'Goldberg SteamEmu Saves'),
      path.join(process.env['Public'] || '', 'Documents/Steam/Goldberg SteamEmu Saves')
    ];
    try {
      const tGold = Date.now();
      for (const goldbergRoot of goldbergRoots) {
        if (!(await ffs.exists(goldbergRoot))) continue;
        const goldbergRemote = await glob(normalize(goldbergRoot) + "/**/remote/([0-9]+)", { onlyDirectories: true, absolute: true, deep: 5, suppressErrors: true });
        for (const dir of goldbergRemote) {
          const appid = path.parse(dir).name;
          if (!isLikelySteamAppIdFolder(appid)) continue;
          const scanPath = await resolveGoldbergScanPath(dir);
          if (!data.some(g => g.appid === appid && g.source === "Goldberg")) {
            data.push({ appid, source: "Goldberg", data: { type: "file", path: scanPath } });
          }
        }
        // Goldberg saves user achievements at .../<appid>/ (not only under remote/)
        const goldbergAppDirs = await glob(normalize(goldbergRoot) + "/([0-9]+)", { onlyDirectories: true, absolute: true, suppressErrors: true });
        for (const dir of goldbergAppDirs) {
          const appid = path.parse(dir).name;
          if (!isLikelySteamAppIdFolder(appid)) continue;
          if (data.some(g => g.appid === appid && g.source === "Goldberg")) continue;
          data.push({ appid, source: "Goldberg", data: { type: "file", path: dir } });
        }
      }
      if (Date.now() - tGold > 1000) debug.log(`[DIAG] steam.scan Goldberg block took ${Date.now()-tGold}ms`);
    } catch (e) { /* ignore */ }
    
    // Scan numeric folders
    const tNum = Date.now();
    for (let dir of await glob(numericSearch,{onlyDirectories: true, absolute: true, suppressErrors: true})) {
                if (dir.includes("Goldberg")) continue;
    
                let game = { 
                    appid: path.parse(dir).name, 
                    data: {
                      type: "file",
                      path: dir }
                };
                
                if (dir.includes("CODEX")) {
                  game.source = "Codex";
                } else if (dir.includes("EMPRESS")){
                  game.source = "Goldberg (EMPRESS)";
                  game.data.path = path.join(game.data.path,"remote",game.appid);
                } else if (dir.includes("SKIDROW")){
                  game.source = "Skidrow";
                } else if (dir.includes("SmartSteamEmu")){
                  game.source = "SmartSteamEmu";
                } else if (dir.includes("ProgramData/Steam")){
                  game.source = "Reloaded - 3DM";
                } else if (dir.includes("CreamAPI")){
                  game.source = "CreamAPI";
                } else if (dir.includes("RUNE")){
                  game.source = "RUNE";
                } else if (dir.includes("TENOKE")){
                  game.source = "TENOKE";
                } else if (dir.includes("DOGE")){
                  game.source = "DOGE";
                } else if (dir.includes("Fairlight")){
                  game.source = "Fairlight";
                } else if (dir.includes("FLT")){
                  game.source = "FLT";
                }

                data.push(game);
    }

    if (Date.now() - tNum > 1000) debug.log(`[DIAG] steam.scan numeric block took ${Date.now()-tNum}ms`);

    // Scan for named folders with config files (new logic)
    const tNamed = Date.now();
    const emuIniFiles = ["steam_emu.ini", "SteamConfig.ini", "valve.ini", "tenoke.ini", "RUNE.ini", "flt.ini", "Achievements.ini"];
    for (let dir of await glob(namedSearch, { onlyDirectories: true, absolute: true, suppressErrors: true })) {
      if (path.parse(dir).name.match(/^[0-9]+$/)) continue; // skip numeric folders already scanned
      
      for (const iniFile of emuIniFiles) {
        const fullIni = path.join(dir, iniFile);
        if (await ffs.exists(fullIni)) {
          try {
            let appid;
            if (iniFile === "Achievements.ini") {
              // Sometimes Achievements.ini is just there, we might not get AppID easily
              // but we can try to find it in the path or skip if not found
            } else {
              const content = await ffs.readFile(fullIni, "utf8");
              const parsed = ini.parse(content);
              appid = parsed.Settings?.AppId || parsed.Settings?.AppID || parsed.GameSettings?.AppId || parsed.GameSettings?.AppID;
            }
            
            if (appid) {
              data.push({
                appid: appid.toString(),
                source: "Emulator (Auto-detected)",
                data: { type: "file", path: dir }
              });
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (Date.now() - tNamed > 1000) debug.log(`[DIAG] steam.scan named block took ${Date.now()-tNamed}ms`);
    if (Date.now() - scanStart > 1000) debug.log(`[DIAG] steam.scan TOTAL took ${Date.now()-scanStart}ms`);

    return data;
  
  }catch(err){
      throw err;
  }
}

module.exports.scanLegit = async (listingType = 0) => {
  try {
  
  let data = [];
  
  if (listingType > 0){ 
  
         let steamPath = await getSteamPath();
         let publicUsers = await getSteamUsers(steamPath);

         let steamCache = path.join(steamPath,"appcache/stats");
         let list = (await glob("UserGameStats_*([0-9])_*([0-9]).bin",{cwd: steamCache, onlyFiles: true, absolute: false})).map((filename) => {
            let matches = filename.match(/([0-9]+)/g);
            return {
              userID : matches[0],
              appID: matches[1]
            };
         });
     
         for (let stats of list) {

             let isInstalled = true;
             if (listingType == 1) isInstalled = (await regedit.promises.RegQueryIntegerValue("HKCU",`Software/Valve/Steam/Apps/${stats.appID}`,"Installed") === "1") ? true : false;
                                 
             let user = publicUsers.find(user => user.user == stats.userID);
             
             if ( user && isInstalled) {
            
                  data.push({appid: stats.appID,
                             source: `Steam (${user.name})`,
                             data: {
                                type: "steamAPI",
                                userID: user,
                                cachePath: steamCache
                             }
                  });
            }       
          }
    } else {
      throw "Legit Steam not found or disabled.";
    }
  
  return data;
  
  }catch(err){
      throw err;
  }
}

module.exports.getGameData = async (cfg) => {
  if (!steamLanguages.some( language => language.api === cfg.lang )) {
        throw "Unsupported API language code";
  }

  const cache = path.join(cacheRoot,"steam_cache/schema",cfg.lang);

  try {
  
    let filePath = path.join(`${cache}`,`${cfg.appID}.db`);
    
    let result;

    if (await ffs.existsAndIsYoungerThan(filePath,{timeUnit: 'M', time: 6})) {
        result = JSON.parse(await ffs.readFile(filePath));
        result = enrichSchemaStatLinks(result, cfg.appID);
        if (result.achievement && result.achievement.total === 0 && cfg.key && cfg.key.trim()) {
          try {
            result = await withTimeout(getSteamData(cfg), 20000, `Steam API timeout (app ${cfg.appID})`);
            if (result.achievement && result.achievement.total > 0) {
              ffs.writeFile(filePath, JSON.stringify(result, null, 2)).catch(() => {});
            }
          } catch (e) {
            const cached = await loadSchemaFromCache(cfg.appID, cfg.lang);
            if (cached) result = enrichSchemaStatLinks(cached, cfg.appID);
          }
        }
    } else {
        try {
            if (cfg.key && cfg.key.trim()) {
              result = await withTimeout(getSteamData(cfg), 20000, `Steam API timeout (app ${cfg.appID})`);
            } else {
              throw "No Steam Web API Key provided and Cache Server is shutdown.";
            }
        } catch (e) {
            if (e === "Invalid API key") throw e;
            const cached = await loadSchemaFromCache(cfg.appID, cfg.lang);
            if (cached) {
              result = enrichSchemaStatLinks(cached, cfg.appID);
            } else {
            //Fallback to basic info from Store
            const store = await getDataFromSteamStore(+cfg.appID);
            if(store.name){
                // Try to get achievements from public XML API
                const publicAchievements = await getAchievementsFromXML(+cfg.appID);
                
                result = {
                    name: store.name, 
                    appid: cfg.appID,
                    binary: null,
                    img: {
                      header: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/header.jpg`,
                      background: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/page_bg_generated_v6b.jpg`,
                      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/library_600x900.jpg`,
                      icon: store.icon ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${cfg.appID}/${store.icon}.jpg` : null
                    },
                    achievement: {
                      total: publicAchievements.length,
                      list: publicAchievements
                    }
                };
                result = enrichSchemaStatLinks(result, cfg.appID);
            } else {
                throw e;
            }
            }
        }
        if (result && result.achievement && result.achievement.total > 0) {
          ffs.writeFile(filePath,JSON.stringify(result, null, 2)).catch((err) => {});
        }
   }

   if (!result || !result.achievement || result.achievement.total === 0) {
     const cached = await loadSchemaFromCache(cfg.appID, cfg.lang);
     if (cached) result = enrichSchemaStatLinks(cached, cfg.appID);
   }
   
   return enrichSchemaStatLinks(result, cfg.appID);
   
 }catch(err) {
  if (err.code)
    throw `Could not load Steam data: ${err.code} - ${err.message}`;
  else
    throw `Could not load Steam data: ${err}`;
 }
}

module.exports.getAchievementsFromFile = async (filePath) => {
  try {

  const files = [
    "achievements.ini",
    "achievements.json",
    "achiev.ini",
    "stats.ini",
    "Achievements.Bin",
    "achieve.dat",
    "Achievements.ini",
    "stats/achievements.ini",
    "remote/achievements.ini",
    "remote/achievements.json",
    "stats.bin",
    "stats/CreamAPI.Achievements.cfg",
    "SteamEmu/UserStats/achievements.ini",
    "SteamEmu/achievements.ini",
    "tenoke.ini",
    "run.ini",
    "rune.ini",
    "data.ini",
    "save.ini"
  ];
  
  const filter = ["SteamAchievements","Steam64","Steam"];
  
  let local;
  let tried = [];
  
  // First pass: standard files (skip empty achievements.ini — RUNE may only use stats.ini)
  for (let file of files) {
     const full = path.join(filePath, file);
     tried.push(file);
     try {
       if (await ffs.exists(full)) {
         let parsed;
         if (path.parse(file).ext == ".json") {
            parsed = JSON.parse(await ffs.readFile(full,"utf8"));
         } else if (file === "stats.bin"){
            parsed = sse.parse(await ffs.readFile(full));
         } else {
            let content = "";
            try { content = await ffs.readFile(full, "utf8"); } catch(e){}
            if (!content) try { content = await ffs.readFile(full, "ucs2"); } catch(e){}
            if (!content) try { content = await ffs.readFile(full, "utf16le"); } catch(e){}
            if (content) {
              parsed = ini.parse(content);
            }
         }
         if (!parsed) continue;
         if (file === "achievements.ini" && !hasClassicAchievementSections(parsed)) continue;
         local = parsed;
         break;
       }
     } catch (e) {}
  }

  // Second pass: deep search if not found (for emulators with SteamID subfolders)
  if (!local) {
    try {
      const deepFiles = await glob("**/{achievements,tenoke,rune,data,achiev,stats}.{ini,json}", { cwd: filePath, absolute: true, deep: 5 });
      if (deepFiles.length > 0) {
        const full = deepFiles[0];
        tried.push(path.relative(filePath, full));
        if (path.parse(full).ext == ".json") {
          let content = "";
          try { content = await ffs.readFile(full,"utf8"); } catch(e){}
          if (!content) try { content = await ffs.readFile(full, "ucs2"); } catch(e){}
          if (content) local = JSON.parse(content);
        } else {
          let content = "";
          try { content = await ffs.readFile(full,"utf8"); } catch(e){}
          if (!content) try { content = await ffs.readFile(full, "ucs2"); } catch(e){}
          if (!content) try { content = await ffs.readFile(full, "utf16le"); } catch(e){}
          if (content) local = ini.parse(content);
        }
      }
    } catch (e) {}
  }

  // Goldberg: scan path may point at remote/<appid> while achievements.json is in the appid root
  if (!local) {
    const parent = path.dirname(filePath);
    if (path.basename(parent) === "remote") {
      const appidRoot = path.join(parent, "..");
      const goldbergAch = path.join(appidRoot, "achievements.json");
      tried.push(path.relative(filePath, goldbergAch));
      try {
        if (await ffs.exists(goldbergAch)) {
          local = JSON.parse(await ffs.readFile(goldbergAch, "utf8"));
        }
      } catch (e) {}
    }
  }

  if(!local) throw `No achievement file found in '${filePath}' (tried: ${tried.slice(0,5).join(", ")}...)`; 

  const appId = path.basename(filePath);
  const fromStats = statsLocalToAchievements(local, appId);
  if (fromStats) return fromStats;

  const goldbergUser = normalizeGoldbergUserAchievements(local);
  if (goldbergUser) return goldbergUser;
                          
  let result = {};                     
  
  if (local.AchievementsUnlockTimes && local.Achievements) { //hoodlum DARKSiDERS
    
    for (let i in local.Achievements) {
      if(Object.prototype.hasOwnProperty.call(local.Achievements,i)){
        if (local.Achievements[i] == 1) {
          result[`${i}`] = { Achieved: "1", UnlockTime: local.AchievementsUnlockTimes[i] || null };
        }
      }
    }
  } else if (local.State && local.Time ) { //3DM
  
    for (let i in local.State) {
      if(Object.prototype.hasOwnProperty.call(local.State,i)){
        if(local.State[i] == '0101'){
          result[i] = { Achieved: "1", UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(),'hex')).buffer).getUint32(0, true) || null }; 
        }
      }
    }
  } else {
    // ORIGINAL y SEGURO para instalador: primero el clásico
    result = omit(local, filter);
    
    // Si el clásico NO DA NADA, probamos nuevas secciones (para juegos como Quarantine Zone)
    if (Object.keys(result).length === 0) {
      const modernData = local.ACHIEVE_DATA || local.Achievements || local.SteamAchievements;
      if (modernData) {
        result = omit(modernData, filter);
      }
    }
    
    // Si aún está vacío, probamos una última cosa: tal vez las claves son directamente sin secciones
    if (Object.keys(result).length === 0) {
      // Iteramos todas las claves y filtramos las que parezcan logros
      for (let key in local) {
        if (Object.prototype.hasOwnProperty.call(local, key)) {
          const val = local[key];
          // Si es un objeto con Achieved o parece un logro
          if (typeof val === 'object' && val !== null && 
              (val.Achieved !== undefined || val.achieved !== undefined || val.earned !== undefined ||
               val.State !== undefined || val.UnlockTime !== undefined || val.progress !== undefined)) {
            result[key] = val;
          }
        }
      }
    }
  }

  for (let i in result) {
    if(Object.prototype.hasOwnProperty.call(result,i)){
       if(result[i].State) { //RLD!
            try{  
              //uint32 little endian
              result[i].State = new DataView(new Uint8Array(Buffer.from(result[i].State.toString(),'hex')).buffer).getUint32(0, true);
              result[i].CurProgress = new DataView(new Uint8Array(Buffer.from(result[i].CurProgress.toString(),'hex')).buffer).getUint32(0, true);
              result[i].MaxProgress = new DataView(new Uint8Array(Buffer.from(result[i].MaxProgress.toString(),'hex')).buffer).getUint32(0, true);
              result[i].Time = new DataView(new Uint8Array(Buffer.from(result[i].Time.toString(),'hex')).buffer).getUint32(0, true);   
            }catch(e){} 
       } else if (result[i].unlocktime && result[i].unlocktime.length === 7){ //creamAPI
          result[i].unlocktime = +result[i].unlocktime * 1000 //cf: https://cs.rin.ru/forum/viewtopic.php?p=2074273#p2074273 | timestamp is invalid/incomplete
       }  
    }
  }

  return result;
  
  }catch(err){
      throw err;
  }
}

module.exports.getAchievementsFromAPI = async(cfg) => {

  try {
  
    let result;
  
    let cache = {
      local : path.join(cacheRoot,"steam_cache/user",cfg.user.user,`${cfg.appID}.db`),
      steam : path.join(`${cfg.path}`,`UserGameStats_${cfg.user.user}_${cfg.appID}.bin`)
    };
    
    let time = {
      local : 0,
      steam: 0
    };
    
    let local = await ffs.stats(cache.local);
    if (Object.keys(local).length > 0) {
      time.local = moment(local.mtime).valueOf();
    }

    let steamStats = await ffs.stats(cache.steam);
    if (Object.keys(steamStats).length > 0) {
      time.steam = moment(steamStats.mtime).valueOf();
    }else{
      throw "No Steam cache file found"
    }
    
    if (time.steam > time.local) {
        if (cfg.key && cfg.key.trim()) {
          result = await getSteamUserStats(cfg);
        } else {
          result = await getSteamUserStatsFromSRV(cfg.user.id,cfg.appID);
        }
        ffs.writeFile(cache.local,JSON.stringify(result, null, 2)).catch((err) => {});

    } else {
      result = JSON.parse(await ffs.readFile(cache.local));
    }

   return result;
   
 }catch(err) {
    if (err.code)
      throw `Could not load Steam User Stats: ${err.code} - ${err.message}`;
    else
      throw `Could not load Steam User Stats: ${err}`;
 }
 
}

const getSteamPath = module.exports.getSteamPath = async() => {
     /*
       Some SteamEmu change HKCU/Software/Valve/Steam/SteamPath to the game's dir
       Fallback to Software/WOW6432Node/Valve/Steam/InstallPath in this case 
       NB: Steam client correct the key on startup
     */

     const regHives = [
        {root: "HKCU", key: "Software/Valve/Steam", name: "SteamPath"},
        {root: "HKLM", key: "Software/WOW6432Node/Valve/Steam", name: "InstallPath"} 
     ];

     let steamPath;

     for (let regHive of regHives) {
          
        steamPath = await regedit.promises.RegQueryStringValue(regHive.root,regHive.key,regHive.name);
        if (steamPath) {
           if (await ffs.exists(path.join(steamPath,"steam.exe"))){
             break;
           }
        }  
     }
  
     if (!steamPath) throw "Steam Path not found";
     return steamPath;
}

const getSteamUsers = module.exports.getSteamUsers = async (steamPath) => {
            
    let result = [];
       
    let users = await regedit.promises.RegListAllSubkeys("HKCU","Software/Valve/Steam/Users");
    if (!users) users = await glob("*([0-9])",{cwd: path.join(steamPath,"userdata"), onlyDirectories: true, absolute: false}); 
     
    if (users.length == 0) throw "No Steam User ID found";
        for (let user of users) {
            let id = steamID.to64(user);
            let data = await steamID.whoIs(id);
               
            if (data.privacyState === "public") {
                debug.log(`${user} - ${id} (${data.steamID}) is public`);
                result.push({
                    user: user,
                    id: id,
                    name: data.steamID,
                    profile: data
                }); 
            } else {
                debug.log(`${user} - ${id} (${data.steamID}) is not public`);
            }
        }
                
    if (result.length > 0) {
        return result;
    } else {
        throw "Public profile: none.";
    }        
}

function getSteamUserStatsFromSRV(user,appID) {

  const url = `https://api.xan105.com/steam/user/${user}/stats/${appID}`;
  
  return new Promise((resolve, reject) => {
  
    request.getJson(url).then((data) => {
      
      if (data.error) {
        return reject(data.error);
      } else if (data.data){
        return resolve(data.data);
      } else {
        return reject("Unexpected Error");
      }
      
    }).catch((err) => {
      return reject(err);
    });
  
  });
}

async function getSteamUserStats(cfg) {

  const url = `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${cfg.appID}&key=${cfg.key}&steamid=${cfg.user.id}`;

  try {

    let result = await request.getJson(url);
    return result.playerstats.achievements;
    
  }catch(err){
    throw err
  }

};

/**
 * Get Steam profile display name (personaname) via Web API.
 * @param {string} apiKey - Steam Web API key
 * @param {string} steamId64 - Steam ID 64-bit
 * @returns {Promise<string|null>} personaname or null on failure
 */
const getSteamProfileName = module.exports.getSteamProfileName = async (apiKey, steamId64) => {
  if (!apiKey || !apiKey.trim() || !steamId64) return null;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamId64)}`;
    const data = await request.getJson(url);
    const players = data && data.response && data.response.players;
    if (Array.isArray(players) && players.length > 0 && players[0].personaname) {
      return players[0].personaname;
    }
  } catch (e) {
    debug.log('getSteamProfileName: ' + (e && e.message));
  }
  return null;
};

function getSteamDataFromSRV(appID,lang){

  const url = `https://api.xan105.com/steam/ach/${appID}?lang=${lang}`;
  
  return new Promise((resolve, reject) => {
  
    request.getJson(url).then((data) => {
      
      if (data.error) {
        return reject(data.error);
      } else if (data.data){
        return resolve(data.data);
      } else {
        return reject("Unexpected Error");
      }
      
    }).catch((err) => {
      return reject(err);
    });
  
  });
}

async function getSteamData(cfg) {
  
  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${cfg.key}&appid=${cfg.appID}&l=${cfg.lang}&format=json`;

  const data = await request.getJson(url, { timeout: 15000 });
  
  if (data.response && data.response.error) {
    if (data.response.error.errordesc === "Invalid API key") throw "Invalid API key";
    else throw data.response.error.errordesc;
  }
  
  const schema = data.game.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0)) throw "Schema doesn't have any achievement";

  const store = await getDataFromSteamStore(+cfg.appID);

  // El esquema ya viene en cfg.lang desde la API de Steam; autoTranslate solo si hace falta
  let achievements = schema.achievements;
  
  if (cfg.autoTranslate === true && cfg.lang !== "english" && cfg.lang !== "schinese" && cfg.lang !== "tchinese") {
    try {
      // Determinar el idioma de destino basado en cfg.lang
      const langMap = {
        "spanish": "es",
        "latam": "es",
        "portuguese": "pt",
        "french": "fr",
        "german": "de",
        "russian": "ru",
        "japanese": "ja",
        "korean": "ko",
        "italian": "it",
        "dutch": "nl",
        "polish": "pl",
        "brazilian": "pt",
        "ukrainian": "uk",
        "thai": "th",
        "greek": "el"
      };
      
      const targetLang = langMap[cfg.lang];
      
      if (targetLang) {
        const batchSize = 5;
        const translated = [];
        
        for (let i = 0; i < schema.achievements.length; i += batchSize) {
          const batch = schema.achievements.slice(i, i + batchSize);
          const translatedBatch = await Promise.all(
            batch.map(async (ach) => {
              try {
                if (translator.isLikelyEnglish(ach.displayName) || translator.isLikelyEnglish(ach.description)) {
                  return await translator.translateAchievement(ach, "en", targetLang);
                }
              } catch (err) {
                // Error individual de traducción, continuar sin traducir este logro
              }
              return ach;
            })
          );
          translated.push(...translatedBatch);
        }
        
        achievements = translated;
      }
    } catch (err) {
      // Si la traducción falla completamente, usar los logros originales
      achievements = schema.achievements;
    }
  }

  let achievementStatLinks = buildAchievementStatLinks(achievements);
  if (achievementStatLinks.length === 0) {
    achievementStatLinks = loadFallbackStatLinks(cfg.appID);
  }

  const result = {
    name: store.name || await findInAppList(+cfg.appID), 
    appid: cfg.appID,
    binary: null,
    img: {
      header: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/header.jpg`,
      background: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/page_bg_generated_v6b.jpg`,
      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${cfg.appID}/library_600x900.jpg`,
      icon: store.icon ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${cfg.appID}/${store.icon}.jpg` : null
    },
    achievement: {
      total: achievements.length,
      list: achievements
    },
    achievementStatLinks,
    stats: schema.stats || []
  };
          
  return result;
}

async function getAchievementsFromXML(appID) {
  const url = `https://steamcommunity.com/stats/${appID}/achievements/?xml=1`;
  try {
    const { body } = await request(url);
    const html = htmlParser.parse(body);
    const achievements = [];
    const achNodes = html.querySelectorAll('achievement');
    
    for (const node of achNodes) {
      const nameNode = node.querySelector('apiname');
      const displayNode = node.querySelector('name');
      const descNode = node.querySelector('description');
      const iconNode = node.querySelector('iconClosed');
      
      if (nameNode && displayNode) {
        achievements.push({
          name: nameNode.textContent || nameNode.innerText,
          displayName: displayNode.textContent || displayNode.innerText,
          description: descNode ? (descNode.textContent || descNode.innerText) : "",
          icon: iconNode ? (iconNode.textContent || iconNode.innerText) : ""
        });
      }
    }
    return achievements;
  } catch (e) {
    return [];
  }
}

async function getDataFromSteamStore(appID){
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "ERR_INVALID_APPID";

  const url = `https://store.steampowered.com/app/${appID}`;
  
  try {
  
    const { body }  = await request(url,{ headers: 
      { 
        'Cookie': "birthtime=662716801; wants_mature_content=1; path=/; domain=store.steampowered.com", //Bypass age check and mature filter
        "Accept-Language" : "en-US;q=1.0" //force result to english
      } 
    }); 
       
    const html = htmlParser.parse(body);
    const nameEl = html.querySelector('.apphub_AppName');
    const iconEl = html.querySelector('.apphub_AppIcon img');
    const name = (nameEl && (nameEl.textContent || nameEl.innerText || '').trim()) || '';
    const srcAttr = iconEl && iconEl.attributes && iconEl.attributes.src;
    const iconMatch = (typeof srcAttr === 'string' && srcAttr.match(/([^\\\/\:\*\?\"\<\>\|])+$/));
    const icon = (iconMatch && iconMatch[0]) ? iconMatch[0].replace('.jpg', '') : '';

    const result = { name, icon };
    return result;
  } catch {
    return {};
  }
}

async function findInAppList(appID){
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "ERR_INVALID_APPID";
  
  const cache = path.join(cacheRoot,"steam_cache/schema");
  const filepath = path.join(cache,"appList.json");
  
  try
  {
    const list = JSON.parse(await ffs.readFile(filepath));
    const app = list.find(app => app.appid === appID);
    if (!app) throw "ERR_NAME_NOT_FOUND";
    return app.name; 
  } 
  catch
  {
    const url = "http://api.steampowered.com/ISteamApps/GetAppList/v0002/?format=json";
    
    const data = await request.getJson(url,{timeout: 4000});
    
    let list = data.applist.apps;
    list.sort((a, b) => b.appid - a.appid); //recent first
    
    await ffs.writeFile(filepath,JSON.stringify(list, null, 2));
    
    const app = list.find(app => app.appid === appID);
    if (!app) throw "ERR_NAME_NOT_FOUND"; 
    return app.name;
  }
}