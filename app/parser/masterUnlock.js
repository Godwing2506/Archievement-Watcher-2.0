"use strict";

const fs = require("fs");
const path = require("path");
const ini = require("@xan105/ini");
const ffs = require("@xan105/fs");
const {
  resolveStatLinks,
  hasClassicAchievementSections,
  normalizeGoldbergUserAchievements
} = require("./statsIniAchievements.js");

const ACHIEVEMENT_FILES = [
  "achievements.ini",
  "achievements.json",
  "stats.ini",
  "remote/achievements.json",
  "remote/achievements.ini"
];

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.aw-backup-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function touchFile(filePath) {
  const now = new Date();
  try {
    fs.utimesSync(filePath, now, now);
  } catch (e) {
    fs.closeSync(fs.openSync(filePath, "a"));
    fs.utimesSync(filePath, now, now);
  }
}

function readIni(filePath) {
  if (!fs.existsSync(filePath)) return {};
  let content = "";
  try { content = fs.readFileSync(filePath, "utf8"); } catch (e) { /* ignore */ }
  if (!content) try { content = fs.readFileSync(filePath, "ucs2"); } catch (e) { /* ignore */ }
  if (!content) try { content = fs.readFileSync(filePath, "utf16le"); } catch (e) { /* ignore */ }
  if (!content) return {};
  try {
    return ini.parse(content);
  } catch (e) {
    return {};
  }
}

function isGoldbergJson(parsed) {
  return !!normalizeGoldbergUserAchievements(parsed);
}

async function detectStore(gamePath, appId, lang) {
  const appIdStr = String(appId);
  const statsPath = path.join(gamePath, "stats.ini");
  const achIniPath = path.join(gamePath, "achievements.ini");
  const achJsonPath = path.join(gamePath, "achievements.json");
  const remoteJsonPath = path.join(gamePath, "remote", "achievements.json");

  const links = resolveStatLinks(appIdStr, lang);
  const hasStatLinks = Array.isArray(links) && links.length > 0;

  if (hasStatLinks && await ffs.exists(statsPath)) {
    const achIniParsed = readIni(achIniPath);
    if (!hasClassicAchievementSections(achIniParsed)) {
      return { format: "stats-ini", filePath: statsPath, links, secondaryIniPath: achIniPath };
    }
  }

  for (const rel of ACHIEVEMENT_FILES) {
    const full = path.join(gamePath, rel);
    if (!(await ffs.exists(full))) continue;
    try {
      if (path.extname(full) === ".json") {
        const parsed = JSON.parse(await ffs.readFile(full, "utf8"));
        if (isGoldbergJson(parsed)) {
          return { format: "goldberg-json", filePath: full, links: hasStatLinks ? links : null };
        }
      } else {
        const parsed = readIni(full);
        if (rel === "stats.ini" && hasStatLinks) {
          return { format: "stats-ini", filePath: full, links, secondaryIniPath: achIniPath };
        }
        if (hasClassicAchievementSections(parsed)) {
          return { format: "ini-classic", filePath: full, links: hasStatLinks ? links : null };
        }
      }
    } catch (e) { /* try next */ }
  }

  if (hasStatLinks && await ffs.exists(statsPath)) {
    return { format: "stats-ini", filePath: statsPath, links, secondaryIniPath: achIniPath };
  }

  if (await ffs.exists(achIniPath)) {
    return { format: "ini-classic", filePath: achIniPath, links: hasStatLinks ? links : null };
  }

  if (await ffs.exists(achJsonPath)) {
    return { format: "goldberg-json", filePath: achJsonPath, links: hasStatLinks ? links : null };
  }

  if (await ffs.exists(remoteJsonPath)) {
    return { format: "goldberg-json", filePath: remoteJsonPath, links: hasStatLinks ? links : null };
  }

  return null;
}

