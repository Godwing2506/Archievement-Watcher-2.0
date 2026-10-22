'use strict';

const path = require('path');
const fs = require('fs');
const ini = require('@xan105/ini');
const ffs = require('@xan105/fs');
const AdmZip = require('adm-zip');
const regedit = require('./reg_shim');

const BACKUP_FORMAT_VERSION = 1;
const BACKUP_EXTENSION = '.awbackup.zip';

/** Carpetas relativas a userData que contienen progreso y configuración esencial */
const DATA_DIRS = [
  'cfg',
  'steam_cache/data',
  'steam_cache/user',
  'uplay_cache'
];
const BACKUP_DIRS = DATA_DIRS;

const PLAYTIME_REG = 'SOFTWARE/Achievement Watcher/Playtime/Steam';
const PLAYTIME_ZIP_PATH = 'cfg/playtime_export.json';

function getUserDataRoot() {
  const remote = require('@electron/remote');
  return remote.app.getPath('userData');
}

async function walkDir(dir, baseDir, files) {
  if (!fs.existsSync(dir)) return;
  const fsp = fs.promises;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(baseDir, full).split(path.sep).join('/');
    if (ent.isDirectory()) {
      await walkDir(full, baseDir, files);
    } else if (ent.isFile()) {
      files.push({ abs: full, rel });
    }
  }
}

async function exportPlaytime() {
  const playtime = {};
  try {
    if (!regedit.RegKeyExists('HKCU', PLAYTIME_REG)) return playtime;
    const appids = regedit.RegListAllSubkeys('HKCU', PLAYTIME_REG);
    for (const appid of appids) {
      const key = `${PLAYTIME_REG}\\${appid}`;
      playtime[appid] = {
        total: regedit.RegQueryIntegerValue('HKCU', key, 'total') || 0,
        last: regedit.RegQueryIntegerValue('HKCU', key, 'last') || 0
      };
    }
  } catch (e) {
    console.error('exportPlaytime', e);
  }
  return playtime;
}

async function importPlaytime(data) {
  if (!data || typeof data !== 'object') return;
  for (const appid of Object.keys(data)) {
    const row = data[appid];
    if (!row || typeof row !== 'object') continue;
    const key = `${PLAYTIME_REG}\\${appid}`;
    try {
      await regedit.promises.RegWriteDwordValue('HKCU', key, 'total', row.total || 0);
      await regedit.promises.RegWriteDwordValue('HKCU', key, 'last', row.last || 0);
    } catch (e) {
      console.error('importPlaytime', appid, e);
    }
  }
}

/**
 * @returns {{ path: string, stats: { files: number, bytes: number } }}
 */
module.exports.exportBackup = async (destPath) => {
  const userData = getUserDataRoot();
  const manifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    app: 'Achievement-Watcher',
    createdAt: new Date().toISOString(),
    userDataFolder: path.basename(userData)
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  let fileCount = 0;
  let totalBytes = 0;

  for (const relDir of DATA_DIRS) {
    const absDir = path.join(userData, relDir);
    const list = [];
    await walkDir(absDir, userData, list);
    for (const { abs, rel } of list) {
      if (rel === PLAYTIME_ZIP_PATH) continue;
      const buf = await ffs.readFile(abs);
      zip.addFile(rel.split(path.sep).join('/'), buf);
      fileCount += 1;
      totalBytes += buf.length;
    }
  }

  const playtime = await exportPlaytime();
  const ptBuf = Buffer.from(JSON.stringify(playtime, null, 2), 'utf8');
  zip.addFile(PLAYTIME_ZIP_PATH, ptBuf);
  fileCount += 1;
  totalBytes += ptBuf.length;

  const tempPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    zip.writeZip(tempPath);
    const stat = await fs.promises.stat(tempPath);
    if (stat.size === 0) throw new Error('ERR_BACKUP_WRITE_FAILED');
    await module.exports.validateBackup(tempPath);
    await fs.promises.rename(tempPath, destPath);
  } finally {
    await fs.promises.rm(tempPath, { force: true });
  }
  return { path: destPath, stats: { files: fileCount, bytes: totalBytes } };
};

module.exports.validateConfig = async (iniPath) => {
  if (!fs.existsSync(iniPath)) throw new Error('ERR_BACKUP_NOT_FOUND');
  if (path.extname(iniPath).toLowerCase() !== '.ini') throw new Error('ERR_BACKUP_INVALID');
  const content = await ffs.readFile(iniPath, 'utf8');
  let parsed;
  try {
    parsed = ini.parse(content);
  } catch {
    throw new Error('ERR_BACKUP_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.achievement) {
    throw new Error('ERR_BACKUP_INVALID');
  }
  return true;
};

module.exports.importConfig = async (iniPath) => {
  await module.exports.validateConfig(iniPath);

  const userData = getUserDataRoot();
  const cfgDir = path.join(userData, 'cfg');
  await ffs.mkdir(cfgDir, { recursive: true });
  const dest = path.join(cfgDir, 'options.ini');
  await fs.promises.copyFile(iniPath, dest);
  return { path: dest };
};

function defaultBackupFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `Achievement-Watcher-Backup-${stamp}${BACKUP_EXTENSION}`;
}

