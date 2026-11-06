"use strict";

async function allSettledLimited(items, limit, worker, onDone = () => {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency limit must be a positive integer");
  }

  const results = new Array(items.length);
  let next = 0;
  const runnerCount = Math.min(limit, items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index], index)
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      } finally {
        onDone();
      }
    }
  });

  await Promise.all(runners);
  return results;
}

module.exports = { allSettledLimited };
