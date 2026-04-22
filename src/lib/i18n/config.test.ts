import { describe, expect, it } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { DEFAULT_LANGUAGE, I18N_NAMESPACES, LANGUAGE_DETECTION_OPTIONS, SUPPORTED_LANGUAGES } from "./config";

describe("i18n config", () => {
  it("uses browser language detector with URL and local storage precedence", () => {
    expect(LANGUAGE_DETECTION_OPTIONS.order).toEqual([
      "querystring",
      "path",
      "localStorage",
      "navigator",
      "htmlTag",
    ]);
    expect(LANGUAGE_DETECTION_OPTIONS.lookupQuerystring).toBe("lng");
    expect(LANGUAGE_DETECTION_OPTIONS.lookupLocalStorage).toBe(LANGUAGE_STORAGE_KEY);
    expect(LANGUAGE_DETECTION_OPTIONS.caches).toEqual(["localStorage"]);
  });

  it("keeps the supported language contract stable", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "de", "es"]);
    expect(DEFAULT_LANGUAGE).toBe("en");
  });

  it("keeps the namespace contract stable", () => {
    expect(I18N_NAMESPACES).toEqual([
      "app",
      "auth",
      "composer",
      "filters",
      "onboarding",
      "relay",
      "shell",
      "tasks",
    ]);
  });
});
