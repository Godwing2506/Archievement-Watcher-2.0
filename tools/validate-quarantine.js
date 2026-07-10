#!/usr/bin/env node
"use strict";

/**
 * Valida Quarantine Zone: The Last Check (AppID 3419520) para Achievement Watcher.
 * Ejecutar desde la raíz: node tools/validate-quarantine.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const APPID = "3419520";
const APP_NAME = "Quarantine Zone: The Last Check";

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
const awNames = ["Achievement Watcher", "Achievement-Watcher"];
const goldbergRoot = path.join(appData, "Goldberg SteamEmu Saves");
const goldbergApp = path.join(goldbergRoot, APPID);
const goldbergAch = path.join(goldbergApp, "achievements.json");

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "[OK]" : "[FALTA]"} ${label}${detail ? " — " + detail : ""}`);
}

function fetchSchemaFromApi() {
  return new Promise((resolve) => {
    https.get(`https://api.xan105.com/steam/ach/${APPID}?lang=latam`, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          resolve(data.data || null);
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

async function main() {
  console.log(`\n=== Validación ${APP_NAME} (${APPID}) ===\n`);

  check("Carpeta Goldberg", exists(goldbergRoot), goldbergRoot);
  check("Carpeta del juego (Goldberg)", exists(goldbergApp), goldbergApp);
  check("achievements.json (progreso local)", exists(goldbergAch), goldbergAch);

  if (exists(goldbergAch)) {
    try {
      const raw = JSON.parse(fs.readFileSync(goldbergAch, "utf8"));
      const keys = Object.keys(raw).filter((k) => typeof raw[k] === "object");
      const unlocked = keys.filter((k) => raw[k].earned === true || raw[k].earned === 1).length;
      check("Formato Goldberg (earned/progress)", keys.length > 0, `${keys.length} logros en archivo, ${unlocked} desbloqueados`);
    } catch (e) {
      check("Formato achievements.json", false, String(e.message || e));
    }
  }

  console.log("  [···] Comprobando esquema público…");
  const schema = await fetchSchemaFromApi();
  const total = schema && schema.achievement && schema.achievement.list ? schema.achievement.list.length : 0;
  check("Esquema de logros (API/store)", total > 0, total > 0 ? `${total} logros definidos` : "Configura Steam API Key en Ajustes");

  let awRoot = null;
  for (const name of awNames) {
    const p = path.join(appData, name);
    if (exists(p)) { awRoot = p; break; }
  }
  if (awRoot) {
    const cacheFile = path.join(awRoot, "steam_cache", "schema", "latam", `${APPID}.db`);
    check("Schema en caché local", exists(cacheFile), cacheFile);
    const parserLog = path.join(awRoot, "logs", "parser.log");
    if (exists(parserLog)) {
      const tail = fs.readFileSync(parserLog, "utf8").split("\n").slice(-40).join("\n");
      const mentions = tail.includes(APPID);
      check("parser.log menciona el AppID", mentions, mentions ? "revisa líneas [DIAG]" : "refresca la lista en la app");
    }
  }

  console.log("\n--- Resumen ---");
  if (!exists(goldbergApp)) {
    console.log("  El juego no aparece en Goldberg Saves. Juega al menos una vez con el emulador activo.");
  } else if (!exists(goldbergAch)) {
    console.log("  Falta achievements.json: asegúrate de tener steam_settings/achievements.json junto al juego (Goldberg).");
  } else {
    console.log("  Los datos locales existen; con el fix de escaneo Goldberg la app debería detectar este juego.");
  }
  console.log("  Steam API Key en Ajustes → Avanzado mejora nombres/iconos de logros.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
