"use strict";

const fs = require("fs");
const path = require("path");

function normalizeAppId(appId) {
  const value = String(appId || "").trim();
  if (!/^[1-9]\d{0,9}$/.test(value)) {
    throw new Error("ERR_MANUAL_APPID_INVALID");
  }
  return value;
}

async function load(filePath) {
  let contents;
  try {
    contents = await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  let appIds;
  try {
    appIds = JSON.parse(contents);
  } catch (error) {
    throw new Error("ERR_MANUAL_APPIDS_INVALID", { cause: error });
  }
  if (!Array.isArray(appIds)) throw new Error("ERR_MANUAL_APPIDS_INVALID");
  return [...new Set(appIds.map(normalizeAppId))];
}

async function add(filePath, appId) {
  const normalizedAppId = normalizeAppId(appId);
  const appIds = await load(filePath);
  if (appIds.includes(normalizedAppId)) return false;

  appIds.push(normalizedAppId);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, JSON.stringify(appIds, null, 2), "utf8");
    await fs.promises.rename(temporaryPath, filePath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true });
  }
  return true;
}

function toDiscoveredEntries(appIds, existingEntries) {
  const existing = new Set(existingEntries.map((entry) => String(entry.appid)));
  return appIds
    .filter((appId) => !existing.has(appId))
    .map((appId) => ({
      appid: appId,
      source: "Manual",
      data: { type: "manual" }
    }));
}

module.exports = { normalizeAppId, load, add, toDiscoveredEntries };
