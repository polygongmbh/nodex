import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverNoasApiBaseUrl, NoasClient, resolveNoasApiBaseUrl } from "./noas-client";

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

  it("returns raw sign-in error text and HTTP status for non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Username already active. Sign in." }), {
        status: 409,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    const result = await client.signIn("alice", "hunter2");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Username already active. Sign in.");
    expect(result.httpStatus).toBe(409);
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
    await client.register(
      "alice",
      "hunter2",
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "pubkey123",
      { redirect: "https://nodex.polygon.gmbh" }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://noas.example/api/v1/auth/register");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const parsedBody = JSON.parse(String((init as RequestInit).body ?? "{}"));
    expect(parsedBody).toMatchObject({
      username: "alice",
      password_hash: "f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7",
      public_key: "pubkey123",
      redirect: "https://nodex.polygon.gmbh",
    });
    expect(parsedBody.private_key_encrypted).toMatch(/^ncryptsec/);
  });

  it("returns raw register error text and HTTP status for non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Username already active. Sign in." }), {
        status: 409,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    const result = await client.register(
      "alice",
      "hunter2",
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "pubkey123",
      { redirect: "https://nodex.polygon.gmbh" }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Username already active. Sign in.");
    expect(result.httpStatus).toBe(409);
  });

  it("normalizes v1 registration responses into the legacy user shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        status: "unverified_email",
        public_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    const response = await client.register(
      "alice",
      "hunter2",
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );

    expect(response.success).toBe(true);
    expect(response.status).toBe("unverified_email");
    expect(response.user).toEqual({
      username: "alice",
      publicKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
