'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIRS } = require('./backupPaths');

const SETTINGS_FILE = 'auto-backup.json';
const AUTO_BACKUP_PREFIX = 'Achievement-Watcher-AutoBackup-';
const AUTO_BACKUP_PATTERN = /^Achievement-Watcher-AutoBackup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}\.awbackup\.zip$/;
const MAX_AUTO_BACKUPS = 10;
const DEFAULT_DEBOUNCE_MS = 2000;

function isWithin(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`)
    && relativePath !== '..'
    && !path.isAbsolute(relativePath));
}

function toErrorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function createAutoBackupManager(options) {
  if (!options || typeof options.userDataPath !== 'string' || !options.backup) {
    throw new TypeError('userDataPath and backup are required');
  }

  const fileSystem = options.fileSystem || fs;
  const watch = options.watch || fs.watch;
  const debounceMs = Number.isFinite(options.debounceMs)
    ? Math.max(0, options.debounceMs)
    : DEFAULT_DEBOUNCE_MS;
  const now = options.now || (() => new Date());
  const makeId = options.makeId || (() => crypto.randomBytes(4).toString('hex'));
  const logger = options.logger || console;
  const settingsPath = path.join(options.userDataPath, SETTINGS_FILE);

  const defaultSettings = () => ({
    enabled: false,
    directoryPath: '',
    lastBackupAt: null,
    lastBackupDirectory: null,
    lastDataSignature: null,
    lastError: null
  });
  let settings = defaultSettings();
  let watchers = [];
  let debounceTimer = null;
  let backupPromise = null;
  let backupQueued = false;
  let stopped = false;
  let suspended = false;
  const listeners = new Set();

  function getStatusValue() {
    return {
      enabled: settings.enabled,
      directoryPath: settings.directoryPath,
      lastBackupAt: settings.lastBackupAt,
      lastError: settings.lastError,
      isBackingUp: !!backupPromise
    };
  }

  function emitStatus() {
    const status = getStatusValue();
    for (const listener of listeners) {
      try {
        listener(status);
      } catch (error) {
        logger.error('[AutoBackup] Status listener failed:', error);
      }
    }
  }

  function setError(error) {
    settings.lastError = toErrorMessage(error);
    logger.error('[AutoBackup]', settings.lastError);
    emitStatus();
  }

  async function persistSettings() {
    await fileSystem.promises.mkdir(path.dirname(settingsPath), { recursive: true });
    const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fileSystem.promises.writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
      await fileSystem.promises.rename(tempPath, settingsPath);
    } finally {
      await fileSystem.promises.rm(tempPath, { force: true });
    }
  }

  async function readSettings() {
    let content;
    try {
      content = await fileSystem.promises.readFile(settingsPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        settings = defaultSettings();
        return;
      }
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error('ERR_BACKUP_SETTINGS_INVALID', { cause: error });
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || typeof parsed.enabled !== 'boolean'
      || typeof parsed.directoryPath !== 'string'
      || (parsed.lastBackupAt !== null
        && typeof parsed.lastBackupAt !== 'string')
      || (parsed.lastBackupDirectory !== null
        && typeof parsed.lastBackupDirectory !== 'string')
      || (parsed.lastDataSignature !== null
        && typeof parsed.lastDataSignature !== 'string')) {
      throw new Error('ERR_BACKUP_SETTINGS_INVALID');
    }

    settings = {
      enabled: parsed.enabled,
      directoryPath: parsed.directoryPath,
      lastBackupAt: parsed.lastBackupAt,
      lastBackupDirectory: parsed.lastBackupDirectory,
      lastDataSignature: parsed.lastDataSignature,
      lastError: null
    };
  }

  async function getSourceDirectories() {
    const roots = [];
    for (const relativePath of DATA_DIRS) {
      const sourcePath = path.join(options.userDataPath, ...relativePath.split('/'));
      await fileSystem.promises.mkdir(sourcePath, { recursive: true });
      roots.push(await fileSystem.promises.realpath(sourcePath));
    }
    return roots;
  }

  async function validateDestination(directoryPath, sourceDirectories) {
    if (typeof directoryPath !== 'string' || !directoryPath.trim()) {
      throw new Error('ERR_BACKUP_DESTINATION_REQUIRED');
    }

    const resolvedPath = path.resolve(directoryPath);
    let stats;
    try {
      stats = await fileSystem.promises.stat(resolvedPath);
    } catch (error) {
      throw new Error('ERR_BACKUP_DESTINATION_INVALID', { cause: error });
    }
    if (!stats.isDirectory()) throw new Error('ERR_BACKUP_DESTINATION_INVALID');

    let realPath;
    try {
      realPath = await fileSystem.promises.realpath(resolvedPath);
      await fileSystem.promises.access(realPath, fileSystem.constants.W_OK);
    } catch (error) {
      throw new Error('ERR_BACKUP_DESTINATION_INVALID', { cause: error });
    }

    const destinationKey = process.platform === 'win32' ? realPath.toLowerCase() : realPath;
    for (const sourceDirectory of sourceDirectories) {
      const sourceKey = process.platform === 'win32' ? sourceDirectory.toLowerCase() : sourceDirectory;
      if (isWithin(sourceKey, destinationKey)) {
        throw new Error('ERR_BACKUP_DESTINATION_INVALID');
      }
    }
    return realPath;
  }

  async function collectFiles(rootPath, relativeRoot, output) {
    let entries;
    try {
      entries = await fileSystem.promises.readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(rootPath, entry.name);
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, relativePath, output);
      } else if (entry.isFile()) {
        const stats = await fileSystem.promises.stat(fullPath);
        output.push({
          path: relativePath.split(path.sep).join('/'),
          size: stats.size,
          mtimeMs: stats.mtimeMs
        });
      }
    }
  }

  async function getDataSignature() {
    const files = [];
    for (const relativePath of DATA_DIRS) {
      const rootPath = path.join(options.userDataPath, ...relativePath.split('/'));
      await collectFiles(rootPath, relativePath, files);
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    const hash = crypto.createHash('sha256');
    for (const file of files) {
      hash.update(`${file.path}\0${file.size}\0${file.mtimeMs}\n`);
    }
    return hash.digest('hex');
  }

  async function startWatching() {
    await closeWatchers();
    if (!settings.enabled || stopped || suspended) return;

    const sourceDirectories = await getSourceDirectories();
    await validateDestination(settings.directoryPath, sourceDirectories);
    try {
      for (const sourceDirectory of sourceDirectories) {
        const watcher = watch(sourceDirectory, { recursive: true, persistent: false }, () => {
          scheduleBackup();
        });
        if (typeof watcher.on === 'function') {
          watcher.on('error', (error) => setError(error));
        }
        watchers.push(watcher);
      }
    } catch (error) {
      await closeWatchers();
      throw new Error('ERR_BACKUP_WATCH_FAILED', { cause: error });
    }
  }

  async function closeWatchers() {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch (error) {
        logger.error('[AutoBackup] Failed to close file watcher:', error);
      }
    }
    watchers = [];
  }

  async function pruneOldBackups() {
    const entries = await fileSystem.promises.readdir(settings.directoryPath, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && AUTO_BACKUP_PATTERN.test(entry.name))
      .map(async (entry) => {
        try {
          return {
            name: entry.name,
            mtimeMs: (await fileSystem.promises.stat(path.join(settings.directoryPath, entry.name))).mtimeMs
          };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }));
    const existingFiles = files.filter(Boolean);
    existingFiles.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));

    const outdated = existingFiles.slice(MAX_AUTO_BACKUPS);
    for (const file of outdated) {
      try {
        await fileSystem.promises.unlink(path.join(settings.directoryPath, file.name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  async function writeBackup() {
    if (!settings.directoryPath) throw new Error('ERR_BACKUP_DESTINATION_REQUIRED');
    const sourceDirectories = await getSourceDirectories();
    const destinationPath = await validateDestination(settings.directoryPath, sourceDirectories);
    settings.directoryPath = destinationPath;

    const timestamp = now();
    const timestampPart = timestamp.toISOString().replace(/[:.]/g, '-');
    const filename = `${AUTO_BACKUP_PREFIX}${timestampPart}-${makeId()}.awbackup.zip`;
    const backupPath = path.join(destinationPath, filename);
    let result;
    try {
      result = await options.backup.exportBackup(backupPath, options.userDataPath);
      await options.backup.validateBackup(backupPath);
    } catch (error) {
      try {
        await fileSystem.promises.rm(backupPath, { force: true });
      } catch (cleanupError) {
        logger.error('[AutoBackup] Failed to remove an invalid backup:', cleanupError);
      }
      throw error;
    }
    await pruneOldBackups();

    settings.lastBackupAt = timestamp.toISOString();
    settings.lastBackupDirectory = destinationPath;
    settings.lastDataSignature = await getDataSignature();
    settings.lastError = null;
    await persistSettings();
    emitStatus();
    return { ...result, createdAt: settings.lastBackupAt };
  }

  function createBackup() {
    if (backupPromise) return backupPromise;
    backupPromise = writeBackup()
      .catch((error) => {
        setError(error);
        throw error;
      })
      .finally(() => {
        backupPromise = null;
        emitStatus();
        if (backupQueued) {
          backupQueued = false;
          scheduleBackup();
        }
      });
    emitStatus();
    return backupPromise;
  }

  function scheduleBackup() {
    if (!settings.enabled || stopped || suspended) return;
    if (backupPromise) {
      backupQueued = true;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      createBackup().catch((error) => logger.error('[AutoBackup] Automatic backup failed:', error));
    }, debounceMs);
  }

  async function flushPendingBackup() {
    if (backupPromise) await backupPromise.catch(() => {});
    if (!debounceTimer) return;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (settings.enabled && !stopped && !suspended) await createBackup();
  }

  async function start() {
    stopped = false;
    suspended = false;
    try {
      await closeWatchers();
      await readSettings();
      if (!settings.enabled || !settings.directoryPath) {
        emitStatus();
        return getStatusValue();
      }

      await startWatching();
      const signature = await getDataSignature();
      if (!settings.lastDataSignature || settings.lastDataSignature !== signature
        || settings.lastBackupDirectory !== settings.directoryPath) {
        await createBackup();
      } else {
        emitStatus();
      }
      return getStatusValue();
    } catch (error) {
      setError(error);
      return getStatusValue();
    }
  }

  async function configure(configuration) {
    if (!configuration || typeof configuration.enabled !== 'boolean') {
      throw new TypeError('enabled must be a boolean');
    }
    await flushPendingBackup();
    const wasEnabled = settings.enabled;
    const previousDirectory = settings.directoryPath;
    const nextDirectory = configuration.directoryPath === undefined
      ? settings.directoryPath
      : configuration.directoryPath;

    if (configuration.enabled) {
      const sourceDirectories = await getSourceDirectories();
      settings.directoryPath = await validateDestination(nextDirectory, sourceDirectories);
    } else if (nextDirectory !== '') {
      settings.directoryPath = path.resolve(nextDirectory);
    } else {
      settings.directoryPath = '';
    }

    const shouldCreateInitialBackup = configuration.enabled
      && (!wasEnabled || settings.directoryPath !== previousDirectory
        || !settings.lastBackupAt || !settings.lastDataSignature
        || settings.lastBackupDirectory !== settings.directoryPath);
    settings.enabled = configuration.enabled;
    settings.lastError = null;
    stopped = false;
    await persistSettings();

    if (settings.enabled) {
      try {
        await startWatching();
      } catch (error) {
        setError(error);
        throw error;
      }
    } else {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      await closeWatchers();
    }

    if (shouldCreateInitialBackup) await createBackup();
    emitStatus();
    return getStatusValue();
  }

  async function stop() {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    backupQueued = false;
    await closeWatchers();
  }

  async function suspend() {
    suspended = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    backupQueued = false;
    await closeWatchers();
    if (backupPromise) await backupPromise.catch(() => {});
  }

  async function resume() {
    if (stopped) return getStatusValue();
    suspended = false;
    if (!settings.enabled) return getStatusValue();
    try {
      await startWatching();
      const signature = await getDataSignature();
      if (signature !== settings.lastDataSignature
        || settings.lastBackupDirectory !== settings.directoryPath) {
        await createBackup();
      }
      return getStatusValue();
    } catch (error) {
      setError(error);
      throw error;
    }
  }

  function onStatus(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    start,
    stop,
    suspend,
    resume,
    configure,
    createBackup,
    getStatus: async () => getStatusValue(),
    onStatus
  };
}

module.exports = {
  createAutoBackupManager,
  DATA_DIRS,
  MAX_AUTO_BACKUPS,
  AUTO_BACKUP_PATTERN,
  DEFAULT_DEBOUNCE_MS
};