module.exports.defaultBackupFilename = defaultBackupFilename;
module.exports.BACKUP_EXTENSION = BACKUP_EXTENSION;

function validateArchiveEntryName(entryName) {
  const name = entryName.replace(/\\/g, '/');
  if (!name || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null;
  const segments = name.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  if (name === PLAYTIME_ZIP_PATH) return name;
  if (BACKUP_DIRS.some((dir) => name.startsWith(`${dir}/`))) return name;
  return null;
}

module.exports.validateBackup = async (zipPath) => {
  if (!fs.existsSync(zipPath)) throw new Error('ERR_BACKUP_NOT_FOUND');

  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const manifestEntries = entries.filter((entry) => entry.entryName.replace(/\\/g, '/') === 'manifest.json');
    if (manifestEntries.length !== 1) throw new Error('ERR_BACKUP_INVALID');

    let manifest;
    try {
      manifest = JSON.parse(zip.readAsText(manifestEntries[0]));
    } catch {
      throw new Error('ERR_BACKUP_INVALID');
    }
    if (!manifest || manifest.app !== 'Achievement-Watcher') throw new Error('ERR_BACKUP_INVALID');
    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error('ERR_BACKUP_VERSION');
    if (typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) {
      throw new Error('ERR_BACKUP_INVALID');
    }

    const seen = new Set(['manifest.json']);
    let playtimeEntry = null;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.replace(/\\/g, '/');
      if (name === 'manifest.json') continue;
      if (!validateArchiveEntryName(name) || seen.has(name)) throw new Error('ERR_BACKUP_INVALID');
      seen.add(name);
      entry.getData();
      if (name === PLAYTIME_ZIP_PATH) playtimeEntry = entry;
    }

    if (!playtimeEntry) throw new Error('ERR_BACKUP_INVALID');
    let playtime;
    try {
      playtime = JSON.parse(zip.readAsText(playtimeEntry));
    } catch {
      throw new Error('ERR_BACKUP_INVALID');
    }
    if (!playtime || typeof playtime !== 'object' || Array.isArray(playtime)) {
      throw new Error('ERR_BACKUP_INVALID');
    }
    for (const [appid, row] of Object.entries(playtime)) {
      if (!/^\d+$/.test(appid) || !row || typeof row !== 'object' || Array.isArray(row)
        || !Number.isInteger(row.total) || row.total < 0 || row.total > 0xffffffff
        || !Number.isInteger(row.last) || row.last < 0 || row.last > 0xffffffff) {
        throw new Error('ERR_BACKUP_INVALID');
      }
    }
    return { files: seen.size - 1, createdAt: manifest.createdAt };
  } catch (err) {
    if (err && (err.message === 'ERR_BACKUP_INVALID' || err.message === 'ERR_BACKUP_VERSION')) throw err;
    throw new Error('ERR_BACKUP_INVALID', { cause: err });
  }
};

/**
 * @returns {{ filesRestored: number, playtimeGames: number }}
 */
module.exports.importBackup = async (zipPath) => {
  await module.exports.validateBackup(zipPath);
  const zip = new AdmZip(zipPath);

  const userData = getUserDataRoot();
  let filesRestored = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, '/');
    if (name === 'manifest.json') continue;
    if (name === PLAYTIME_ZIP_PATH) continue;

    const dest = path.join(userData, ...name.split('/'));
    await ffs.mkdir(path.dirname(dest), { recursive: true });
    const tempPath = `${dest}.${process.pid}.${Date.now()}.tmp`;
    try {
      await ffs.writeFile(tempPath, entry.getData());
      await fs.promises.rename(tempPath, dest);
    } finally {
      await fs.promises.rm(tempPath, { force: true });
    }
    filesRestored += 1;
  }

  const ptEntry = zip.getEntry(PLAYTIME_ZIP_PATH);
  let playtimeGames = 0;
  if (ptEntry) {
    const playtime = JSON.parse(zip.readAsText(ptEntry));
    playtimeGames = Object.keys(playtime).length;
    await importPlaytime(playtime);
  }

  return { filesRestored, playtimeGames };
};

module.exports.describeBackupContents = () => ({
  includes: [
    'options.ini (ajustes y clave API cifrada)',
    'Carpetas personalizadas y lista negra',
    'Registro de logros desbloqueados (notificaciones y progreso local)',
    'Caché de usuario Steam / Uplay',
    'Tiempo de juego registrado en Windows (registro)'
  ],
  excludes: [
    'Cachés de iconos y esquemas (se vuelven a descargar)',
    'Logs'
  ]
});
