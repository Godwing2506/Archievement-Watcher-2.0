"use strict";

/** Parse Goldberg / gbe_fork user progress from achievements.json (object keyed by apiname). */
module.exports.normalizeGoldbergUserAchievements = function normalizeGoldbergUserAchievements(local) {
  if (!local || typeof local !== "object" || Array.isArray(local)) return null;

  const reserved = new Set(["SteamAchievements", "Steam64", "Steam"]);
  const keys = Object.keys(local).filter((k) => !reserved.has(k));
  if (keys.length === 0) return null;

  const looksLikeGoldberg = keys.every((k) => {
    const entry = local[k];
    return entry && typeof entry === "object" &&
      (entry.earned !== undefined || entry.progress !== undefined || entry.max_progress !== undefined);
  });
  if (!looksLikeGoldberg) return null;

  const result = {};
  for (const name of keys) {
    const entry = local[name];
    result[name] = {
      Achieved: entry.earned ? 1 : 0,
      UnlockTime: entry.earned_time || entry.UnlockTime || 0,
      CurProgress: entry.progress || 0,
      MaxProgress: entry.max_progress || 0
    };
  }
  return result;
};