function writeIniClassic(filePath, achievementList, namesToUnlock) {
  const parsed = readIni(filePath);
  const now = Math.floor(Date.now() / 1000);
  const unlockSet = new Set(namesToUnlock);

  for (const ach of achievementList) {
    if (!unlockSet.has(ach.name)) continue;
    const max = Number(ach.MaxProgress) > 0 ? Number(ach.MaxProgress) : 1;
    if (!parsed[ach.name] || typeof parsed[ach.name] !== "object") parsed[ach.name] = {};
    parsed[ach.name].Achieved = 1;
    parsed[ach.name].UnlockTime = now;
    parsed[ach.name].CurProgress = max;
    parsed[ach.name].MaxProgress = max;
  }

  backupFile(filePath);
  fs.writeFileSync(filePath, ini.stringify(parsed), "utf8");
  touchFile(filePath);
}

function writeStatsIni(filePath, links, namesToUnlock) {
  const parsed = readIni(filePath);
  const unlockSet = new Set(namesToUnlock);

  if (!parsed.UserStats || typeof parsed.UserStats !== "object" || Array.isArray(parsed.UserStats)) {
    parsed.UserStats = {};
  }

  for (const link of links) {
    if (!unlockSet.has(link.ach)) continue;
    const max = Number(link.max ?? link.min ?? 1);
    parsed.UserStats[link.stat] = max;
    parsed[link.stat] = max;
  }

  backupFile(filePath);
  fs.writeFileSync(filePath, ini.stringify(parsed), "utf8");
  touchFile(filePath);
}

function writeGoldbergJson(filePath, achievementList, namesToUnlock) {
  let parsed = {};
  if (fs.existsSync(filePath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      parsed = {};
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const unlockSet = new Set(namesToUnlock);

  for (const ach of achievementList) {
    if (!unlockSet.has(ach.name)) continue;
    const max = Number(ach.MaxProgress) > 0 ? Number(ach.MaxProgress) : 1;
    parsed[ach.name] = {
      earned: true,
      earned_time: now,
      progress: max,
      max_progress: max
    };
  }

  backupFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
  touchFile(filePath);
}

function namesWithoutStatLinks(links, namesToUnlock) {
  if (!Array.isArray(links) || links.length === 0) return namesToUnlock;
  const linked = new Set(links.map((l) => l.ach));
  return namesToUnlock.filter((n) => !linked.has(n));
}

async function unlock(game, namesToUnlock, lang) {
  if (!game || !game.data || game.data.type !== "file" || !game.data.path) {
    throw new Error("Este juego no usa archivos de emulador Steam (solo emuladores locales).");
  }
  if (!Array.isArray(namesToUnlock) || namesToUnlock.length === 0) {
    throw new Error("No hay logros que desbloquear.");
  }

  const store = await detectStore(game.data.path, game.appid, lang);
  if (!store) {
    throw new Error(`No se encontró archivo de logros en: ${game.data.path}`);
  }

  const achievementList = game.achievement && Array.isArray(game.achievement.list)
    ? game.achievement.list
    : [];

  switch (store.format) {
    case "stats-ini":
      writeStatsIni(store.filePath, store.links, namesToUnlock);
      {
        const extra = namesWithoutStatLinks(store.links, namesToUnlock);
        if (extra.length > 0 && store.secondaryIniPath) {
          writeIniClassic(store.secondaryIniPath, achievementList, extra);
        }
      }
      break;
    case "ini-classic":
      writeIniClassic(store.filePath, achievementList, namesToUnlock);
      if (store.links && store.links.length > 0) {
        const statsPath = path.join(game.data.path, "stats.ini");
        if (await ffs.exists(statsPath)) {
          writeStatsIni(statsPath, store.links, namesToUnlock);
        }
      }
      break;
    case "goldberg-json":
      writeGoldbergJson(store.filePath, achievementList, namesToUnlock);
      break;
    default:
      throw new Error(`Formato no soportado: ${store.format}`);
  }

  return {
    unlocked: namesToUnlock.length,
    store: store.format,
    filePath: store.filePath
  };
}

function getLockedNames(game) {
  if (!game || !game.achievement || !Array.isArray(game.achievement.list)) return [];
  return game.achievement.list.filter((a) => !a.Achieved).map((a) => a.name);
}

module.exports = {
  detectStore,
  unlock,
  getLockedNames,
  MASTER_CODES: ["platinum", "platino", "master"]
};
