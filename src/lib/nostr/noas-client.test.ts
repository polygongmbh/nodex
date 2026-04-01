import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoasClient,
} from "./noas-client";

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
        password_hash: "f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7",
      }),
      credentials: "include",
    });
  });

  it("normalizes successful sign-in payloads that use Noas snake_case fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        public_key: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        private_key_encrypted: "ncryptsec1example",
        relays: ["wss://relay.example"],
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const client = new NoasClient("https://noas.example/api/v1");
    const result = await client.signIn("alice", "hunter2");

    expect(result).toMatchObject({
      success: true,
      publicKey: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      encryptedPrivateKey: "ncryptsec1example",
      relays: ["wss://relay.example"],
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
      {
        redirect: "https://nodex.polygon.gmbh",
        relays: ["wss://relay.one", "wss://relay.two/"],
      }
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
      relays: ["wss://relay.one", "wss://relay.two/"],
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

  it("normalizes signup relay lists from Noas register responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        status: "active",
        public_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        relays: ["wss://relay.one/", "wss://relay.two"],
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

    expect(response.relays).toEqual(["wss://relay.one/", "wss://relay.two"]);
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
