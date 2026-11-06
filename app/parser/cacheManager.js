"use strict";

const fs = require("fs");
const path = require("path");
const glob = require("fast-glob");

const CACHE_MAX_AGE_DAYS = 30;
const CACHE_MAX_SIZE_MB = 500;
const CACHE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MANAGED_CACHE_PATTERN = "**/*.{db,json}";

function getSchemaCachePath(userDataPath) {
  return path.join(userDataPath, "steam_cache", "schema");
}

function assertSchemaCachePath(cacheRoot) {
  const resolvedPath = path.resolve(cacheRoot);
  const parentName = path.basename(path.dirname(resolvedPath)).toLowerCase();
  const rootName = path.basename(resolvedPath).toLowerCase();

  if (rootName !== "schema" || parentName !== "steam_cache") {
    throw new Error("Schema cache cleanup is restricted to the steam_cache/schema directory");
  }

  return resolvedPath;
}

function validateOptions(maxAgeDays, maxSizeMB) {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new RangeError("maxAgeDays must be a non-negative number");
  }
  if (!Number.isFinite(maxSizeMB) || maxSizeMB < 0) {
    throw new RangeError("maxSizeMB must be a non-negative number");
  }
}

async function listManagedFiles(cacheRoot) {
  return glob(MANAGED_CACHE_PATTERN, {
    cwd: cacheRoot,
    onlyFiles: true,
    absolute: true
  });
}

async function getDirectorySize(dirPath) {
  const resolvedPath = assertSchemaCachePath(dirPath);
  let directoryStats;
  try {
    directoryStats = await fs.promises.stat(resolvedPath);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  if (!directoryStats.isDirectory()) {
    throw new Error("Schema cache path is not a directory");
  }

  const files = await listManagedFiles(resolvedPath);
  const sizes = await Promise.all(files.map(async (file) => (await fs.promises.stat(file)).size));
  return sizes.reduce((total, size) => total + size, 0);
}

async function cleanOldCache(cacheRoot, maxAgeDays = CACHE_MAX_AGE_DAYS) {
  const resolvedPath = assertSchemaCachePath(cacheRoot);
  validateOptions(maxAgeDays, CACHE_MAX_SIZE_MB);
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const files = await listManagedFiles(resolvedPath);
  const result = { deletedCount: 0, freedBytes: 0, errors: [] };

  for (const file of files) {
    try {
      const stats = await fs.promises.stat(file);
      if (now - stats.mtimeMs <= maxAgeMs) continue;
      await fs.promises.unlink(file);
      result.deletedCount++;
      result.freedBytes += stats.size;
    } catch (error) {
      result.errors.push({ path: file, message: error.message });
    }
  }

  return result;
}

async function cleanCacheBySize(cacheRoot, maxSizeMB = CACHE_MAX_SIZE_MB) {
  const resolvedPath = assertSchemaCachePath(cacheRoot);
  validateOptions(CACHE_MAX_AGE_DAYS, maxSizeMB);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const files = await listManagedFiles(resolvedPath);
  const fileStats = [];
  const errors = [];
  for (const file of files) {
    try {
      const stats = await fs.promises.stat(file);
      fileStats.push({ path: file, mtimeMs: stats.mtimeMs, size: stats.size });
    } catch (error) {
      errors.push({ path: file, message: error.message });
    }
  }
  fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

  let currentSize = fileStats.reduce((total, file) => total + file.size, 0);
  const result = { deletedCount: 0, freedBytes: 0, errors, remainingBytes: currentSize };

  for (const file of fileStats) {
    if (currentSize <= maxSizeBytes) break;
    try {
      await fs.promises.unlink(file.path);
      result.deletedCount++;
      result.freedBytes += file.size;
      currentSize -= file.size;
    } catch (error) {
      result.errors.push({ path: file.path, message: error.message });
    }
  }
  result.remainingBytes = currentSize;
  return result;
}

async function performCleanup(cacheRoot, options = {}) {
  let resolvedPath;
  try {
    resolvedPath = assertSchemaCachePath(cacheRoot);
    const maxAgeDays = options.maxAgeDays ?? CACHE_MAX_AGE_DAYS;
    const maxSizeMB = options.maxSizeMB ?? CACHE_MAX_SIZE_MB;
    validateOptions(maxAgeDays, maxSizeMB);

    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error("Schema cache path is not a directory");
    }

    const ageCleanup = await cleanOldCache(resolvedPath, maxAgeDays);
    const sizeCleanup = await cleanCacheBySize(resolvedPath, maxSizeMB);
    const errors = [...ageCleanup.errors, ...sizeCleanup.errors];
    const freedBytes = ageCleanup.freedBytes + sizeCleanup.freedBytes;

    return {
      success: errors.length === 0,
      deletedCount: ageCleanup.deletedCount + sizeCleanup.deletedCount,
      freedBytes,
      freedMB: (freedBytes / (1024 * 1024)).toFixed(2),
      remainingBytes: sizeCleanup.remainingBytes,
      errors
    };
  } catch (error) {
    return { success: false, error: error.message || String(error), errors: [] };
  }
}

async function getCacheStats(cacheRoot) {
  let resolvedPath;
  try {
    resolvedPath = assertSchemaCachePath(cacheRoot);
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error("Schema cache path is not a directory");
    }

    const files = await listManagedFiles(resolvedPath);
    const fileStats = await Promise.all(files.map(async (file) => {
      const fileStat = await fs.promises.stat(file);
      return { path: file, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
    }));
    const oldestTimestamp = fileStats.reduce((oldest, file) => Math.min(oldest, file.mtimeMs), Infinity);
    const newestTimestamp = fileStats.reduce((newest, file) => Math.max(newest, file.mtimeMs), -Infinity);
    const totalSizeBytes = fileStats.reduce((total, file) => total + file.size, 0);

    return {
      exists: true,
      fileCount: fileStats.length,
      totalSizeBytes,
      totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
      oldestFile: fileStats.length ? new Date(oldestTimestamp).toISOString() : null,
      newestFile: fileStats.length ? new Date(newestTimestamp).toISOString() : null
    };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    return { exists: false, error: error.message || String(error) };
  }
}

async function getSchemaCacheStats(userDataPath) {
  return getCacheStats(getSchemaCachePath(userDataPath));
}

async function performSchemaCleanup(userDataPath, options) {
  return performCleanup(getSchemaCachePath(userDataPath), options);
}

module.exports = {
  performCleanup,
  performSchemaCleanup,
  getCacheStats,
  getSchemaCacheStats,
  getSchemaCachePath,
  cleanOldCache,
  cleanCacheBySize,
  getDirectorySize,
  CACHE_MAX_AGE_DAYS,
  CACHE_MAX_SIZE_MB,
  CACHE_CLEANUP_INTERVAL_MS
};
