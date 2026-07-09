"use strict";

const path = require('path');
const urlParser = require('url');
const fs = require("@xan105/fs");
const request = require('request-zero');
const steamLang = require("./steam.json");

async function getAchievementsFromXML(appID) {
  const url = `https://steamcommunity.com/stats/${appID}/achievements/?xml=1`;
  try {
    const { body } = await request(url);
    const achievements = [];
    // Regex simple para extraer logros sin depender de un parser HTML
    const achMatches = body.match(/<achievement>([\s\S]*?)<\/achievement>/g);
    if (achMatches) {
      for (const achXml of achMatches) {
        const nameMatch = achXml.match(/<apiname><!\[CDATA\[(.*?)\]\]><\/apiname>/) || achXml.match(/<apiname>(.*?)<\/apiname>/);
        const displayMatch = achXml.match(/<name><!\[CDATA\[(.*?)\]\]><\/name>/) || achXml.match(/<name>(.*?)<\/name>/);
        const descMatch = achXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || achXml.match(/<description>(.*?)<\/description>/);
        const iconMatch = achXml.match(/<iconClosed><!\[CDATA\[(.*?)\]\]><\/iconClosed>/) || achXml.match(/<iconClosed>(.*?)<\/iconClosed>/);
        
        if (nameMatch && displayMatch) {
          achievements.push({
            name: nameMatch[1],
            displayName: displayMatch[1],
            description: descMatch ? descMatch[1] : "",
            icon: iconMatch ? iconMatch[1] : ""
          });
        }
      }
    }
    return achievements;
  } catch (e) {
    return [];
  }
}

module.exports.loadSteamData = async (appID, lang, key, force = false) => {

  if (!steamLang.some( language => language.api === lang )) {
        throw "Unsupported API language code";
  }
  
  const cache = path.join(process.env['APPDATA'],"Achievement Watcher/steam_cache/schema",lang);

  try {
  
    let filePath = path.join(`${cache}`,`${appID}.db`);
    let result;

    if (await fs.existsAndIsYoungerThan(filePath,{timeUnit: 'M', time: 6}) && !force) {
        result = JSON.parse(await fs.readFile(filePath));
    } else {
        try {
          if (key) {
            result = await getSteamData(appID, lang, key);
          } else {
            result = await getSteamDataFromSRV(appID, lang);
          }
        } catch (e) {
          // Fallback to XML if API/SRV fails
          const publicAchievements = await getAchievementsFromXML(appID);
          if (publicAchievements.length > 0) {
            result = {
              name: await findInAppList(+appID).catch(() => "Unknown Game"),
              appid: appID,
              binary: null,
              img: {
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/header.jpg`,
                background: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/page_bg_generated_v6b.jpg`,
                portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/library_600x900.jpg`,
                icon: null
              },
              achievement: {
                total: publicAchievements.length,
                list: publicAchievements
              }
            };
          } else {
            throw e;
          }
        }
        fs.writeFile(filePath,JSON.stringify(result, null, 2)).catch((err) => { console.log(err) });                 
   }
   
   return result;
   
 }catch(err) {
  throw `Could not load Steam data for ${appID} - ${lang}: ${err}`
 }
 
}

module.exports.fetchIcon = async (url,appID) => {
  try{
  
    const cache = path.join(process.env['APPDATA'],`Achievement Watcher/steam_cache/icon/${appID}`);

    const filename = path.parse(urlParser.parse(url).pathname).base;

    let filePath = path.join(cache,filename);

    if (await fs.exists(filePath)) {
      return filePath;
    } else {
      return (await request.download(url,cache)).path;
    }

  }catch(err){
    return url;
  }
}

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

async function getSteamData (appID,lang,key) {
  
  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appID}&l=${lang}&format=json`;

  const data = await request.getJson(url, { timeout: 15000 });
  
  const schema = data.game.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0)) throw "Schema doesn't have any achievement";

  const result = {
    name: await findInAppList(+appID), 
    appid: appID,
    binary: null,
    img: {
      header: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/header.jpg`,
      background: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/page_bg_generated_v6b.jpg`,
      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/library_600x900.jpg`,
      icon: null
    },
    achievement: {
      total: schema.achievements.length,
      list: schema.achievements
    },
    achievementStatLinks: require("./statsIniAchievements.js").buildAchievementStatLinks(schema.achievements),
    stats: schema.stats || []
  };
          
  return result;
}

async function findInAppList(appID){
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "ERR_INVALID_APPID";
  
  const cache = path.join(process.env['APPDATA'],"Achievement Watcher/steam_cache/schema");
  const filepath = path.join(cache,"appList.json");
  
  try
  {
    const list = JSON.parse(await fs.readFile(filepath));
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
    
    await fs.writeFile(filepath,JSON.stringify(list, null, 2));
    
    const app = list.find(app => app.appid === appID);
    if (!app) throw "ERR_NAME_NOT_FOUND"; 
    return app.name;
  }
}

function getSteamUserStatsFromSRV(steamId64, appID) {
  const url = `https://api.xan105.com/steam/user/${steamId64}/stats/${appID}`;
  return request.getJson(url).then((data) => {
    if (data.error) return Promise.reject(new Error(data.error));
    if (data.data) return data.data;
    return Promise.reject(new Error("Unexpected response"));
  });
}

async function getSteamUserStatsAPI(steamId64, appID, apiKey) {
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appID}&key=${apiKey}&steamid=${steamId64}`;
  const result = await request.getJson(url);
  if (result.playerstats && result.playerstats.achievements) return result.playerstats.achievements;
  if (result.playerstats && result.playerstats.error) {
    const msg = result.playerstats.error === "Requested app has no stats" ? "No stats" : result.playerstats.error;
    return Promise.reject(new Error(msg));
  }
  return [];
}

/** Returns array of { name, Achieved, UnlockTime } for player achievements. */
module.exports.getPlayerAchievements = async (steamId64, appID, apiKey) => {
  let raw;
  if (apiKey && apiKey.trim()) {
    raw = await getSteamUserStatsAPI(steamId64, appID, apiKey);
  } else {
    const data = await getSteamUserStatsFromSRV(steamId64, appID);
    raw = Array.isArray(data) ? data : (data.achievements || []);
  }
  return (raw || []).map((a) => ({
    name: a.apiname || a.name,
    Achieved: !!(a.achieved === 1 || a.achieved === true),
    UnlockTime: parseInt(a.unlocktime || a.UnlockTime || 0, 10) || 0
  }));
};