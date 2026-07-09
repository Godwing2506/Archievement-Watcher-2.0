"use strict";

const remote = require('@electron/remote');
const path = require("path");
const ini = require("@xan105/ini");
const fs = require("fs");
const ffs = require("@xan105/fs");
const resolveAppPath = require(path.join(__dirname, "util/resolveAppPath.js"));
const appPath = resolveAppPath(remote);
const aes = require(path.join(appPath,"util/aes.js"));
const steamLanguages = require(path.join(appPath,"locale/steam.json"));

function getOptionsPath() {
  return path.join(remote.app.getPath('userData'), "cfg", "options.ini");
}

function getLegacyOptionsPath() {
  return path.join(remote.app.getPath('appData'), "Achievement-Watcher", "cfg", "options.ini");
}

function ensureCfgDir() {
  const cfgDir = path.dirname(getOptionsPath());
  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
}

function readIniFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return ini.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

function decryptSteamKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") return "";
  const trimmed = rawKey.trim();
  if (!trimmed) return "";
  if (trimmed.includes(":")) {
    try {
      return aes.decrypt(trimmed);
    } catch (err) {
      console.error("Error decrypting Steam Key, keeping raw value");
      return trimmed;
    }
  }
  return trimmed;
}

function loadSteamKeyFromPaths(paths) {
  for (const filePath of paths) {
    const data = readIniFile(filePath);
    if (!data || !data.steam) continue;
    const key = decryptSteamKey(data.steam.apiKey || data.steam.apikey);
    if (key) return key;
  }
  return "";
}

function readStoredSteamKeyEncrypted() {
  for (const filePath of [getOptionsPath(), getLegacyOptionsPath()]) {
    const data = readIniFile(filePath);
    if (!data || !data.steam) continue;
    const raw = data.steam.apiKey || data.steam.apikey;
    if (raw && String(raw).trim()) return String(raw).trim();
  }
  return "";
}

function ensureSections(options) {
  options.achievement = options.achievement || {};
  options.achievement_source = options.achievement_source || {};
  options.notification = options.notification || {};
  options.notification_toast = options.notification_toast || {};
  options.notification_transport = options.notification_transport || {};
  options.notification_advanced = options.notification_advanced || {};
  options.souvenir_screenshot = options.souvenir_screenshot || {};
  options.souvenir_video = options.souvenir_video || {};
  options.action = options.action || {};
  options.steam = options.steam || {};
  options.master = options.master || {};
  return options;
}

function getDefaultOptions() {
  const options = {
    achievement: {
      lang: "latam",
      thumbnailPortrait: false,
      showHidden: false,
      mergeDuplicate: true,
      timeMergeRecentFirst: false,
      hideZero: false,
      autoTranslate: false
    },
    achievement_source: {
      legitSteam: 0,
      steamEmu: true,
      greenLuma: true,
      rpcs3: true,
      lumaPlay: false,
      importCache: true
    },
    notification: {
      notify: true,
      rumble: true,
      notifyOnProgress: true,
      playtime: false,
      notifySteamLegit: true
    },
    notification_toast: {
      customToastAudio: 1,
      toastSouvenir: 0,
      groupToast: false
    },
    notification_transport: {
      toast: true,
      winRT: true,
      balloon: true,
      websocket: true,
      gntp: true
    },
    notification_advanced: {
      timeTreshold: 10,
      tick: 600,
      checkIfProcessIsRunning: true,
      iconPrefetch: true,
      steamPollInterval: 60
    },
    souvenir_screenshot: {
      screenshot: true,
      custom_dir: "",
      overwrite_image: false
    },
    souvenir_video: {
      video: 0,
      codec: 0,
      colorDepth10bits: false,
      custom_dir: "",
      overwrite_video: false,
      duration: 20,
      framerate: 60,
      cursor: false
    },
    action: {
      target: "",
      cwd: "",
      hide: true
    },
    steam: {
      apiKey: ""
    },
    master: {
      enabled: false
    }
  };

  try {
    let locale = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    if (locale.startsWith("es")) {
      options.achievement.lang = locale.startsWith("es-419") || locale === "es-mx" ? "latam" : "spanish";
    } else {
      const found = steamLanguages.find(lang => lang.webapi === locale || (locale.length >= 2 && lang.webapi.startsWith(locale.substring(0, 2))));
      options.achievement.lang = found ? found.api : "english";
    }
  } catch (err) {
    options.achievement.lang = "latam";
  }

  return options;
}

