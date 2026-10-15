'use strict';

/**
 * Backup achievement file watcher running in the Electron main process.
 * Independent from the Watchdog service: if the Watchdog is down, filtered the event
 * or notifications are disabled, the UI still receives a refresh signal.
 */
const fs = require("fs");
const path = require("path");

const DEBOUNCE_MS = 600;
const RELEVANT = /\.(ini|json|bin|dat|db|sfo|trp|dat)$/i;

let watchers = new Map(); // dir -> { watcher, appids:Set }
let timers = new Map();   // appid -> timeout
let sendFn = () => {};

function emit(appid, file) {
  clearTimeout(timers.get(appid));
  timers.set(appid, setTimeout(() => {
    timers.delete(appid);
    sendFn({ type: "achievements-changed", appID: String(appid), path: file, source: "main-watcher", time: Date.now() });
  }, DEBOUNCE_MS));
}

function watchDir(dir, appid) {
  const key = path.normalize(dir).toLowerCase();
  const existing = watchers.get(key);
  if (existing) { existing.appids.add(String(appid)); return; }
  let stat;
  try { stat = fs.statSync(dir); } catch { return; }
  const target = stat.isDirectory() ? dir : path.dirname(dir);
  try {
    const entry = { appids: new Set([String(appid)]), watcher: null };
    // recursive is natively supported on Windows (and macOS); on other OS fall back to non-recursive
    const opts = { persistent: false, recursive: process.platform === "win32" || process.platform === "darwin" };
    entry.watcher = fs.watch(target, opts, (evt, filename) => {
      if (filename && !RELEVANT.test(String(filename))) return;
      for (const id of entry.appids) emit(id, filename ? path.join(target, String(filename)) : target);
    });
    entry.watcher.on("error", () => { try { entry.watcher.close(); } catch {} watchers.delete(key); });
    watchers.set(key, entry);
  } catch (e) { /* folder not watchable */ }
}

function clear() {
  for (const { watcher } of watchers.values()) { try { watcher.close(); } catch {} }
  watchers.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

/** games: [{ appid, paths: [string] }] */
function setTargets(games = []) {
  clear();
  for (const g of games) {
    if (!g || !g.appid || !Array.isArray(g.paths)) continue;
    for (const p of g.paths) if (typeof p === "string" && p.length > 0) watchDir(p, g.appid);
  }
  return watchers.size;
}

function init(send) { sendFn = typeof send === "function" ? send : sendFn; }

module.exports = { init, setTargets, clear };
