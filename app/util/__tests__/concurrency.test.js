"use strict";

const { allSettledLimited } = require("../concurrency.js");

describe("allSettledLimited", () => {
  it("limits active workers and preserves result order", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await allSettledLimited([3, 1, 2, 0], 2, async (value) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    });

    expect(maxActive).toBe(2);
    expect(results.map((result) => result.value)).toEqual([6, 2, 4, 0]);
  });

  it("records rejected workers without stopping later work", async () => {
    const results = await allSettledLimited([1, 2, 3], 1, async (value) => {
      if (value === 2) throw new Error("failed");
      return value;
    });

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled"
    ]);
  });
});
