import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { notifyPartialPublish, notifyPublishSavedForRetry, notifyPublished } from "./notifications";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/i18n/config", () => ({
  default: {
    t: vi.fn((key: string, params?: Record<string, unknown>) => ({ key, params })),
  },
}));

vi.mock("@/infrastructure/nostr/relay-identity", () => ({
  getRelayNameFromUrl: vi.fn((relayUrl: string) => relayUrl.replace(/^wss?:\/\//, "")),
}));

describe("notifyPublishSavedForRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the generic retry toast without relay details", () => {
    notifyPublishSavedForRetry();

    expect(i18n.t).toHaveBeenCalledWith("toasts.errors.publishSavedForRetry");
    expect(toast.error).toHaveBeenCalledWith({ key: "toasts.errors.publishSavedForRetry", params: undefined });
  });

  it("prefers the relay+reason retry toast when both details are known", () => {
    notifyPublishSavedForRetry({
      relayUrl: "wss://relay.example.com",
      reason: "auth-required: whitelist",
    });

    expect(i18n.t).toHaveBeenCalledWith("toasts.errors.publishSavedForRetryWithRelayReason", {
      relayUrl: "wss://relay.example.com",
      reason: "auth-required: whitelist",
    });
    expect(toast.error).toHaveBeenCalledWith({
      key: "toasts.errors.publishSavedForRetryWithRelayReason",
      params: {
        relayUrl: "wss://relay.example.com",
        reason: "auth-required: whitelist",
      },
    });
  });
});

describe("notifyPartialPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes publish counts into the partial publish warning", () => {
    notifyPartialPublish({ publishedCount: 1, targetCount: 3 });

    expect(i18n.t).toHaveBeenCalledWith("toasts.warnings.partialPublish", {
      publishedCount: 1,
      targetCount: 3,
    });
    expect(toast.warning).toHaveBeenCalledWith({
      key: "toasts.warnings.partialPublish",
      params: { publishedCount: 1, targetCount: 3 },
    });
  });
});

describe("notifyPublished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates and combines provided space names with resolved relay names", () => {
    notifyPublished("comment", {
      spaceNames: ["relay.one", "relay.two"],
      relayUrls: ["wss://relay.two", "wss://relay.three"],
    });

    expect(getRelayNameFromUrl).toHaveBeenCalledTimes(2);
    expect(getRelayNameFromUrl).toHaveBeenNthCalledWith(1, "wss://relay.two");
    expect(getRelayNameFromUrl).toHaveBeenNthCalledWith(2, "wss://relay.three");
    expect(i18n.t).toHaveBeenCalledWith("toasts.success.publishedToSpaces", {
      spaceNames: "relay.one, relay.two, relay.three",
    });
    expect(toast.success).toHaveBeenCalledWith({
      key: "toasts.success.publishedToSpaces",
      params: { spaceNames: "relay.one, relay.two, relay.three" },
    });
  });

  it("falls back to the generic comment success toast when no spaces are known", () => {
    notifyPublished("comment");

    expect(getRelayNameFromUrl).not.toHaveBeenCalled();
    expect(i18n.t).toHaveBeenCalledWith("toasts.success.publishedComment");
    expect(toast.success).toHaveBeenCalledWith({
      key: "toasts.success.publishedComment",
      params: undefined,
    });
  });
});
