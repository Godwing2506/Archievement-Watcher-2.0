"use strict";

const path = require("path");

module.exports = function resolveAppPath(remote) {
  if (typeof globalThis.appPath === "string" && globalThis.appPath) {
    return globalThis.appPath;
  }
  if (typeof window !== "undefined" && typeof window.appPath === "string" && window.appPath) {
    return window.appPath;
  }

  let base = "";
  try {
    base = remote && remote.app && typeof remote.app.getAppPath === "function"
      ? remote.app.getAppPath()
      : "";
  } catch (_) {
    base = "";
  }

  if (base && path.basename(base) === "electron") {
    base = path.dirname(base);
  }
  if (!base) {
    base = path.join(process.resourcesPath || "", "app.asar");
  }

  globalThis.appPath = base;
  if (typeof window !== "undefined") {
    window.appPath = base;
  }
  return base;
};
