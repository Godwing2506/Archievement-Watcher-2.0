#!/usr/bin/env node
"use strict";

/**
 * Valida que un juego específico esté listo para que
 * los logros se marquen en la app y (en emulador) para notificaciones.
 * Uso: node tools/validate-game.js <AppID>
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const APPID = process.argv[2];
if (!APPID) {
  console.error("Uso: node tools/validate-game.js <AppID>");
  process.exit(1);
}

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
const WATCHDOG_PORT = 8082; // Puerto real detectado en app.js y watchdog.js

const awNames = ["Achievement Watcher", "Achievement-Watcher"];

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch (e) {
    console.error(`Error checking path ${p}:`, e.message);
    return false;
  }
}

function readJson(p, def = null) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (exists(p)) console.error(`Error parsing JSON at ${p}:`, e.message);
    return def;
  }
}

function check(name, ok, detail) {
  const status = ok ? "OK" : "FALTA";
  console.log(`  [${status}] ${name}${detail ? ": " + detail : ""}`);
  return ok;
}

function getProcessOnPort(port) {
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));
    if (lines.length > 0) {
      const parts = lines[0].trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      const name = execSync(`tasklist /FI "PID eq ${pid}" /NH`).toString().split(/\s+/)[1];
      return { pid, name };
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function fetchSchemaFromApi() {
  return new Promise((resolve) => {
    const url = `https://api.xan105.com/steam/ach/${APPID}?lang=latam`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (ch) => (data += ch));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            resolve(j.error ? null : j.data);
          } catch (e) {
            console.error("  [ERROR] Al parsear respuesta de API:", e.message);
            resolve(null);
          }
        });
      })
      .on("error", (e) => {
        console.error("  [ERROR] Fallo de conexión con API:", e.message);
        resolve(null);
      });
  });
}

async function main() {
  console.log(`\n=== Validación de Juego (AppID: ${APPID}) ===\n`);

  let awRoot = null;
  for (const name of awNames) {
    const p = path.join(appData, name);
    if (exists(p)) {
      awRoot = p;
      break;
    }
  }

  if (!awRoot) {
    console.log("  [FALTA] Carpeta de Achievement Watcher en APPDATA (no se encontró Achievement Watcher ni Achievement-Watcher).");
    console.log("  Ejecuta la app al menos una vez para que se cree.\n");
    return;
  }
  check("Carpeta Achievement Watcher", true, awRoot);

  const cfgDir = path.join(awRoot, "cfg");
  const userdirPath = path.join(cfgDir, "userdir.db");
  check("Carpeta cfg", exists(cfgDir));
  const userdir = readJson(userdirPath, []);
  const hasUserDir = Array.isArray(userdir) && userdir.length > 0;
  check("userdir.db (carpetas de usuario)", hasUserDir, hasUserDir ? `${userdir.length} carpeta(s)` : "ninguna");

  const schemaDir = path.join(awRoot, "steam_cache", "schema");
  const schemaLatam = path.join(schemaDir, "latam");
  const cacheFile = path.join(schemaLatam, `${APPID}.db`);
  const schemaFromCache = exists(cacheFile);
  check("Schema en caché (app/watchdog)", schemaFromCache, schemaFromCache ? cacheFile : "FALTA. Abre el juego en la app para generarlo.");

  console.log("  [···] Comprobando API pública de esquema…");
  const schemaFromApi = await fetchSchemaFromApi();
  const apiOk = schemaFromApi && schemaFromApi.achievement && schemaFromApi.achievement.list;
  check("Schema vía API (xan105)", !!apiOk, apiOk ? `${schemaFromApi.achievement.list.length} logros` : "no disponible");

  console.log("  [···] Comprobando puerto del Watchdog…");
  const portOccupant = getProcessOnPort(WATCHDOG_PORT);
  check(`Puerto ${WATCHDOG_PORT} (Watchdog)`, !portOccupant || portOccupant.name.includes("node"), portOccupant ? `Ocupado por ${portOccupant.name} (PID: ${portOccupant.pid})` : "Libre / Listo");

  // --- Rutas de Emuladores ---
  const publicDir = process.env.PUBLIC || path.join(process.env.SystemRoot || "C:\\Windows", "..", "Users", "Public");
  
  const goldbergRoot = path.join(appData, "Goldberg SteamEmu Saves");
  const pathGoldberg = path.join(goldbergRoot, APPID);
  
  const runeRoot = path.join(publicDir, "Documents", "Steam", "RUNE");
  const pathRune = path.join(runeRoot, APPID);
  
  const codexRoot = path.join(publicDir, "Documents", "Steam", "CODEX");
  const pathCodex = path.join(codexRoot, APPID);
  
  const tenokeRoot = path.join(publicDir, "Documents", "Steam", "Tenoke");
  const pathTenoke = path.join(tenokeRoot, APPID);

  const emuPaths = [
    { name: "Goldberg", path: pathGoldberg },
    { name: "RUNE", path: pathRune },
    { name: "CODEX/PLAZA", path: pathCodex },
    { name: "Tenoke", path: pathTenoke }
  ];

  const foundEmu = emuPaths.find(e => exists(e.path));
  check(`Carpeta de logros/saves`, !!foundEmu, foundEmu ? `${foundEmu.name} -> ${foundEmu.path}` : "No se encontró ruta estándar. Añádela manualmente en Ajustes.");

  const logsDir = path.join(awRoot, "logs");
  check("Carpeta logs (depuración)", exists(logsDir), logsDir);

  const optionsIni = path.join(cfgDir, "options.ini");
  let notifyEnabled = false;
  if (exists(optionsIni)) {
    try {
      const ini = fs.readFileSync(optionsIni, "utf8");
      notifyEnabled = /notification\.notify\s*=\s*1/i.test(ini);
    } catch (e) { console.error('read options.ini', e); }
  }
  check("Notificaciones activadas (options.ini)", exists(optionsIni) && notifyEnabled, notifyEnabled ? "Sí" : "Revisa Ajustes → Notificaciones");

  const notifyLog = path.join(logsDir, "notification.log");
  if (exists(notifyLog)) {
    const stat = fs.statSync(notifyLog);
    const ageMin = Math.floor((Date.now() - stat.mtimeMs) / 60000);
    check("Log del watchdog (notification.log)", true, `última escritura hace ${ageMin} min - desbloquea un logro y revisa si aparece "Unlocked:" o "Outatime:"`);
  } else {
    console.log("  [···] notification.log no existe aún; el watchdog se crea al iniciar la app.");
  }

  const dataCache = path.join(awRoot, "steam_cache", "data", `${APPID}.db`);
  if (exists(dataCache)) {
    const cache = readJson(dataCache, null);
    const isArray = Array.isArray(cache);
    const count = isArray ? cache.filter(a => a?.Achieved).length : 0;
    check("Caché de logros (track)", isArray, isArray ? `${count} desbloqueados en caché` : "archivo corrupto o vacío");
  }

  console.log("\n--- Resumen ---");
  if (schemaFromCache || apiOk) {
    console.log("  El esquema de logros de RE4 está disponible; la app puede mostrar y marcar logros.");
  } else {
    console.log("  Sin esquema: pon Steam API Key en Ajustes o abre el juego en la app para cargar el esquema.");
  }
  if (emuOk) {
    console.log(`  El watchdog vigila por defecto la carpeta de ${emuName}; deberías recibir notificaciones al desbloquear.`);
  } else {
    console.log("  Si usas emulador en otra ruta, añádela en Ajustes → User directories con 'Notificar' activado.");
  }
  console.log("  IMPORTANTE: El watchdog debe estar en ejecución (Ajustes → Estado). Si no, reinicia Achievement Watcher.");
  console.log("  Para depurar: abre notification.log y desbloquea un logro; busca 'Unlocked:', 'Outatime:' o 'achievement file change detected'.");
  console.log("");
  console.log("--- Notificaciones en pantalla completa ---");
  console.log("  Si el mando vibra pero no ves la notificación:");
  console.log("  1. Asistente de concentración: Configuración Windows → Sistema → Asistente de concentración");
  console.log("     → 'Cuando juego' = Desactivado. Esto suele ser la causa.");
  console.log("  2. Centro de actividades: Revisa el icono de notificaciones (esquina inf. der.); a veces la notificación queda ahí.");
  console.log("  3. Modo ventana: En RE4 usa 'Ventana sin bordes' o 'Pantalla completa ventana'; las notificaciones se muestran mejor.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
