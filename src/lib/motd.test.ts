import { describe, expect, it } from "vitest";
import { getMotdDismissStorageKey, resolveMotd, MOTD_DISMISS_STORAGE_KEY_PREFIX } from "./motd";

describe("resolveMotd", () => {
  it("returns null when env key is missing or blank", () => {
    expect(resolveMotd({})).toBeNull();
    expect(resolveMotd({ VITE_NODEX_MOTD: "" })).toBeNull();
    expect(resolveMotd({ VITE_NODEX_MOTD: "   " })).toBeNull();
  });

  it("returns trimmed MOTD when configured", () => {
    expect(resolveMotd({ VITE_NODEX_MOTD: "  maintenance at 18:00  " })).toBe("maintenance at 18:00");
  });
});

describe("getMotdDismissStorageKey", () => {
  it("namespaces dismissal key by message content", () => {
    expect(getMotdDismissStorageKey("hello")).toBe(`${MOTD_DISMISS_STORAGE_KEY_PREFIX}hello`);
  });
});
