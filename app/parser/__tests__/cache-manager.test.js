"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cacheManager = require("../cacheManager.js");

describe("cache manager", () => {
  let userData;

  beforeEach(async () => {
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "aw-cache-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("reports stats for only the regenerable schema cache", async () => {
    const schemaRoot = cacheManager.getSchemaCachePath(userData);
    await fs.promises.mkdir(schemaRoot, { recursive: true });
    await fs.promises.writeFile(path.join(schemaRoot, "game.db"), "{}");
    await fs.promises.mkdir(path.join(userData, "steam_cache", "data"), { recursive: true });
    await fs.promises.writeFile(path.join(userData, "steam_cache", "data", "tracking.db"), "{}");

    const stats = await cacheManager.getSchemaCacheStats(userData);

    expect(stats.fileCount).toBe(1);
    expect(stats.exists).toBe(true);
  });

  it("cleans expired schema files without touching tracking or metadata", async () => {
    const schemaRoot = cacheManager.getSchemaCachePath(userData);
    const trackingRoot = path.join(userData, "steam_cache", "data");
    const metadataRoot = path.join(userData, "cache");
    await fs.promises.mkdir(schemaRoot, { recursive: true });
    await fs.promises.mkdir(trackingRoot, { recursive: true });
    await fs.promises.mkdir(metadataRoot, { recursive: true });

    const expiredSchema = path.join(schemaRoot, "expired.db");
    const trackingDb = path.join(trackingRoot, "tracking.db");
    const gameMetadata = path.join(metadataRoot, "gameMeta.json");
    await Promise.all([
      fs.promises.writeFile(expiredSchema, "{}"),
      fs.promises.writeFile(trackingDb, "{}"),
      fs.promises.writeFile(gameMetadata, "{}")
    ]);
    const oldTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await fs.promises.utimes(expiredSchema, oldTime, oldTime);
    await fs.promises.utimes(trackingDb, oldTime, oldTime);
    await fs.promises.utimes(gameMetadata, oldTime, oldTime);

    const result = await cacheManager.performSchemaCleanup(userData);

    expect(result.success).toBe(true);
    await expect(fs.promises.access(expiredSchema)).rejects.toThrow();
    await expect(fs.promises.access(trackingDb)).resolves.toBeUndefined();
    await expect(fs.promises.access(gameMetadata)).resolves.toBeUndefined();
  });

  it("rejects cleanup roots outside the schema cache", async () => {
    const result = await cacheManager.performCleanup(userData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/schema cache/i);
  });

  it("honors an explicit zero-day age limit", async () => {
    const schemaRoot = cacheManager.getSchemaCachePath(userData);
    await fs.promises.mkdir(schemaRoot, { recursive: true });
    const freshSchema = path.join(schemaRoot, "fresh.db");
    await fs.promises.writeFile(freshSchema, "{}");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await fs.promises.utimes(freshSchema, yesterday, yesterday);

    const result = await cacheManager.performSchemaCleanup(userData, {
      maxAgeDays: 0,
      maxSizeMB: cacheManager.CACHE_MAX_SIZE_MB
    });

    expect(result.success).toBe(true);
    await expect(fs.promises.access(freshSchema)).rejects.toThrow();
  });
});
