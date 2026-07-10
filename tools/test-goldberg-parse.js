#!/usr/bin/env node
"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");
const ffs = require("@xan105/fs");

// Minimal mock for getAchievementsFromFile Goldberg logic
function normalizeGoldbergJson(local) {
  const filter = ["SteamAchievements", "Steam64", "Steam"];
  if (Array.isArray(local)) {
    const converted = {};
    let hasUserData = false;
    for (const item of local) {
      if (item && item.name && (item.earned === true || item.earned === 1 || item.Achieved == 1)) {
        hasUserData = true;
        converted[item.name] = {
          Achieved: 1,
          UnlockTime: item.earned_time || item.UnlockTime || 0,
          CurProgress: item.progress || 0,
          MaxProgress: item.max_progress || item.maxProgress || 0
        };
      }
    }
    return hasUserData ? converted : null;
  }
  if (local && typeof local === "object") {
    const keys = Object.keys(local).filter(k => !filter.includes(k));
    if (keys.length && keys.every(k => local[k] && typeof local[k] === "object" && ("earned" in local[k] || "Achieved" in local[k]))) {
      return local;
    }
  }
  return local;
}

const sample = {
  FIRST_TIME: { earned: true, earned_time: 1736640000, progress: 1, max_progress: 1 },
  TOOLING_UP: { earned: false, earned_time: 0, progress: 0, max_progress: 1 }
};

const out = normalizeGoldbergJson(sample);
console.log("Goldberg parse OK:", out.FIRST_TIME.earned === true, "keys:", Object.keys(out).length);

const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const qz = path.join(appData, "Goldberg SteamEmu Saves", "3419520");
console.log("Quarantine folder exists:", fs.existsSync(qz));
if (fs.existsSync(qz)) {
  console.log("Contents:", fs.readdirSync(qz));
  const ach = path.join(qz, "achievements.json");
  if (fs.existsSync(ach)) {
    const parsed = normalizeGoldbergJson(JSON.parse(fs.readFileSync(ach, "utf8")));
    const earned = Object.values(parsed).filter(v => v.earned || v.Achieved == 1).length;
    console.log("Unlocked in file:", earned);
  }
}
