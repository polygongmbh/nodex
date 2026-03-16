import { describe, expect, it } from "vitest";
import enCommon from "@/locales/en/common.json";
import deCommon from "@/locales/de/common.json";
import esCommon from "@/locales/es/common.json";

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
  const referenceKeys = flattenTranslations(enCommon).sort();

  it("keeps German translations aligned with English keys", () => {
    expect(flattenTranslations(deCommon).sort()).toEqual(referenceKeys);
  });

  it("keeps Spanish translations aligned with English keys", () => {
    expect(flattenTranslations(esCommon).sort()).toEqual(referenceKeys);
  });
});
