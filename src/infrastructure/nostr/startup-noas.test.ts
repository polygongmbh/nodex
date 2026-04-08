import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStartupNoasBootstrap,
  resolveStartupNoasBootstrap,
} from "./startup-noas";
import { resolveRootDomainHostname } from "@/lib/root-domain";

const noasClientModule = vi.hoisted(() => ({
  discoverNoasApiBaseUrl: vi.fn(),
  normalizeNoasBaseUrl: vi.fn((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      return new URL(withProtocol).toString().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }),
}));

const storageModule = vi.hoisted(() => ({
  loadPersistedNoasDefaultHostUrl: vi.fn(),
  savePersistedNoasDefaultHostUrl: vi.fn(),
}));

vi.mock("@/lib/nostr/noas-discovery", () => noasClientModule);
vi.mock("@/infrastructure/nostr/provider/storage", () => storageModule);
vi.mock("@/lib/nostr/dev-logs", () => ({
  nostrDevLog: vi.fn(),
}));

describe("startup Noas bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    storageModule.loadPersistedNoasDefaultHostUrl.mockReturnValue("");
    noasClientModule.discoverNoasApiBaseUrl.mockResolvedValue(null);
    window.history.pushState({}, "", "/feed");
  });

  it("uses env configuration without fallback resolution", () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "https://env.example.com");

    expect(readStartupNoasBootstrap()).toEqual({
      defaultHostUrl: "https://env.example.com",
      source: "env",
      needsAsyncFallback: false,
    });
    expect(storageModule.loadPersistedNoasDefaultHostUrl).not.toHaveBeenCalled();
  });

  it("uses a persisted host when host configuration is absent", () => {
    storageModule.loadPersistedNoasDefaultHostUrl.mockReturnValue("https://persisted.example.com");

    expect(readStartupNoasBootstrap()).toEqual({
      defaultHostUrl: "https://persisted.example.com",
      source: "persisted",
      needsAsyncFallback: false,
    });
  });

  it("marks fallback resolution as pending when no host or persisted host exists", () => {
    expect(readStartupNoasBootstrap()).toEqual({
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: true,
    });
  });

  it("discovers and persists a root-domain Noas host when nostr.json exposes noas.api_base", async () => {
    noasClientModule.discoverNoasApiBaseUrl.mockResolvedValue({
      discoveryOrigin: "http://localhost",
      discoveredApiBaseUrl: "http://localhost/api/v1",
    });

    await expect(resolveStartupNoasBootstrap()).resolves.toEqual({
      defaultHostUrl: "http://localhost",
      source: "fallback",
      needsAsyncFallback: false,
    });
    expect(noasClientModule.discoverNoasApiBaseUrl).toHaveBeenCalledWith("http://localhost");
    expect(storageModule.savePersistedNoasDefaultHostUrl).toHaveBeenCalledWith("http://localhost");
  });

  it("does not persist a root-domain host when discovery finds no Noas response", async () => {
    await expect(resolveStartupNoasBootstrap()).resolves.toEqual({
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: false,
    });
    expect(storageModule.savePersistedNoasDefaultHostUrl).not.toHaveBeenCalled();
  });
});

describe("resolveRootDomainHostname", () => {
  it.each([
    ["app.example.com", "example.com"],
    ["example.com", "example.com"],
    ["localhost", "localhost"],
    ["192.168.1.5", "192.168.1.5"],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveRootDomainHostname(input)).toBe(expected);
  });
});
