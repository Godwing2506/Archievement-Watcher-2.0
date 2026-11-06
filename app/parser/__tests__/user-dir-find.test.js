"use strict";

const path = require("path");

global.appPath = path.resolve(__dirname, "../..");

jest.mock("@electron/remote", () => ({
  app: { getPath: () => "C:\\mock-user-data" }
}));
jest.mock("@xan105/ini", () => ({ parse: jest.fn() }));
jest.mock("find-up", () => jest.fn());
jest.mock("fast-glob", () => jest.fn());
jest.mock("@xan105/fs", () => ({ exists: jest.fn() }));
jest.mock("../../util/listDrive.js", () => jest.fn());
jest.mock("../../util/reg_shim", () => ({}));

const glob = require("fast-glob");
const ffs = require("@xan105/fs");
const listDrive = require("../../util/listDrive.js");
const userDir = require("../userDir.js");

const ENV_KEYS = ["APPDATA", "LOCALAPPDATA", "Public", "USERPROFILE", "ProgramData", "SystemDrive"];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

describe("userDir.find", () => {
  beforeEach(() => {
    process.env.APPDATA = "C:\\Users\\Tester\\AppData\\Roaming";
    process.env.LOCALAPPDATA = "C:\\Users\\Tester\\AppData\\Local";
    process.env.Public = "C:\\Users\\Public";
    process.env.USERPROFILE = "C:\\Users\\Tester";
    process.env.ProgramData = "C:\\ProgramData";
    process.env.SystemDrive = "C:";

    glob.mockReset();
    ffs.exists.mockReset().mockResolvedValue(true);
    listDrive.mockReset().mockResolvedValue([]);
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("scans duplicate roots once and limits concurrent root searches", async () => {
    process.env.ProgramData = process.env.APPDATA;
    listDrive.mockResolvedValue(["D:"]);
    let active = 0;
    let maxActive = 0;

    glob.mockImplementation(async (patterns, options) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return Array.isArray(patterns)
        ? [path.join(options.cwd, "nested", "user_steam_id.txt")]
        : [];
    });

    const results = await userDir.find();
    const fileSearchCalls = glob.mock.calls.filter(([patterns]) => Array.isArray(patterns));
    const appDataSearches = fileSearchCalls.filter(([, options]) => options.cwd === process.env.APPDATA);
    const driveRootSearch = fileSearchCalls.find(([, options]) => options.cwd === "D:");

    expect(results).toContain(path.join(process.env.APPDATA, "nested"));
    expect(appDataSearches).toHaveLength(1);
    expect(appDataSearches[0][1].deep).toBeUndefined();
    expect(driveRootSearch[1].deep).toBe(8);
    expect(maxActive).toBe(2);
  });

  it("retains matches from accessible roots when another root fails", async () => {
    ffs.exists.mockImplementation(async (root) => {
      if (root === process.env.LOCALAPPDATA) throw new Error("unavailable");
      return true;
    });
    glob.mockImplementation(async (patterns, options) => (
      Array.isArray(patterns)
        ? [path.join(options.cwd, "match", "user_steam_id.txt")]
        : []
    ));

    const results = await userDir.find();

    expect(results).toContain(path.join(process.env.APPDATA, "match"));
    expect(results).not.toContain(path.join(process.env.LOCALAPPDATA, "match"));
  });
});
