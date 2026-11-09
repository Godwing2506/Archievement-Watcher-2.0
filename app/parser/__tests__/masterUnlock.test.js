"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const masterUnlock = require("../masterUnlock.js");

describe("master unlock for manually added games", () => {
  let tempDir;
  let originalAppData;
  let originalPublic;

  beforeEach(async () => {
    originalAppData = process.env.APPDATA;
    originalPublic = process.env.PUBLIC;
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "aw-master-unlock-"));
    process.env.APPDATA = tempDir;
    process.env.PUBLIC = tempDir;
  });

  afterEach(async () => {
    if (originalAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppData;
    if (originalPublic === undefined) delete process.env.PUBLIC;
    else process.env.PUBLIC = originalPublic;
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("finds and unlocks the local emulator save using the manual game's AppID", async () => {
    const appId = "123456";
    const savePath = path.join(tempDir, "Goldberg SteamEmu Saves", appId);
    const saveFile = path.join(savePath, "achievements.json");
    await fs.promises.mkdir(savePath, { recursive: true });
    await fs.promises.writeFile(saveFile, JSON.stringify({
      ACH_ONE: { earned: false, earned_time: 0, progress: 0, max_progress: 1 }
    }));

    const result = await masterUnlock.unlock({
      appid: appId,
      data: { type: "manual" },
      achievement: {
        list: [{ name: "ACH_ONE", MaxProgress: 1 }]
      }
    }, ["ACH_ONE"], "latam");

    expect(result.store).toBe("goldberg-json");
    expect(JSON.parse(await fs.promises.readFile(saveFile, "utf8")).ACH_ONE.earned).toBe(true);
  });
});
