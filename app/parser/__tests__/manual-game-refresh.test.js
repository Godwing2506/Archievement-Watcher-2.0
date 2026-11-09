"use strict";

const path = require("path");

global.appPath = path.resolve(__dirname, "../..");

jest.mock("@electron/remote", () => ({
  app: { getPath: () => "C:\\mock-user-data" },
  getCurrentWindow: () => ({ isDev: false })
}));
jest.mock("../steam.js", () => ({
  getAchievementsFromFile: jest.fn()
}));
jest.mock("../uplay.js", () => ({}));
jest.mock("../rpcs3.js", () => ({}));
jest.mock("../greenluma.js", () => ({}));
jest.mock("../userDir.js", () => ({}));
jest.mock("../manualGames.js", () => ({}));
jest.mock("../blacklist.js", () => ({}));
jest.mock("../watchdog.js", () => ({}));
jest.mock("../emulators.js", () => ({}));
jest.mock("../emuFormats.js", () => ({ parseFile: jest.fn() }));
jest.mock("../../util/concurrency.js", () => ({ allSettledLimited: jest.fn() }));

const steam = require("../steam.js");
const achievements = require("../achievements.js");

describe("refreshing manually added games", () => {
  beforeEach(() => {
    steam.getAchievementsFromFile.mockReset().mockResolvedValue({
      ACH_ONE: { earned: true, earned_time: 1700000000, progress: 1, max_progress: 1 }
    });
  });

  it("reloads the manual game's achievement file after a master unlock", async () => {
    const game = {
      appid: "123456",
      data: { type: "manual", path: "C:\\saves\\123456" },
      achievement: {
        unlocked: 0,
        list: [{
          name: "ACH_ONE",
          Achieved: false,
          CurProgress: 0,
          MaxProgress: 1,
          UnlockTime: 0
        }]
      }
    };

    const result = await achievements.refreshAchievements(game, {
      achievement: { timeMergeRecentFirst: false }
    });

    expect(steam.getAchievementsFromFile).toHaveBeenCalledWith(game.data.path);
    expect(result).toBe(game);
    expect(game.achievement.list[0].Achieved).toBe(true);
    expect(game.achievement.list[0].UnlockTime).toBe(1700000000);
    expect(game.achievement.unlocked).toBe(1);
  });
});
