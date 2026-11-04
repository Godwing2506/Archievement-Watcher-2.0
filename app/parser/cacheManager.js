"use strict";

/**
 * Cache Manager - Utility for managing achievement cache files
 * Provides automatic cleanup and size management
 */

const path = require("path");
const ffs = require("@xan105/fs");
const glob = require("fast-glob");

// Cache configuration
const CACHE_MAX_AGE_DAYS = 30; // Maximum age for unused cache entries
const CACHE_MAX_SIZE_MB = 500; // Maximum total cache size in MB
const CACHE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get size of a directory in bytes
 */
async function getDirectorySize(dirPath) {
  try {
    const files = await glob("**/*", { cwd: dirPath, onlyFiles: true, absolute: true, suppressErrors: true });
    let totalSize = 0;

    for (const file of files) {
      try {
        const stats = await ffs.stats(file);
        if (stats && stats.size) {
          totalSize += stats.size;
        }
      } catch (e) { /* skip file */ }
    }

    return totalSize;
  } catch (e) {
    return 0;
  }
}

/**
 * Clean old cache files
 */
async function cleanOldCache(cacheRoot, maxAgeDays = CACHE_MAX_AGE_DAYS) {
  try {
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const files = await glob("**/*.{db,json}", { cwd: cacheRoot, onlyFiles: true, absolute: true, suppressErrors: true });

    let deletedCount = 0;
    let freedBytes = 0;

    for (const file of files) {
      try {
        const stats = await ffs.stats(file);
        if (stats && stats.mtime) {
          const age = now - new Date(stats.mtime).getTime();
          if (age > maxAgeMs) {
            const size = stats.size || 0;
            await ffs.remove(file);
            deletedCount++;
            freedBytes += size;
          }
        }
      } catch (e) { /* skip file */ }
    }

    return { deletedCount, freedBytes };
  } catch (e) {
    return { deletedCount: 0, freedBytes: 0 };
  }
}

/**
 * Clean cache if it exceeds size limit
 */
async function cleanCacheBySize(cacheRoot, maxSizeMB = CACHE_MAX_SIZE_MB) {
  try {
    const currentSizeBytes = await getDirectorySize(cacheRoot);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (currentSizeBytes <= maxSizeBytes) {
      return { deletedCount: 0, freedBytes: 0 };
    }

    // Get all cache files with their stats
    const files = await glob("**/*.{db,json}", { cwd: cacheRoot, onlyFiles: true, absolute: true, suppressErrors: true });
    const fileStats = [];

    for (const file of files) {
      try {
        const stats = await ffs.stats(file);
        if (stats) {
          fileStats.push({
            path: file,
            mtime: new Date(stats.mtime).getTime(),
            size: stats.size || 0
          });
        }
      } catch (e) { /* skip file */ }
    }

    // Sort by oldest first
    fileStats.sort((a, b) => a.mtime - b.mtime);

    let deletedCount = 0;
    let freedBytes = 0;
    let currentSize = currentSizeBytes;

    // Delete oldest files until we're under the limit
    for (const file of fileStats) {
      if (currentSize <= maxSizeBytes) break;

      try {
        await ffs.remove(file.path);
        deletedCount++;
        freedBytes += file.size;
        currentSize -= file.size;
      } catch (e) { /* skip file */ }
    }

    return { deletedCount, freedBytes };
  } catch (e) {
    return { deletedCount: 0, freedBytes: 0 };
  }
}

/**
 * Perform full cache cleanup (age and size based)
 */
async function performCleanup(cacheRoot, options = {}) {
  const maxAgeDays = options.maxAgeDays || CACHE_MAX_AGE_DAYS;
  const maxSizeMB = options.maxSizeMB || CACHE_MAX_SIZE_MB;

  try {
    if (!(await ffs.exists(cacheRoot))) {
      return { success: false, error: "Cache directory does not exist" };
    }

    // Clean old files first
    const ageCleanup = await cleanOldCache(cacheRoot, maxAgeDays);

    // Then check size and clean if needed
    const sizeCleanup = await cleanCacheBySize(cacheRoot, maxSizeMB);

    return {
      success: true,
      deletedCount: ageCleanup.deletedCount + sizeCleanup.deletedCount,
      freedBytes: ageCleanup.freedBytes + sizeCleanup.freedBytes,
      freedMB: ((ageCleanup.freedBytes + sizeCleanup.freedBytes) / (1024 * 1024)).toFixed(2)
    };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats(cacheRoot) {
  try {
    if (!(await ffs.exists(cacheRoot))) {
      return { exists: false };
    }

    const files = await glob("**/*.{db,json}", { cwd: cacheRoot, onlyFiles: true, absolute: true, suppressErrors: true });
    const totalSize = await getDirectorySize(cacheRoot);

    let oldestFile = null;
    let newestFile = null;

    for (const file of files) {
      try {
        const stats = await ffs.stats(file);
        if (stats && stats.mtime) {
          const mtime = new Date(stats.mtime).getTime();
          if (!oldestFile || mtime < oldestFile) oldestFile = mtime;
          if (!newestFile || mtime > newestFile) newestFile = mtime;
        }
      } catch (e) { /* skip */ }
    }

    return {
      exists: true,
      fileCount: files.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      oldestFile: oldestFile ? new Date(oldestFile).toISOString() : null,
      newestFile: newestFile ? new Date(newestFile).toISOString() : null
    };
  } catch (e) {
    return { exists: true, error: e.message || String(e) };
  }
}

module.exports = {
  performCleanup,
  getCacheStats,
  cleanOldCache,
  cleanCacheBySize,
  getDirectorySize,
  CACHE_MAX_AGE_DAYS,
  CACHE_MAX_SIZE_MB,
  CACHE_CLEANUP_INTERVAL_MS
};
