import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { LANGUAGE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import enApp from "@/locales/en/app.json";
import enAuth from "@/locales/en/auth.json";
import enComposer from "@/locales/en/composer.json";
import enFilters from "@/locales/en/filters.json";
import enOnboarding from "@/locales/en/onboarding.json";
import enRelay from "@/locales/en/relay.json";
import enShell from "@/locales/en/shell.json";
import enTasks from "@/locales/en/tasks.json";
import deApp from "@/locales/de/app.json";
import deAuth from "@/locales/de/auth.json";
import deComposer from "@/locales/de/composer.json";
import deFilters from "@/locales/de/filters.json";
import deOnboarding from "@/locales/de/onboarding.json";
import deRelay from "@/locales/de/relay.json";
import deShell from "@/locales/de/shell.json";
import deTasks from "@/locales/de/tasks.json";
import esApp from "@/locales/es/app.json";
import esAuth from "@/locales/es/auth.json";
import esComposer from "@/locales/es/composer.json";
import esFilters from "@/locales/es/filters.json";
import esOnboarding from "@/locales/es/onboarding.json";
import esRelay from "@/locales/es/relay.json";
import esShell from "@/locales/es/shell.json";
import esTasks from "@/locales/es/tasks.json";

export const SUPPORTED_LANGUAGES = ["en", "de", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const I18N_NAMESPACES = [
  "app",
  "auth",
  "composer",
  "filters",
  "onboarding",
  "relay",
  "shell",
  "tasks",
] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

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
        en: {
          app: enApp,
          auth: enAuth,
          composer: enComposer,
          filters: enFilters,
          onboarding: enOnboarding,
          relay: enRelay,
          shell: enShell,
          tasks: enTasks,
        },
        de: {
          app: deApp,
          auth: deAuth,
          composer: deComposer,
          filters: deFilters,
          onboarding: deOnboarding,
          relay: deRelay,
          shell: deShell,
          tasks: deTasks,
        },
        es: {
          app: esApp,
          auth: esAuth,
          composer: esComposer,
          filters: esFilters,
          onboarding: esOnboarding,
          relay: esRelay,
          shell: esShell,
          tasks: esTasks,
        },
      },
      ns: [...I18N_NAMESPACES],
      defaultNS: "shell",
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