function normalizeOptions(options) {
  ensureSections(options);

  if (!steamLanguages.some(lang => lang.api == options.achievement.lang)) {
    try {
      let locale = navigator.language || navigator.userLanguage || "en";
      const found = steamLanguages.find(lang => lang.webapi == locale);
      options.achievement.lang = found ? found.api : "english";
    } catch (err) {
      options.achievement.lang = "english";
    }
  }

  if (typeof options.achievement.thumbnailPortrait !== "boolean") options.achievement.thumbnailPortrait = false;
  if (typeof options.achievement.showHidden !== "boolean") options.achievement.showHidden = false;
  if (typeof options.achievement.mergeDuplicate !== "boolean") options.achievement.mergeDuplicate = true;
  if (typeof options.achievement.timeMergeRecentFirst !== "boolean") options.achievement.timeMergeRecentFirst = false;
  if (typeof options.achievement.hideZero !== "boolean") options.achievement.hideZero = false;
  if (typeof options.achievement.autoTranslate !== "boolean") options.achievement.autoTranslate = false;

  if (options.achievement_source.legitSteam != 0 && options.achievement_source.legitSteam != 1 && options.achievement_source.legitSteam != 2) {
    options.achievement_source.legitSteam = 0;
  }
  if (typeof options.achievement_source.steamEmu !== "boolean") options.achievement_source.steamEmu = true;
  if (typeof options.achievement_source.greenLuma !== "boolean") options.achievement_source.greenLuma = true;
  if (typeof options.achievement_source.rpcs3 !== "boolean") options.achievement_source.rpcs3 = true;
  if (typeof options.achievement_source.lumaPlay !== "boolean") options.achievement_source.lumaPlay = true;
  if (typeof options.achievement_source.importCache !== "boolean") options.achievement_source.importCache = true;

  if (typeof options.notification.notify !== "boolean") options.notification.notify = true;
  if (typeof options.notification.rumble !== "boolean") options.notification.rumble = true;
  if (typeof options.notification.notifyOnProgress !== "boolean") options.notification.notifyOnProgress = true;
  if (typeof options.notification.playtime !== "boolean") options.notification.playtime = false;
  if (typeof options.notification.notifySteamLegit !== "boolean") options.notification.notifySteamLegit = true;

  if (options.notification_toast.customToastAudio != 0 && options.notification_toast.customToastAudio != 1 && options.notification_toast.customToastAudio != 2) {
    options.notification_toast.customToastAudio = 1;
  }
  if (options.notification_toast.toastSouvenir != 0 && options.notification_toast.toastSouvenir != 1 && options.notification_toast.toastSouvenir != 2) {
    options.notification_toast.toastSouvenir = 0;
  }
  if (typeof options.notification_toast.groupToast !== "boolean") options.notification_toast.groupToast = false;

  if (typeof options.notification_transport.toast !== "boolean") options.notification_transport.toast = true;
  if (typeof options.notification_transport.winRT !== "boolean") options.notification_transport.winRT = true;
  if (typeof options.notification_transport.balloon !== "boolean") options.notification_transport.balloon = true;
  if (typeof options.notification_transport.websocket !== "boolean") options.notification_transport.websocket = true;
  if (typeof options.notification_transport.gntp !== "boolean") options.notification_transport.gntp = true;

  if (isNaN(options.notification_advanced.timeTreshold)) options.notification_advanced.timeTreshold = 10;
  if (isNaN(options.notification_advanced.tick)) options.notification_advanced.tick = 600;
  if (typeof options.notification_advanced.checkIfProcessIsRunning !== "boolean") options.notification_advanced.checkIfProcessIsRunning = true;
  if (typeof options.notification_advanced.iconPrefetch !== "boolean") options.notification_advanced.iconPrefetch = true;
  if (isNaN(options.notification_advanced.steamPollInterval)) options.notification_advanced.steamPollInterval = 60;

  if (typeof options.souvenir_screenshot.screenshot !== "boolean") options.souvenir_screenshot.screenshot = true;
  if (typeof options.souvenir_screenshot.custom_dir !== "string") options.souvenir_screenshot.custom_dir = "";
  if (typeof options.souvenir_screenshot.overwrite_image !== "boolean") options.souvenir_screenshot.overwrite_image = false;

  if (options.souvenir_video.video != 0 && options.souvenir_video.video != 1 && options.souvenir_video.video != 2) options.souvenir_video.video = 0;
  if (options.souvenir_video.codec != 0 && options.souvenir_video.codec != 1) options.souvenir_video.codec = 0;
  if (typeof options.souvenir_video.colorDepth10bits !== "boolean") options.souvenir_video.colorDepth10bits = false;
  if (typeof options.souvenir_video.custom_dir !== "string") options.souvenir_video.custom_dir = "";
  if (typeof options.souvenir_video.overwrite_video !== "boolean") options.souvenir_video.overwrite_video = false;
  if (options.souvenir_video.duration != 10 && options.souvenir_video.duration != 15 &&
      options.souvenir_video.duration != 20 && options.souvenir_video.duration != 30 &&
      options.souvenir_video.duration != 45) {
    options.souvenir_video.duration = 20;
  }
  if (options.souvenir_video.framerate != 30 && options.souvenir_video.framerate != 60) options.souvenir_video.framerate = 60;
  if (typeof options.souvenir_video.cursor !== "boolean") options.souvenir_video.cursor = false;

  if (typeof options.action.target !== "string") options.action.target = "";
  if (typeof options.action.cwd !== "string") options.action.cwd = "";
  if (typeof options.action.hide !== "boolean") options.action.hide = true;

  options.steam.apiKey = decryptSteamKey(options.steam.apiKey || options.steam.apikey);
  if (typeof options.master.enabled !== "boolean") options.master.enabled = false;
  return options;
}

