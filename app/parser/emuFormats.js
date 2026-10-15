"use strict";
// Parsers for gbe_fork / Goldberg JSON, OnlineFix INI and CreamAPI steam_settings.
// All return [{name, Achieved, UnlockTime, CurProgress, MaxProgress}] like steam.getAchievementsFromFile.
const fs = require("fs");
const path = require("path");

const toBool = (v) => v === true || v === 1 || /^(1|true)$/i.test(String(v ?? "").trim());
const toInt = (v) => parseInt(v, 10) || 0;

function parseGbeFork(text) {
  const json = JSON.parse(text);
  const items = Array.isArray(json) ? json.map(a => [a.name, a]) : Object.entries(json);
  return items.map(([name, a]) => ({
    name,
    Achieved: toBool(a.earned ?? a.achieved),
    UnlockTime: toInt(a.earned_time ?? a.unlock_time ?? a.time),
    CurProgress: toInt(a.progress),
    MaxProgress: toInt(a.max_progress)
  }));
}

function parseIniSections(text) {
  const out = {}; let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const s = line.match(/^\[(.+)\]$/);
    if (s) { cur = s[1]; out[cur] = out[cur] || {}; continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (kv && cur) out[cur][kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  return out;
}

function parseOnlineFix(text) {
  return Object.entries(parseIniSections(text))
    .filter(([k]) => !/^(steamachievements|stats)$/i.test(k))
    .map(([name, a]) => ({
      name,
      Achieved: toBool(a.achieved ?? a.unlocked),
      UnlockTime: toInt(a.timestamp ?? a.unlocktime ?? a.time),
      CurProgress: toInt(a.curprogress ?? a.progress),
      MaxProgress: toInt(a.maxprogress ?? a.max_progress)
    }));
}

// CreamAPI with steam_settings/achievements.json (schema) + optional cream_api.ini appid
function creamApiInfo(gameDir) {
  const info = { appid: null, schema: null };
  try {
    const ini = parseIniSections(fs.readFileSync(path.join(gameDir, "cream_api.ini"), "utf8"));
    info.appid = (ini.config || ini.steam || {}).appid || null;
  } catch {}
  try { info.schema = JSON.parse(fs.readFileSync(path.join(gameDir, "steam_settings", "achievements.json"), "utf8")); } catch {}
  return info;
}

function parseFile(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return path.extname(file).toLowerCase() === ".json" ? parseGbeFork(text) : parseOnlineFix(text);
}

module.exports = { parseGbeFork, parseOnlineFix, parseIniSections, creamApiInfo, parseFile };
