"use strict";

const request = require('request-zero');
const path = require("path");
const fs = require("fs");
const ffs = require("@xan105/fs");
const remote = require('@electron/remote');

const cacheDir = path.join(remote.app.getPath('userData'), "translation_cache");

// Crear directorio de caché si no existe
const ensureCacheDir = async () => {
  try {
    await ffs.mkdir(cacheDir, { recursive: true });
  } catch (err) {
    // El directorio ya existe o hubo un error, pero continuamos
  }
};

// Obtener archivo de caché para un idioma
const getCacheFile = (targetLang) => {
  return path.join(cacheDir, `${targetLang}.json`);
};

// Cargar caché de traducciones
const loadCache = async (targetLang) => {
  try {
    const cacheFile = getCacheFile(targetLang);
    const content = await ffs.readFile(cacheFile, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
};

// Guardar caché de traducciones
const saveCache = async (targetLang, cache) => {
  try {
    const cacheFile = getCacheFile(targetLang);
    await ffs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    // Silenciosamente fallar, el caché es opcional
  }
};

// Detectar si es probable que el texto esté en inglés
const isLikelyEnglish = (text) => {
  if (!text || typeof text !== "string") return false;
  
  // Palabras comunes en inglés que raramente aparecen en otros idiomas
  const englishWords = [
    "the", "and", "to", "a", "of", "in", "is", "you", "that", "it",
    "for", "was", "with", "as", "by", "on", "at", "from", "be", "or",
    "have", "this", "not", "but", "his", "them", "can", "will", "more",
    "achievement", "unlock", "complete", "defeat", "collect", "find", 
    "reach", "kill", "win", "get", "use", "play", "beat"
  ];
  
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const englishCount = words.filter(w => englishWords.includes(w)).length;
  
  // Si más del 20% de las palabras son típicamente inglesas, es probable que esté en inglés
  return englishCount / words.length > 0.2;
};

// Traducir texto usando MyMemory API con timeout
const translateText = async (text, sourceLang = "en", targetLang = "es", timeout = 3000) => {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return text;
  }

  try {
    // Asegurar que el directorio de caché existe
    await ensureCacheDir();

    // Cargar caché existente
    const cache = await loadCache(targetLang);

    // Verificar si ya está en caché
    const cacheKey = `${sourceLang}_${text}`;
    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    // Hacer solicitud a MyMemory API con timeout
    const encodedText = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;

    // Crear promesa de timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Translation timeout")), timeout)
    );

    // Competir entre la llamada y el timeout
    const response = await Promise.race([
      request.getJson(url),
      timeoutPromise
    ]);

    if (response && response.responseStatus === 200 && response.responseData) {
      const translatedText = response.responseData.translatedText;

      // Guardar en caché
      cache[cacheKey] = translatedText;
      await saveCache(targetLang, cache);

      return translatedText;
    }

    // Si falla la traducción, devolver el texto original
    return text;
  } catch (err) {
    // En caso de error, devolver el texto original silenciosamente
    return text;
  }
};

// Traducir objeto con propiedades de texto
const translateAchievement = async (achievement, sourceLang = "en", targetLang = "es", fieldsToTranslate = ["displayName", "description"]) => {
  if (!achievement || typeof achievement !== "object") {
    return achievement;
  }

  const translated = { ...achievement };

  for (const field of fieldsToTranslate) {
    if (translated[field] && typeof translated[field] === "string") {
      // Solo traducir si el texto parece estar en inglés (Steam API ya devuelve el idioma pedido)
      if (isLikelyEnglish(translated[field])) {
        translated[field] = await translateText(translated[field], sourceLang, targetLang);
      }
    }
  }

  return translated;
};

// Traducir lista de logros
const translateAchievements = async (achievements, sourceLang = "en", targetLang = "es", fieldsToTranslate = ["displayName", "description"]) => {
  if (!Array.isArray(achievements)) {
    return achievements;
  }

  const translated = [];

  for (const achievement of achievements) {
    const translatedAch = await translateAchievement(achievement, sourceLang, targetLang, fieldsToTranslate);
    translated.push(translatedAch);
  }

  return translated;
};

module.exports = {
  translateText,
  translateAchievement,
  translateAchievements,
  isLikelyEnglish
};
