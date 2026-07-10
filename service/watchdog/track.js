"use strict";

const path = require('path');
const fs = require("@xan105/fs");

const cache = path.join(process.env['APPDATA'],"Achievement Watcher/steam_cache/data");

module.exports.load = async (appID) => {
  try{
    return JSON.parse(await fs.readFile(path.join(cache,`${appID}.db`),"utf8"));
  }catch(err){
    return [];
  }
}

module.exports.save = async (appID,achievements) => {
    await fs.writeFile(path.join(cache,`${appID}.db`),JSON.stringify(achievements, null, null),"utf8");
}

module.exports.loadSteam = async (appID, steamId64) => {
  try {
    return JSON.parse(await fs.readFile(path.join(cache, `steam_${appID}_${steamId64}.db`), "utf8"));
  } catch (err) {
    return [];
  }
};

module.exports.saveSteam = async (appID, steamId64, achievements) => {
  await fs.writeFile(path.join(cache, `steam_${appID}_${steamId64}.db`), JSON.stringify(achievements, null, null), "utf8");
};