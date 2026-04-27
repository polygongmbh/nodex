import { describe, expect, it } from "vitest";
import enApp from "@/locales/en/app.json";
import enAuth from "@/locales/en/auth.json";
import enComposer from "@/locales/en/composer.json";
import enFilters from "@/locales/en/filters.json";
import enOnboarding from "@/locales/en/onboarding.json";
import enRelay from "@/locales/en/relay.json";
import enShell from "@/locales/en/shell.json";
import enTasks from "@/locales/en/tasks.json";
import enWelcome from "@/locales/en/welcome.json";
import deApp from "@/locales/de/app.json";
import deAuth from "@/locales/de/auth.json";
import deComposer from "@/locales/de/composer.json";
import deFilters from "@/locales/de/filters.json";
import deOnboarding from "@/locales/de/onboarding.json";
import deRelay from "@/locales/de/relay.json";
import deShell from "@/locales/de/shell.json";
import deTasks from "@/locales/de/tasks.json";
import deWelcome from "@/locales/de/welcome.json";
import esApp from "@/locales/es/app.json";
import esAuth from "@/locales/es/auth.json";
import esComposer from "@/locales/es/composer.json";
import esFilters from "@/locales/es/filters.json";
import esOnboarding from "@/locales/es/onboarding.json";
import esRelay from "@/locales/es/relay.json";
import esShell from "@/locales/es/shell.json";
import esTasks from "@/locales/es/tasks.json";
import esWelcome from "@/locales/es/welcome.json";

function flattenTranslations(value: unknown, prefix: string = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenTranslations(child, nextPrefix);
  });
}

describe("locale parity", () => {
  const namespaces = {
    app: { en: enApp, de: deApp, es: esApp },
    auth: { en: enAuth, de: deAuth, es: esAuth },
    composer: { en: enComposer, de: deComposer, es: esComposer },
    filters: { en: enFilters, de: deFilters, es: esFilters },
    onboarding: { en: enOnboarding, de: deOnboarding, es: esOnboarding },
    relay: { en: enRelay, de: deRelay, es: esRelay },
    shell: { en: enShell, de: deShell, es: esShell },
    tasks: { en: enTasks, de: deTasks, es: esTasks },
    welcome: { en: enWelcome, de: deWelcome, es: esWelcome },
  } as const;

  for (const [namespace, localeSet] of Object.entries(namespaces)) {
    const referenceKeys = flattenTranslations(localeSet.en).sort();

    it(`keeps German ${namespace} translations aligned with English keys`, () => {
      expect(flattenTranslations(localeSet.de).sort()).toEqual(referenceKeys);
    });

    it(`keeps Spanish ${namespace} translations aligned with English keys`, () => {
      expect(flattenTranslations(localeSet.es).sort()).toEqual(referenceKeys);
    });
  }
});
