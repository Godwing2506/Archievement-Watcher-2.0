'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
jest.mock('@electron/remote', () => ({
  app: { getPath: () => global.__backupTestUserData }
}));
jest.mock('../reg_shim', () => ({
  RegKeyExists: () => false,
  RegListAllSubkeys: () => [],
  RegQueryIntegerValue: () => 0,
  promises: { RegWriteDwordValue: async () => true }
}));
const backup = require('../backup');

describe('backup validation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-backup-test-'));
    global.__backupTestUserData = path.join(tempDir, 'userData');
    fs.mkdirSync(global.__backupTestUserData);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete global.__backupTestUserData;
  });

  function writeBackup(entries = {}, formatVersion = 1) {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      formatVersion,
      app: 'Achievement-Watcher',
      createdAt: new Date().toISOString()
    })));
    for (const [name, content] of Object.entries(entries)) {
      zip.addFile(name, Buffer.from(content));
    }
    const filePath = path.join(tempDir, 'test.awbackup.zip');
    zip.writeZip(filePath);
    return filePath;
  }

  test('accepts a valid backup and reports its contents', async () => {
    const filePath = writeBackup({
      'cfg/options.ini': '[achievement]\nhideZero=true',
      'cfg/playtime_export.json': '{"123":{"total":120,"last":1700000000}}'
    });

    await expect(backup.validateBackup(filePath)).resolves.toMatchObject({
      files: 2,
      createdAt: expect.any(String)
    });
  });

  test('rejects files that are not ZIP archives', async () => {
    const filePath = path.join(tempDir, 'invalid.zip');
    fs.writeFileSync(filePath, 'not a zip file');
    await expect(backup.validateBackup(filePath)).rejects.toThrow('ERR_BACKUP_INVALID');
  });

  test('rejects backups with unsupported format versions', async () => {
    const filePath = writeBackup({}, 2);
    await expect(backup.validateBackup(filePath)).rejects.toThrow('ERR_BACKUP_VERSION');
  });

  test('rejects entries that escape the backup data folders', async () => {
    const filePath = writeBackup({ '../outside.txt': 'unsafe' });
    await expect(backup.validateBackup(filePath)).rejects.toThrow('ERR_BACKUP_INVALID');
  });

  test('validates the entire archive before restoring any files', async () => {
    const filePath = writeBackup({
      'cfg/options.ini': '[achievement]\nhideZero=false',
      '../outside.txt': 'unsafe'
    });
    await expect(backup.importBackup(filePath)).rejects.toThrow('ERR_BACKUP_INVALID');
    expect(fs.existsSync(path.join(global.__backupTestUserData, 'cfg', 'options.ini'))).toBe(false);
  });

  test('rejects malformed playtime data', async () => {
    const filePath = writeBackup({ 'cfg/playtime_export.json': '{"not-an-appid":{}}' });
    await expect(backup.validateBackup(filePath)).rejects.toThrow('ERR_BACKUP_INVALID');
  });

  test('exports a complete validated archive and replaces an existing destination', async () => {
    const cfgDir = path.join(global.__backupTestUserData, 'cfg');
    fs.mkdirSync(cfgDir);
    fs.writeFileSync(path.join(cfgDir, 'options.ini'), '[achievement]\nhideZero=true');
    const filePath = path.join(tempDir, 'export.awbackup.zip');

    await expect(backup.exportBackup(filePath)).resolves.toMatchObject({
      path: filePath,
      stats: { files: 2, bytes: expect.any(Number) }
    });
    await expect(backup.validateBackup(filePath)).resolves.toMatchObject({ files: 2 });
    await backup.exportBackup(filePath);
    await expect(backup.validateBackup(filePath)).resolves.toMatchObject({ files: 2 });
  });

  test('restores validated files into user data', async () => {
    const filePath = writeBackup({
      'cfg/options.ini': '[achievement]\nhideZero=false',
      'cfg/playtime_export.json': '{}'
    });
    await expect(backup.importBackup(filePath)).resolves.toMatchObject({
      filesRestored: 1,
      playtimeGames: 0
    });
    expect(fs.readFileSync(path.join(global.__backupTestUserData, 'cfg', 'options.ini'), 'utf8'))
      .toContain('hideZero=false');
  });
});
