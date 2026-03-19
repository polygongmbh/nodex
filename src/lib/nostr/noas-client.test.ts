import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveNoasApiBaseUrl } from "./noas-client";

describe("resolveNoasApiBaseUrl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("discovers and caches the NoaS API base URL from nostr.json", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          noas: {
            api_base: "https://api.noas.example/custom/",
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

    await expect(resolveNoasApiBaseUrl("https://noas.example/signin")).resolves.toBe("https://api.noas.example/custom");
    await expect(resolveNoasApiBaseUrl("https://noas.example")).resolves.toBe("https://api.noas.example/custom");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://noas.example/.well-known/nostr.json", {
      headers: {
        Accept: "application/nostr+json, application/json",
      },
    });
  });

  it("falls back to the submitted host when discovery does not expose a valid api_base", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ names: {} }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    await expect(resolveNoasApiBaseUrl("noas.example/custom")).resolves.toBe("https://noas.example/custom");
  });
});
