#!/usr/bin/env node
"use strict";
/**
 * Validación de entorno y rutas (ejecutar con Node, sin Electron).
 * Comprueba que existan carpetas y archivos necesarios para que la app funcione.
 * Uso: node validate-setup.js
 */

const path = require("path");
const fs = require("fs");

const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
const appDataRoot = path.join(APPDATA, "Achievement Watcher");
const cfgDir = path.join(appDataRoot, "cfg");
const logsDir = path.join(appDataRoot, "logs");
const optionsIni = path.join(cfgDir, "options.ini");

const appRoot = path.join(__dirname);
const requiredDirs = [
  path.join(appRoot, "parser"),
  path.join(appRoot, "locale", "lang"),
  path.join(appRoot, "resources"),
  path.join(appRoot, "view"),
  path.join(appRoot, "electron"),
];
const requiredFiles = [
  path.join(appRoot, "package.json"),
  path.join(appRoot, "parser", "achievements.js"),
  path.join(appRoot, "parser", "steam.js"),
  path.join(appRoot, "settings.js"),
  path.join(appRoot, "util", "aes.js"),
  path.join(appRoot, "util", "resolveAppPath.js"),
  path.join(appRoot, "locale", "steam.json"),
  path.join(appRoot, "resources", "font", "fontawesome", "fa-solid-900.woff2"),
  path.join(appRoot, "resources", "font", "fontawesome", "fa-regular-400.woff2"),
  path.join(appRoot, "resources", "font", "fontawesome", "fa-brands-400.woff2"),
];

let ok = true;

console.log("=== Validación Achievement Watcher ===\n");

console.log("1. Carpetas de la app:");
for (const dir of requiredDirs) {
  const exists = fs.existsSync(dir);
  console.log(`   ${exists ? "OK" : "FALTA"}: ${path.relative(appRoot, dir) || dir}`);
  if (!exists) ok = false;
}

console.log("\n2. Archivos de la app:");
for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? "OK" : "FALTA"}: ${path.relative(appRoot, file) || file}`);
  if (!exists) ok = false;
}

console.log("\n3. Datos de usuario (APPDATA):");
console.log(`   APPDATA: ${APPDATA}`);
const appDataRootHyphen = path.join(APPDATA, "Achievement-Watcher");
const cfgDirHyphen = path.join(appDataRootHyphen, "cfg");
const logsDirHyphen = path.join(appDataRootHyphen, "logs");
const optionsIniHyphen = path.join(cfgDirHyphen, "options.ini");
const ex = (v) => v ? "existe" : "no";
console.log(`   'Achievement Watcher' (espacio): cfg=${ex(fs.existsSync(cfgDir))}, logs=${ex(fs.existsSync(logsDir))}, options.ini=${ex(fs.existsSync(optionsIni))}`);
console.log(`   'Achievement-Watcher' (guión):  cfg=${ex(fs.existsSync(cfgDirHyphen))}, logs=${ex(fs.existsSync(logsDirHyphen))}, options.ini=${ex(fs.existsSync(optionsIniHyphen))}`);
const parserLog = fs.existsSync(logsDirHyphen) ? path.join(logsDirHyphen, "parser.log") : path.join(logsDir, "parser.log");
console.log(`   parser.log (diagnóstico): ${fs.existsSync(parserLog) ? parserLog : "aún no generado (ejecuta npm start y espera)"}`);

const iniToRead = fs.existsSync(optionsIniHyphen) ? optionsIniHyphen : optionsIni;
if (fs.existsSync(iniToRead)) {
  try {
    const content = fs.readFileSync(iniToRead, "utf8");
    const langMatch = content.match(/lang\s*=\s*(\w+)/);
    const hasKey = /\[steam\]/i.test(content) && content.includes("apiKey");
    console.log(`   options.ini (${path.basename(path.dirname(iniToRead))}): lang=${langMatch ? langMatch[1] : "?"}, steam key=${hasKey ? "configurado" : "no"}`);
  } catch (e) {
    console.log(`   (no se pudo leer: ${e.message})`);
  }
}

console.log("\n4. Para validar logros en vivo:");
console.log("   Ejecuta: npm start");
console.log("   Abre la consola (F12) y revisa los mensajes [DIAG].");
console.log("   O revisa: " + parserLog);

console.log(ok ? "\nValidación de estructura: OK" : "\nHay elementos faltantes.");
process.exit(ok ? 0 : 1);
