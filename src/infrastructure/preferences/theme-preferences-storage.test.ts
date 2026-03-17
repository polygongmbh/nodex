import { describe, expect, it, vi } from "vitest";
import {
  THEME_MODE_STORAGE_KEY,
  getStoredThemeMode,
  resolveEffectiveTheme,
  setStoredThemeMode,
  type ThemeMode,
} from "./theme-preferences-storage";

describe("theme-preferences", () => {
  it("defaults to auto and persists it when no stored value exists", () => {
    localStorage.removeItem(THEME_MODE_STORAGE_KEY);

    const mode = getStoredThemeMode();

    expect(mode).toBe("auto");
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("auto");
  });

  it("defaults to auto and persists it when stored value is invalid", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, "invalid");

    const mode = getStoredThemeMode();

    expect(mode).toBe("auto");
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("auto");
  });

  it("reads and writes valid modes", () => {
    const modes: ThemeMode[] = ["light", "dark", "auto"];

    for (const mode of modes) {
      setStoredThemeMode(mode);
      expect(getStoredThemeMode()).toBe(mode);
    }
  });

  it("falls back to auto when storage throws", () => {
    const getter = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getStoredThemeMode()).toBe("auto");
    expect(() => setStoredThemeMode("dark")).not.toThrow();

    getter.mockRestore();
    setter.mockRestore();
  });

  it("resolves effective theme correctly", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("light", false)).toBe("light");
    expect(resolveEffectiveTheme("dark", true)).toBe("dark");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
    expect(resolveEffectiveTheme("auto", true)).toBe("dark");
    expect(resolveEffectiveTheme("auto", false)).toBe("light");
  });
});
