import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNoasApiBaseDiscoverySessionCacheForTests,
  discoverNoasApiBaseUrl,
  resolveNoasApiBaseUrl,
} from "./noas-discovery";

describe("resolveNoasApiBaseUrl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearNoasApiBaseDiscoverySessionCacheForTests();
    vi.restoreAllMocks();
  });

  it("discovers and caches the NoaS API base URL for the current session only", async () => {
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
    expect(window.localStorage.getItem("nostr_noas_api_base_cache_map")).toBeNull();
  });

  it("does not reuse legacy persisted api-base mappings from browser storage", async () => {
    window.localStorage.setItem(
      "nostr_noas_api_base_cache_map",
      JSON.stringify({
        "https://noas.example": "https://api.noas.example/custom",
      })
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          noas: {
            api_base: "https://api.noas.example/live",
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

    await expect(resolveNoasApiBaseUrl("https://noas.example/signin")).resolves.toBe("https://api.noas.example/live");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a canonical api base when discovery does not expose a valid api_base", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ names: {} }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    await expect(resolveNoasApiBaseUrl("noas.example/custom")).resolves.toBe("https://noas.example/custom/api/v1");
  });

  it("resolves relative api_base values against the discovery origin", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        noas: {
          api_base: "/api/v1",
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    await expect(resolveNoasApiBaseUrl("https://noas.example")).resolves.toBe("https://noas.example/api/v1");
  });

  it("falls back to origin /api/v1 when a submitted URL points at a legacy endpoint path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network failure"));

    await expect(resolveNoasApiBaseUrl("https://noas.example/signin")).resolves.toBe("https://noas.example/api/v1");
  });

  it("returns null discovery results when nostr.json has no valid Noas api_base", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ names: {} }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    await expect(discoverNoasApiBaseUrl("https://noas.example")).resolves.toBeNull();
  });
});
