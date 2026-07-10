"use strict";

const remote = require('@electron/remote');
const path = require("path");
const ini = require("@xan105/ini");
const parentFind = require('find-up');
const glob = require("fast-glob");
const ffs = require("@xan105/fs");
const listDrive = require(path.join(appPath,"util/listDrive.js"));
const regedit = require('../util/reg_shim');

const file = path.join(remote.app.getPath('userData'),"cfg/userdir.db");

const steam_emu_cfg_file_supported = [
  "ALI213.ini", 
  "valve.ini", 
  "hlm.ini", 
  "ds.ini", 
  "steam_api.ini", 
  "SteamConfig.ini",
  "steam_emu.ini",
  "flt.ini",
  "ch.ini",
  "tenoke.ini",
  "RUNE.ini",
  "user_steam_id.txt"
];

module.exports.get = async () => {
    try{
        return JSON.parse(await ffs.readFile(file,"utf8"));   
    }catch(err){
        return [];
    }
}

module.exports.save = async (data) => {
    try{
        await ffs.writeFile(file,JSON.stringify(data, null, 2),"utf8");    
    }catch(err){
        throw err;
    }  
}

module.exports.find = async () => {
    
    const ignore = [
      "System Volume Information",  
      "$Recycle.Bin", 
      "$RECYCLE.BIN", 
      "Recovery",
      "MSOCache",
      "Windows",
      "ProgramData",
      "node_modules",
      ".git",
      ".vscode",
      ".idea"
    ];

    const searchPatterns = steam_emu_cfg_file_supported
      .filter(el => el !== "steam_api.ini")
      .concat(["rpcs3.exe"])
      .map((el) => "**/" + el);

    const foundDirs = new Set();

    try {
      // 1. Search known user/profile locations first (faster, most emulators use these)
      const appData = process.env['APPDATA'] || path.join(process.env['USERPROFILE'] || '', 'AppData', 'Roaming');
      const publicDocs = process.env['Public'] || path.join(process.env['SystemDrive'] || 'C:', 'Users', 'Public');
      const userPaths = [
        appData,
        path.join(appData, 'Goldberg SteamEmu Saves'),
        process.env['LOCALAPPDATA'] || path.join(process.env['USERPROFILE'] || '', 'AppData', 'Local'),
        publicDocs,
        path.join(process.env['USERPROFILE'] || '', 'Documents'),
        path.join(process.env['USERPROFILE'] || '', 'Documents', 'Steam'),
        path.join(publicDocs, 'Documents', 'Steam'),
        path.join(publicDocs, 'Documents', 'Steam', 'RUNE'),
        path.join(publicDocs, 'Documents', 'Steam', 'CODEX'),
        process.env['ProgramData'] || path.join(process.env['SystemDrive'] || 'C:', 'ProgramData')
      ].filter(Boolean);

      for (const basePath of userPaths) {
        try {
          if (!(await ffs.exists(basePath))) continue;
          const files = await glob(searchPatterns, { cwd: basePath, ignore, onlyFiles: true, absolute: true, suppressErrors: true });
          files.forEach(f => foundDirs.add(path.parse(f).dir));
          const appidDirs = await glob("[0-9]+", { cwd: basePath, onlyDirectories: true, absolute: true, suppressErrors: true });
          appidDirs.forEach(f => foundDirs.add(path.parse(f).dir));
        } catch (e) { /* skip */ }
      }

      // 2. Search common game install roots on each drive (avoid scanning entire disks)
      let drives = [];
      try {
        drives = await listDrive();
      } catch (e) {
        drives = [process.env['SystemDrive'] || 'C:'];
      }

      const driveRoots = (drive) => [
        drive,
        path.join(drive, 'Program Files'),
        path.join(drive, 'Program Files (x86)'),
        path.join(drive, 'Games'),
        path.join(drive, 'Juegos'),
        path.join(drive, 'SteamLibrary'),
        path.join(drive, 'Steam'),
        path.join(drive, 'Epic Games'),
        path.join(drive, 'XboxGames')
      ];

      for (const drive of drives) {
        for (const root of driveRoots(drive)) {
          try {
            if (!(await ffs.exists(root))) continue;
            const files = await glob(searchPatterns, { cwd: root, ignore, onlyFiles: true, absolute: true, suppressErrors: true, deep: 8 });
            files.forEach(f => foundDirs.add(path.parse(f).dir));
          } catch (e) { /* skip */ }
        }
      }

      return [...foundDirs];
    } catch (err) {
      throw err;
    }
}

