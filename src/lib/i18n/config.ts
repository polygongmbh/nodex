import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { LANGUAGE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import enCommon from "@/locales/en/common.json";
import deCommon from "@/locales/de/common.json";
import esCommon from "@/locales/es/common.json";

export const SUPPORTED_LANGUAGES = ["en", "de", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

function normalizeLanguage(value?: string | null): SupportedLanguage | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("es")) return "es";
  return undefined;
}

export const LANGUAGE_DETECTION_OPTIONS = {
  order: ["querystring", "path", "localStorage", "navigator", "htmlTag"] as const,
  lookupQuerystring: "lng",
  lookupLocalStorage: LANGUAGE_STORAGE_KEY,
  caches: ["localStorage"] as const,
  excludeCacheFor: ["cimode"] as const,
} satisfies NonNullable<Parameters<typeof i18n.init>[0]>["detection"];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      nonExplicitSupportedLngs: true,
      load: "languageOnly",
      detection: LANGUAGE_DETECTION_OPTIONS,
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
    document.documentElement.lang = normalized;
  });

  const normalizedInitialLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  if (normalizedInitialLanguage && typeof window !== "undefined") {
    document.documentElement.lang = normalizedInitialLanguage;
  }
}

export default i18n;
