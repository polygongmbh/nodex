import { describe, expect, it } from "vitest";
import { shouldPromptSignInAfterOnboarding } from "./onboarding-auth-prompt";

describe("shouldPromptSignInAfterOnboarding", () => {
  it("returns true when signed out and every relay requires auth for reads", () => {
    expect(shouldPromptSignInAfterOnboarding({
      isSignedIn: false,
      relays: [
        { url: "wss://one.example", status: "verification-failed" },
        { url: "wss://two.example", status: "connected", nip11: { authRequired: true, supportsNip42: true, checkedAt: 1 } },
      ],
    })).toBe(true);
  });

  it("returns false when signed in, no relays, or any relay allows anonymous reads", () => {
    expect(shouldPromptSignInAfterOnboarding({
      isSignedIn: true,
      relays: [{ url: "wss://one.example", status: "verification-failed" }],
    })).toBe(false);
    expect(shouldPromptSignInAfterOnboarding({
      isSignedIn: false,
      relays: [],
    })).toBe(false);
    expect(shouldPromptSignInAfterOnboarding({
      isSignedIn: false,
      relays: [
        { url: "wss://one.example", status: "verification-failed" },
        { url: "wss://two.example", status: "connected", nip11: { authRequired: false, supportsNip42: true, checkedAt: 1 } },
      ],
    })).toBe(false);
  });
});
