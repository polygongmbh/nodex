import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { notifyPartialPublish, notifyPublishSavedForRetry, notifyPublished } from "./notifications";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

const t = ((key: string, params?: Record<string, unknown>) => {
  if (!params) return key;
  return `${key}:${JSON.stringify(params)}`;
}) as never;

describe("notifyPublishSavedForRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses generic toast when no reason is provided", () => {
    notifyPublishSavedForRetry(t);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("toasts.errors.publishSavedForRetry");
  });

  it("uses reason toast when rejection reason exists", () => {
    notifyPublishSavedForRetry(t, { reason: "auth-required: whitelist" });
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      'toasts.errors.publishSavedForRetryWithReason:{"reason":"auth-required: whitelist"}'
    );
  });

  it("uses relay+reason toast when single relay is known", () => {
    notifyPublishSavedForRetry(t, {
      relayUrl: "wss://relay.example.com",
      reason: "auth-required: whitelist",
    });
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      'toasts.errors.publishSavedForRetryWithRelayReason:{"relayUrl":"wss://relay.example.com","reason":"auth-required: whitelist"}'
    );
  });
});

describe("notifyPartialPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows warning toast with publish counts", () => {
    notifyPartialPublish(t, { publishedCount: 1, targetCount: 3 });
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'toasts.warnings.partialPublish:{"publishedCount":1,"targetCount":3}'
    );
  });
});

describe("notifyPublished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a space-specific success toast when one space is known", () => {
    notifyPublished(t, "comment", { spaceNames: ["relay.one"] });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'toasts.success.publishedToSpaces:{"spaceNames":"relay.one"}'
    );
  });

  it("lists all known spaces in the success toast", () => {
    notifyPublished(t, "comment", { spaceNames: ["relay.one", "relay.two", "relay.three"] });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'toasts.success.publishedToSpaces:{"spaceNames":"relay.one, relay.two, relay.three"}'
    );
  });

  it("falls back to the generic success toast when no space is known", () => {
    notifyPublished(t, "comment");
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("toasts.success.publishedComment");
  });
});
