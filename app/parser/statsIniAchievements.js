"use strict";

const fs = require("fs");
const path = require("path");

const SCHEMA_ROOTS = [
  path.join(process.env.APPDATA || "", "Achievement Watcher", "steam_cache", "schema"),
  path.join(process.env.APPDATA || "", "Achievement-Watcher", "steam_cache", "schema")
];
const FALLBACK_LANGS = ["latam", "spanish", "english"];

/** Build stat→achievement links from Steam API schema (progress.stat_name / max_val). */
function buildAchievementStatLinks(achievements) {
  if (!Array.isArray(achievements)) return [];
  const links = [];
  for (const ach of achievements) {
    const progress = ach && ach.progress;
    if (!progress || !progress.stat_name) continue;
    links.push({
      ach: ach.name,
      stat: progress.stat_name,
      max: Number(progress.max_val ?? progress.min_val ?? 1)
    });
  }
  return links;
}

function loadCachedSchema(appId, lang) {
  const langs = lang ? [lang, ...FALLBACK_LANGS.filter((l) => l !== lang)] : FALLBACK_LANGS;
  for (const root of SCHEMA_ROOTS) {
    for (const l of langs) {
      const filePath = path.join(root, l, `${appId}.db`);
      try {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
      } catch (e) { /* try next */ }
    }
  }
  return null;
}

function loadFallbackLinks(appId) {
  const filePath = path.join(__dirname, "statAchievementFallback", `${appId}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data.links) ? data.links : null;
  } catch (e) {
    return null;
  }
}

function resolveStatLinks(appId, lang) {
  const schema = loadCachedSchema(appId, lang);
  if (schema && Array.isArray(schema.achievementStatLinks) && schema.achievementStatLinks.length > 0) {
    return schema.achievementStatLinks;
  }
  if (schema && schema.achievement && Array.isArray(schema.achievement.list)) {
    const fromSchema = buildAchievementStatLinks(schema.achievement.list);
    if (fromSchema.length > 0) return fromSchema;
  }
  return loadFallbackLinks(appId);
}

function extractUserStats(local) {
  if (!local || typeof local !== "object" || Array.isArray(local)) return null;
  if (local.UserStats && typeof local.UserStats === "object" && !Array.isArray(local.UserStats)) {
    return local.UserStats;
  }
  const statKeys = Object.keys(local).filter((k) => k.startsWith("stat_"));
  if (statKeys.length === 0) return null;
  const stats = {};
  for (const k of statKeys) stats[k] = local[k];
  return stats;
}

function convertUserStats(userStats, links) {
  const result = {};
  for (const link of links) {
    const val = Number(userStats[link.stat] ?? 0);
    const target = Number(link.max ?? link.min ?? 1);
    const achieved = Number.isFinite(val) && val >= target;
    result[link.ach] = {
      Achieved: achieved ? 1 : 0,
      CurProgress: val,
      MaxProgress: target,
      UnlockTime: 0
    };
  }
  return result;
}

function hasClassicAchievementSections(local) {
  if (!local || typeof local !== "object" || Array.isArray(local)) return false;
  for (const key of Object.keys(local)) {
    if (key === "SteamAchievements" || key === "Steam64" || key === "Steam" || key === "UserStats") continue;
    const val = local[key];
    if (typeof val === "object" && val !== null &&
        (val.Achieved !== undefined || val.achieved !== undefined || val.earned !== undefined ||
         val.State !== undefined || val.UnlockTime !== undefined)) {
      return true;
    }
  }
  if (local.SteamAchievements && Number(local.SteamAchievements.Count) > 0) return true;
  return false;
}

function statsLocalToAchievements(local, appId, lang) {
  const userStats = extractUserStats(local);
  if (!userStats) return null;
  const links = resolveStatLinks(appId, lang);
  if (!links || links.length === 0) return null;
  return convertUserStats(userStats, links);
}

const normalizeGoldbergUserAchievements = require("./goldbergAchievements.js").normalizeGoldbergUserAchievements;

module.exports = {
  buildAchievementStatLinks,
  extractUserStats,
  convertUserStats,
  normalizeGoldbergUserAchievements,
  resolveStatLinks,
  hasClassicAchievementSections,
  statsLocalToAchievements
};
