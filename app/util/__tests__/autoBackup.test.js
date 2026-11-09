'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAutoBackupManager } = require('../autoBackup');

describe('automatic backups', () => {
  let tempDir;
  let userDataPath;
  let destinationPath;
  let watchers;
  let exportedPaths;
  let shouldFailExport;
  let shouldFailWatch;
  let nextTimestamp;
  let nextId;
  let manager;

  function createManager() {
    watchers = [];
    exportedPaths = [];
    shouldFailExport = false;
    shouldFailWatch = false;
    nextId = 0;
    const backup = {
      exportBackup: async (filePath) => {
        exportedPaths.push(filePath);
        if (shouldFailExport) throw new Error('disk full');
        await fs.promises.writeFile(filePath, 'valid backup');
      },
      validateBackup: async (filePath) => {
        if (!(await fs.promises.stat(filePath)).isFile()) {
          throw new Error('ERR_BACKUP_INVALID');
        }
        return { files: 1 };
      }
    };

    manager = createAutoBackupManager({
      userDataPath,
      backup,
      debounceMs: 10,
      now: () => new Date(nextTimestamp),
      makeId: () => String(++nextId).padStart(8, '0'),
      watch: (dirPath, options, listener) => {
        if (shouldFailWatch) throw new Error('watch unavailable');
        const watcher = { dirPath, options, listener, close: jest.fn() };
        watchers.push(watcher);
        return watcher;
      },
      logger: { error: jest.fn() }
    });
    return manager;
  }

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aw-auto-backup-'));
    userDataPath = path.join(tempDir, 'userData');
    destinationPath = path.join(tempDir, 'cloud');
    await fs.promises.mkdir(path.join(userDataPath, 'cfg'), { recursive: true });
    await fs.promises.mkdir(destinationPath);
    await fs.promises.writeFile(path.join(userDataPath, 'cfg', 'options.ini'), '[achievement]\nhideZero=true');
    nextTimestamp = Date.UTC(2026, 0, 1);
    createManager();
  });

  afterEach(async () => {
    if (manager) await manager.stop();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    jest.useRealTimers();
  });

  test('creates an initial backup when enabled and watches only app-managed data folders', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const resolvedDestination = await fs.promises.realpath(destinationPath);

    expect(exportedPaths).toHaveLength(1);
    await expect(manager.getStatus()).resolves.toMatchObject({
      enabled: true,
      directoryPath: resolvedDestination,
      lastBackupAt: expect.any(String),
      lastError: null
    });
    expect(watchers.map((watcher) => path.basename(watcher.dirPath)).sort()).toEqual([
      'cfg',
      'data',
      'uplay_cache',
      'user'
    ]);
    expect(watchers.every((watcher) => watcher.options.recursive)).toBe(true);
  });

  test('creates one debounced backup after app data changes', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const before = exportedPaths.length;
    const backupFinished = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('Timed out waiting for the automatic backup'));
      }, 5000);
      const unsubscribe = manager.onStatus((status) => {
        if (!status.isBackingUp && exportedPaths.length > before) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

    watchers[0].listener('change', 'options.ini');
    watchers[0].listener('change', 'options.ini');
    await backupFinished;

    expect(exportedPaths).toHaveLength(before + 1);
  });

  test('persists settings and does not create another backup after an unchanged restart', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const configPath = path.join(userDataPath, 'auto-backup.json');
    const savedConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
    expect(savedConfig).toMatchObject({
      enabled: true,
      directoryPath: await fs.promises.realpath(destinationPath)
    });

    await manager.stop();
    createManager();
    await manager.start();

    expect(exportedPaths).toHaveLength(0);
    await expect(manager.getStatus()).resolves.toMatchObject({ enabled: true, lastError: null });
  });

  test('creates a startup backup when app-managed data changed while the app was closed', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    await manager.stop();
    await fs.promises.appendFile(path.join(userDataPath, 'cfg', 'options.ini'), '\nnewSetting=true');
    nextTimestamp += 1000;
    createManager();

    await manager.start();

    expect(exportedPaths).toHaveLength(1);
    await expect(manager.getStatus()).resolves.toMatchObject({ lastError: null });
  });

  test('suspends watching while data is restored and backs it up after resuming', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const before = exportedPaths.length;
    await manager.suspend();
    await fs.promises.appendFile(path.join(userDataPath, 'cfg', 'options.ini'), '\nrestored=true');

    await manager.resume();

    expect(exportedPaths).toHaveLength(before + 1);
    expect(watchers.length).toBeGreaterThan(0);
  });

  test('stops watching when automatic backups are disabled', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const before = exportedPaths.length;
    const previousWatcher = watchers[0];
    await manager.configure({ directoryPath: destinationPath, enabled: false });

    previousWatcher.listener('change', 'options.ini');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(previousWatcher.close).toHaveBeenCalled();
    expect(exportedPaths).toHaveLength(before);
  });

  test('keeps only the 10 most recent automatic backups', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const manualBackupPath = path.join(destinationPath, 'Achievement-Watcher-Backup-manual.awbackup.zip');
    await fs.promises.writeFile(manualBackupPath, 'manual backup');

    for (let index = 0; index < 11; index += 1) {
      nextTimestamp += 1000;
      await manager.createBackup();
    }

    const files = await fs.promises.readdir(destinationPath);
    expect(files.filter((file) => file.startsWith('Achievement-Watcher-AutoBackup-'))).toHaveLength(10);
    expect(files).toContain(path.basename(manualBackupPath));
    expect(files).toContain(path.basename(exportedPaths[exportedPaths.length - 1]));
  });

  test('preserves existing backups when a new backup fails', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    for (let index = 0; index < 11; index += 1) {
      nextTimestamp += 1000;
      await manager.createBackup();
    }
    const previousFiles = await fs.promises.readdir(destinationPath);

    shouldFailExport = true;
    await expect(manager.createBackup()).rejects.toThrow('disk full');

    expect(await fs.promises.readdir(destinationPath)).toEqual(previousFiles);
    await expect(manager.getStatus()).resolves.toMatchObject({ lastError: 'disk full' });
  });

  test('rejects a destination inside a folder being watched', async () => {
    const destinationInsideCfg = path.join(userDataPath, 'cfg', 'cloud');
    await fs.promises.mkdir(destinationInsideCfg);

    await expect(manager.configure({ directoryPath: destinationInsideCfg, enabled: true }))
      .rejects.toThrow('ERR_BACKUP_DESTINATION_INVALID');
  });

  test('retries the initial backup after a watcher startup failure', async () => {
    shouldFailWatch = true;
    await expect(manager.configure({ directoryPath: destinationPath, enabled: true }))
      .rejects.toThrow('ERR_BACKUP_WATCH_FAILED');
    await expect(manager.getStatus()).resolves.toMatchObject({
      enabled: true,
      lastError: 'ERR_BACKUP_WATCH_FAILED'
    });

    shouldFailWatch = false;
    await manager.configure({ directoryPath: destinationPath, enabled: true });

    expect(exportedPaths).toHaveLength(1);
  });

  test('creates a backup after changing destinations even if the data is unchanged', async () => {
    await manager.configure({ directoryPath: destinationPath, enabled: true });
    const newDestination = path.join(tempDir, 'new-cloud');
    await fs.promises.mkdir(newDestination);
    shouldFailExport = true;
    await expect(manager.configure({ directoryPath: newDestination, enabled: true }))
      .rejects.toThrow('disk full');
    await manager.stop();
    nextTimestamp += 1000;
    createManager();

    await manager.start();

    expect(exportedPaths).toHaveLength(1);
    expect(path.dirname(exportedPaths[0])).toBe(await fs.promises.realpath(newDestination));
  });
});
