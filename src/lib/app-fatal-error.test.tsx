import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearChunkErrorReloadState,
  consumeReloadSearchParam,
  getAppErrorMessage,
  markChunkErrorReloadAttempted,
  reloadAppWithCacheBypass,
  shouldRetryChunkErrorOnce,
} from "@/lib/app-fatal-error";

describe("app fatal error rendering", () => {
  afterEach(() => {
    window.history.replaceState(window.history.state, "", "/");
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("normalizes unknown errors into a user-facing message", () => {
    expect(getAppErrorMessage(new Error("Boot failed"))).toBe("Boot failed");
    expect(getAppErrorMessage("Fatal string")).toBe("Fatal string");
    expect(getAppErrorMessage({ reason: "opaque" })).toBe("Unexpected application error");
  });

  it("tracks chunk reload retries through session storage", () => {
    expect(shouldRetryChunkErrorOnce()).toBe(true);

    markChunkErrorReloadAttempted();
    expect(shouldRetryChunkErrorOnce()).toBe(false);

    clearChunkErrorReloadState();
    expect(shouldRetryChunkErrorOnce()).toBe(true);
  });

  it("consumes the reload search param after a retry", () => {
    window.history.replaceState(window.history.state, "", "/?reload=123");
    markChunkErrorReloadAttempted();

    consumeReloadSearchParam();

    expect(window.location.search).toBe("");
    expect(shouldRetryChunkErrorOnce()).toBe(true);
  });

  it("clears prior chunk retry state before reloading", () => {
    markChunkErrorReloadAttempted();

    reloadAppWithCacheBypass();
    expect(shouldRetryChunkErrorOnce()).toBe(true);
  });
});
