import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "@/locales/en/common.json";
import deCommon from "@/locales/de/common.json";
import esCommon from "@/locales/es/common.json";

export const SUPPORTED_LANGUAGES = ["en", "de", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANGUAGE_STORAGE_KEY = "nodex.language";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function resolveStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { localStorage?: unknown }).localStorage;
  if (!candidate || typeof candidate !== "object") return null;
  const maybeStorage = candidate as Partial<StorageLike>;
  if (typeof maybeStorage.getItem !== "function" || typeof maybeStorage.setItem !== "function") {
    return null;
  }
  return maybeStorage as StorageLike;
}

function safeStorageGetItem(key: string): string | null {
  const storage = resolveStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSetItem(key: string, value: string): void {
  const storage = resolveStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures (private mode, strict sandboxing, test environments).
  }
}

function normalizeLanguage(value?: string | null): SupportedLanguage | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("es")) return "es";
  return undefined;
}

function resolveInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = normalizeLanguage(safeStorageGetItem(LANGUAGE_STORAGE_KEY));
  if (stored) return stored;
  const preferredLanguages = window.navigator.languages ?? [];
  for (const language of preferredLanguages) {
    const normalized = normalizeLanguage(language);
    if (normalized) return normalized;
  }
  const browser = normalizeLanguage(window.navigator.language);
  return browser ?? DEFAULT_LANGUAGE;
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      lng: resolveInitialLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      interpolation: { escapeValue: false },
      resources: {
        en: { common: enCommon },
        de: { common: deCommon },
        es: { common: esCommon },
      },
      ns: ["common"],
      defaultNS: "common",
    });

  i18n.on("languageChanged", (language) => {
    const normalized = normalizeLanguage(language);
    if (!normalized || typeof window === "undefined") return;
    safeStorageSetItem(LANGUAGE_STORAGE_KEY, normalized);
    document.documentElement.lang = normalized;
  });
}

export default i18n;
