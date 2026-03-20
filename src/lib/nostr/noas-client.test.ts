import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoasClient, resolveNoasApiBaseUrl } from "./noas-client";

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
});

describe("NoasClient API route mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes sign-in to /auth/signin on the discovered api_base", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1/");
    await client.signIn("alice", "hunter2");

    expect(fetchSpy).toHaveBeenCalledWith("https://noas.example/api/v1/auth/signin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "alice",
        password: "hunter2",
      }),
      credentials: "include",
    });
  });

  it("routes registration to /auth/register on the discovered api_base", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    await client.register("alice", "hunter2", "nsec123", "pubkey123", ["wss://relay.example"]);

    expect(fetchSpy).toHaveBeenCalledWith("https://noas.example/api/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "alice",
        password: "hunter2",
        nsecKey: "nsec123",
        pubkey: "pubkey123",
        relays: ["wss://relay.example"],
      }),
    });
  });

  it("routes profile-picture reads to /picture/:pubkey on the discovered api_base", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 404 })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    await client.getProfilePicture("abcdef123456");

    expect(fetchSpy).toHaveBeenCalledWith("https://noas.example/api/v1/picture/abcdef123456", {
      method: "GET",
      credentials: "include",
    });
  });
});
