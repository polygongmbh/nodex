import { describe, expect, it } from "vitest";
import { computeAuthActionPolicy } from "./action-policy";

describe("computeAuthActionPolicy", () => {
  it("does not require profile setup when a signed-in user already has current profile metadata", () => {
    expect(
      computeAuthActionPolicy({
        isSignedIn: true,
        needsProfileSetup: false,
        hasCurrentUserProfileMetadata: true,
      }).requiresProfileSetup
    ).toBe(false);
  });

  it("requires profile setup when a signed-in user still lacks current profile metadata", () => {
    expect(
      computeAuthActionPolicy({
        isSignedIn: true,
        needsProfileSetup: false,
        hasCurrentUserProfileMetadata: false,
      }).requiresProfileSetup
    ).toBe(true);
  });
});
