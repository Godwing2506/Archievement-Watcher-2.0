"use strict";
// Centralized list of emulator save locations (Windows env-based).
const path = require("path");
const fs = require("fs");

const env = (k) => process.env[k] || "";
const docs = () => path.join(env("USERPROFILE"), "Documents");

const EMULATORS = [
  { id: "gbe_fork", name: "GBE Fork", roots: () => [path.join(env("APPDATA"), "GSE Saves")], files: ["achievements.json"], parser: "gbeFork" },
  { id: "goldberg", name: "Goldberg", roots: () => [path.join(env("APPDATA"), "Goldberg SteamEmu Saves")], files: ["achievements.json"], parser: "gbeFork" },
  { id: "onlinefix", name: "OnlineFix", roots: () => [path.join(env("PUBLIC"), "Documents", "OnlineFix"), path.join(env("APPDATA"), "OnlineFix")], files: [path.join("Stats", "Achievements.ini"), "achievements.ini"], parser: "onlineFix" },
  { id: "codex", name: "CODEX", roots: () => [path.join(env("PUBLIC"), "Documents", "Steam", "CODEX"), path.join(env("APPDATA"), "Steam", "CODEX")], files: ["achievements.ini"], parser: "steam" },
  { id: "rune", name: "RUNE", roots: () => [path.join(env("PUBLIC"), "Documents", "Steam", "RUNE")], files: ["achievements.ini"], parser: "steam" },
  { id: "empress", name: "EMPRESS", roots: () => [path.join(env("APPDATA"), "EMPRESS"), path.join(env("PUBLIC"), "Documents", "EMPRESS")], files: [path.join("remote", "achievements.json")], parser: "steam" },
  { id: "creamapi", name: "CreamAPI", roots: () => [path.join(env("APPDATA"), "CreamAPI")], files: [path.join("stats", "achievements.ini"), "achievements.ini"], parser: "steam" },
  { id: "skidrow", name: "SKIDROW", roots: () => [path.join(docs(), "SKIDROW")], files: ["achievements.ini"], parser: "steam" }
];

function list() {
  return EMULATORS.map(e => ({ ...e, roots: e.roots().filter(Boolean) }));
}

function allRoots() {
  return list().flatMap(e => e.roots);
}

// Returns [{appid, source, data:{type:"file", path, emulator}}]
async function scan() {
  const out = [];
  for (const emu of list()) {
    for (const root of emu.roots) {
      let dirs = [];
      try { dirs = await fs.promises.readdir(root, { withFileTypes: true }); } catch { continue; }
      for (const d of dirs) {
        if (!d.isDirectory() || !/^\d+$/.test(d.name)) continue;
        for (const f of emu.files) {
          const p = path.join(root, d.name, f);
          if (fs.existsSync(p)) {
            out.push({ appid: d.name, source: emu.name, data: { type: "file", path: path.dirname(p), file: p, emulator: emu.id } });
            break;
          }
        }
      }
    }
  }
  return out;
}

module.exports = { EMULATORS, list, allRoots, scan };