module.exports.load = () => {
  ensureCfgDir();
  const filePath = getOptionsPath();
  const fileExists = fs.existsSync(filePath);
  const preservedKey = loadSteamKeyFromPaths([filePath, getLegacyOptionsPath()]);

  try {
    if (!fileExists) {
      const options = getDefaultOptions();
      if (preservedKey) options.steam.apiKey = preservedKey;
      ffs.writeFile(filePath, ini.stringify(options), "utf8").catch(() => {});
      return options;
    }

    const parsed = ini.parse(fs.readFileSync(filePath, "utf8"));
    const options = normalizeOptions(parsed);
    if (!options.steam.apiKey && preservedKey) options.steam.apiKey = preservedKey;
    return options;
  } catch (err) {
    console.error("Error loading options.ini:", err);
    const options = getDefaultOptions();
    if (preservedKey) options.steam.apiKey = preservedKey;
    return options;
  }
};

module.exports.saveSteamKey = (apiKey) => {
  ensureCfgDir();
  const filePath = getOptionsPath();
  let existing = readIniFile(filePath);
  if (!existing) {
    if (fs.existsSync(filePath)) {
      throw new Error("No se pudo leer options.ini existente");
    }
    existing = getDefaultOptions();
  }
  ensureSections(existing);

  if (apiKey && String(apiKey).trim()) {
    existing.steam.apiKey = aes.encrypt(String(apiKey).trim());
  } else {
    delete existing.steam.apiKey;
    delete existing.steam.apikey;
  }

  fs.writeFileSync(filePath, ini.stringify(existing), "utf8");
};

module.exports.saveMasterMode = (enabled) => {
  ensureCfgDir();
  const filePath = getOptionsPath();
  let existing = readIniFile(filePath);
  if (!existing) {
    if (fs.existsSync(filePath)) {
      throw new Error("No se pudo leer options.ini existente");
    }
    existing = getDefaultOptions();
  }
  ensureSections(existing);
  existing.master.enabled = !!enabled;
  fs.writeFileSync(filePath, ini.stringify(existing), "utf8");
};

module.exports.save = (config) => {
  return new Promise((resolve, reject) => {
    let options;
    try {
      options = JSON.parse(JSON.stringify(config));
      ensureSections(options);

      const storedEncrypted = readStoredSteamKeyEncrypted();
      if (config.steam && config.steam.apiKey && String(config.steam.apiKey).trim()) {
        options.steam.apiKey = aes.encrypt(String(config.steam.apiKey).trim());
      } else if (storedEncrypted) {
        options.steam.apiKey = storedEncrypted;
      } else {
        delete options.steam.apiKey;
        delete options.steam.apikey;
      }
    } catch (err) {
      return reject(err);
    }

    ensureCfgDir();
    return resolve(ffs.writeFile(getOptionsPath(), ini.stringify(options), "utf8"));
  });
};
