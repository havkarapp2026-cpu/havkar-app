/**
 * Selectable HAVKAR languages.
 * Names and directions must stay aligned with havkar-i18n.js.
 * Language names are self-names and are not translated.
 */

export const LANGUAGES = Object.freeze([
  Object.freeze({ code: "en", name: "English", dir: "ltr" }),
  Object.freeze({ code: "it", name: "Italiano", dir: "ltr" }),
  Object.freeze({ code: "de", name: "Deutsch", dir: "ltr" }),
  Object.freeze({ code: "fr", name: "Français", dir: "ltr" }),
  Object.freeze({ code: "es", name: "Español", dir: "ltr" }),
  Object.freeze({ code: "pt", name: "Português", dir: "ltr" }),
  Object.freeze({ code: "nl", name: "Nederlands", dir: "ltr" }),
  Object.freeze({ code: "sv", name: "Svenska", dir: "ltr" }),
  Object.freeze({ code: "pl", name: "Polski", dir: "ltr" }),
  Object.freeze({ code: "id", name: "Bahasa Indonesia", dir: "ltr" }),
  Object.freeze({ code: "zh", name: "中文", dir: "ltr" }),
  Object.freeze({ code: "ja", name: "日本語", dir: "ltr" }),
  Object.freeze({ code: "ko", name: "한국어", dir: "ltr" }),
  Object.freeze({ code: "hi", name: "हिन्दी", dir: "ltr" }),
  Object.freeze({ code: "ru", name: "Русский", dir: "ltr" }),
  Object.freeze({ code: "ckb", name: "کوردی — سۆرانی", dir: "rtl" }),
  Object.freeze({ code: "kmr", name: "Kurdî — Kurmancî", dir: "ltr" }),
  Object.freeze({ code: "tr", name: "Türkçe", dir: "ltr" }),
  Object.freeze({ code: "ar", name: "العربية", dir: "rtl" }),
  Object.freeze({ code: "fa", name: "فارسی", dir: "rtl" }),
  Object.freeze({ code: "ur", name: "اردو", dir: "rtl" })
]);

export const LANGUAGE_STORAGE_KEY = "havkar_language";
export const LANGUAGE_DIR_STORAGE_KEY = "havkar_language_dir";

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function languageByCode(code) {
  return BY_CODE.get(String(code || "").trim().toLowerCase()) || null;
}

export function applyLanguage(code) {
  const language = languageByCode(code) || languageByCode("en");

  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language.code);
    localStorage.setItem(LANGUAGE_DIR_STORAGE_KEY, language.dir);
  } catch {
    // Storage can be unavailable in a private web view.
  }

  return language;
}

export function storedLanguage() {
  try {
    return languageByCode(localStorage.getItem(LANGUAGE_STORAGE_KEY))
      || languageByCode("en");
  } catch {
    return languageByCode("en");
  }
}
