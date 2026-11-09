"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const manualGames = require("../manualGames");

describe("manually added Steam games", () => {
  let tempDir;
  let filePath;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "aw-manual-games-"));
    filePath = path.join(tempDir, "cfg", "manual-appids.json");
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  test("persists AppIDs and avoids duplicates", async () => {
    await expect(manualGames.add(filePath, "1593500")).resolves.toBe(true);
    await expect(manualGames.add(filePath, 1593500)).resolves.toBe(false);
    await expect(manualGames.load(filePath)).resolves.toEqual(["1593500"]);
  });

  test.each(["", "0", "-1", "1.5", "steam", "12345678901"])(
    "rejects invalid AppID %p",
    async (appId) => {
      await expect(manualGames.add(filePath, appId)).rejects.toThrow("ERR_MANUAL_APPID_INVALID");
    }
  );

  test("creates discovered entries only when the game was not already found", () => {
    expect(manualGames.toDiscoveredEntries(
      ["1593500", "123456"],
      [{ appid: "1593500", data: { type: "steamAPI" } }]
    )).toEqual([{
      appid: "123456",
      source: "Manual",
      data: { type: "manual" }
    }]);
  });

  test("reports a malformed manual AppID file", async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, '{"not":"an app list"}');
    await expect(manualGames.load(filePath)).rejects.toThrow("ERR_MANUAL_APPIDS_INVALID");
  });
});
