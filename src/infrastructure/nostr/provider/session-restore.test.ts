import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForNostrExtensionAvailability } from "./session-restore";

type WindowWithNostr = Window & { nostr?: unknown };

describe("waitForNostrExtensionAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as WindowWithNostr).nostr;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as WindowWithNostr).nostr;
  });

  it("resolves immediately when extension is already available", async () => {
    (window as WindowWithNostr).nostr = { getPublicKey: async () => "", signEvent: async (e: any) => ({ sig: "" }) } as any;
    await expect(waitForNostrExtensionAvailability()).resolves.toBe(true);
  });

  it("resolves when extension becomes available after nostr#initialized", async () => {
    const pending = waitForNostrExtensionAvailability({ timeoutMs: 3000, pollIntervalMs: 200 });
    vi.advanceTimersByTime(400);
    (window as WindowWithNostr).nostr = {} as unknown;
    window.dispatchEvent(new Event("nostr#initialized"));
    await expect(pending).resolves.toBe(true);
  });

  it("resolves false when extension never appears before timeout", async () => {
    const pending = waitForNostrExtensionAvailability({ timeoutMs: 900, pollIntervalMs: 150 });
    vi.advanceTimersByTime(901);
    await expect(pending).resolves.toBe(false);
  });

  it("resolves false when aborted before extension appears", async () => {
    const controller = new AbortController();
    const pending = waitForNostrExtensionAvailability({ signal: controller.signal, timeoutMs: 3000 });
    controller.abort();
    await expect(pending).resolves.toBe(false);
  });
});