module.exports.check = async (dirpath) => {

  try{
  
    let result = false;
  
    const accepted_files = steam_emu_cfg_file_supported.concat(["rpcs3.exe"]);
  
    //check for appID folder(s)
    let scan = await glob("([0-9]+)",{cwd: dirpath, onlyDirectories: true}); 
    if (scan.length > 0) return result = true;
    
    //check for accepted_files
    scan = await glob("*.{ini,exe,txt}",{cwd: dirpath, onlyFiles: true}); 
    for (let file of scan) if (accepted_files.some( filename => filename === file )) return result = true;

    return result;

  }catch(err){
    throw err;
  }

}

module.exports.scan = async (dir) => {

  let result = [];
  
  try {
    
    let info;
    for (var file of steam_emu_cfg_file_supported) {
      try{
        info = ini.parse(await ffs.readFile(path.join(dir,file),"utf8"));
      break;
      }catch(e){}
    }
    if (!info) {
      const appidDirs = await glob("[0-9]+", { cwd: dir, onlyDirectories: true, absolute: false, suppressErrors: true });
      const baseName = path.basename(path.normalize(dir));
      const isRune = baseName === "RUNE";
      const isCodex = baseName === "CODEX";
      if ((isRune || isCodex) && appidDirs.length > 0) {
        for (const appId of appidDirs) {
          const appPath = path.join(dir, appId);
          const achIni = path.join(appPath, "achievements.ini");
          const achJson = path.join(appPath, "achievements.json");
          if (await ffs.exists(achIni) || await ffs.exists(achJson)) {
            result.push({
              appid: appId,
              source: isRune ? "RUNE" : "CODEX",
              data: { type: "file", path: appPath }
            });
          }
        }
      }
      return result;
    }

    /*
      parentFind:
        Most of the time the cfg/dll pair is next to the game binary and thus UserDataFolder folder should be there as well; 
        Otherwise walk up parent directories and try to find the folder.
    */
    
    if ( (file === "ALI213.ini" || file === "valve.ini" || file === "SteamConfig.ini") && info.Settings) { //ALI213

        if(info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 0) {

            let dirpath = await parentFind(async (directory) => {
                              let has = await parentFind.exists(path.join(directory, `Profile/${info.Settings.PlayerName}/Stats`));
                              return has && directory;
               }, {cwd: dir, type: 'directory'});

            if (dirpath){
                      result.push({ appid: info.Settings.AppID,
                                 source: "ALI213",
                                 data: {
                                   type: "file",
                                   path: path.join(dirpath,`Profile/${info.Settings.PlayerName}/Stats`)
                                 }
                               });
            }    
        
      } else if(info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 1) {
      
            const mydocs = await regedit.promises.RegQueryStringValueAndExpand("HKCU","Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders","Personal");
            if (mydocs) {
              
              result.push({ appid: info.Settings.AppID,
                            source: "ALI213",
                            data: {
                                  type: "file",
                                  path: path.join(mydocs,`VALVE/${info.Settings.AppID}/${info.Settings.PlayerName}/Stats`)
                            }
                          });

            }
            
      } else if (info.Settings.AppID && !info.Settings.SaveType){
      
            let dirpath = await parentFind(async (directory) => {
                              let has = await parentFind.exists(path.join(directory, "Profile/Stats"));
                              return has && directory;
               }, {cwd: dir, type: 'directory'});

            if (dirpath){
                      result.push({ appid: info.Settings.AppID,
                                 source: "ALI213",
                                 data: {
                                   type: "file",
                                   path: path.join(dirpath,"Profile/Stats")
                                 }
                               });
            }
            
      }
    
    } else if ( (file === "ds.ini" || file === "hlm.ini" || file === "steam_api.ini") && info.GameSettings) { //Hoodlum - DARKSiDERS - Skidrow(since end of 2019 ?)
              
        if(info.GameSettings.UserDataFolder === "." && info.GameSettings.AppId) {
                let dirpath = await parentFind(async (directory) => {
                                let has = await parentFind.exists(path.join(directory, 'SteamEmu/UserStats'));
                                return has && directory;
                            }, {cwd: dir, type: 'directory'});

                if (dirpath){
                  result.push({ appid: info.GameSettings.AppId,
                             source: (file === "ds.ini") ? "DARKSiDERS" : (file === "hlm.ini") ? "Hoodlum" : "Skidrow",
                             data: {
                               type: "file",
                               path: path.join(dirpath,"SteamEmu/UserStats")
                             }
                           });
                } else {
                   dirpath = await parentFind(async (directory) => {
                                    let has = await parentFind.exists(path.join(directory, 'SteamEmu'));
                                    return has && directory;
                            }, {cwd: dir, type: 'directory'});

                    if (dirpath){
                      result.push({ appid: info.GameSettings.AppId,
                                 source: (file === "ds.ini") ? "DARKSiDERS" : (file === "hlm.ini") ? "Hoodlum" : "Skidrow",
                                 data: {
                                   type: "file",
                                   path: path.join(dirpath,"SteamEmu")
                                 }
                               });
                    } else if(file === "hlm.ini"){
                      //Hoodlum using ALI213 like emu (before ~ september 2019 ?)
                      //User reported that setting it to mydocs has no effect. But should be double confirmed.
                      //Seems to be using defaults: playerName VALVE and saveType 0
                      
                        dirpath = await parentFind(async (directory) => {
                                 let has = await parentFind.exists(path.join(directory, "Profile/VALVE/Stats"));
                                 return has && directory;
                         }, {cwd: dir, type: 'directory'});

                        if (dirpath){
                           result.push({ appid: info.GameSettings.AppId,
                                         source: "Hoodlum",
                                         data: {
                                           type: "file",
                                           path: path.join(dirpath,"Profile/VALVE/Stats")
                                        }
                           });
                        }
                    }
                }
                
        } else if (info.GameSettings.UserDataFolder === "mydocs" && info.GameSettings.AppId && info.GameSettings.UserName && info.GameSettings.UserName !== ""){
        
            const mydocs = await regedit.promises.RegQueryStringValueAndExpand("HKCU","Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders","Personal");
            if (mydocs) {

              let dirpath = path.join(mydocs,info.GameSettings.UserName,info.GameSettings.AppId,"SteamEmu");
              
              result.push({ appid: info.GameSettings.AppId,
                               source: (file === "ds.ini") ? "DARKSiDERS" : (file === "hlm.ini") ? "Hoodlum" : "Skidrow",
                               data: {
                                 type: "file",
                                 path: (await ffs.exists(path.join(dirpath,"UserStats"))) ? path.join(dirpath,"UserStats") : dirpath
                               }
             });

            }

        }
    
    
    } else if (file === "steam_api.ini" && info.Settings) { //Catherine
    
        if (info.Settings.AppId && info.Settings.SteamID) {

                let dirpath = await parentFind(async (directory) => {
                                let has = await parentFind.exists(path.join(directory, `SteamProfile/${info.Settings.SteamID}`));
                                return has && directory;
                          }, {cwd: dir, type: 'directory'});

                if (dirpath){
                  result.push({ appid: info.Settings.AppId,
                             data: {
                               type: "file",
                               path: path.join(dirpath,`SteamProfile/${info.Settings.SteamID}`)
                             }
                           });
                } 
        
        }

    } else if (file === "steam_emu.ini" && info.Settings && info.Settings.AppId) { // CODEX / RUNE

        const appId = info.Settings.AppId;
        const publicDocs = process.env['Public'] || path.join(process.env['SystemDrive'] || "C:", "Users/Public");
        const pathsToCheck = [
            path.join(publicDocs, "Documents/Steam/CODEX", appId),
            path.join(publicDocs, "Documents/Steam/RUNE", appId),
            path.join(process.env['APPDATA'], "Rune/Steam", appId)
        ];
        
        for (const p of pathsToCheck) {
            if (await ffs.exists(p)) {
                result.push({
                    appid: appId,
                    source: "CODEX/RUNE",
                    data: { type: "file", path: p }
                });
                break; 
            }
        }

    } else if (file === "flt.ini" && info.GameSettings && info.GameSettings.AppId) { // FLT
         const appId = info.GameSettings.AppId;
         const p = path.join(process.env['APPDATA'], "FLT/Steam", appId);
         if (await ffs.exists(p)) {
             result.push({
                 appid: appId,
                 source: "FLT",
                 data: { type: "file", path: p }
             });
         }
    }

  }catch(err){
    /*Do nothing*/
    console.warn(err);
  }

  return result;

}