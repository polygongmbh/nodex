import { describe, expect, it } from "vitest";
import {
  getPreferredAvatarGenerator,
  setPreferredAvatarGenerator,
} from "./avatar-preferences";

describe("avatar preferences", () => {
  it("defaults to boring generator", () => {
    localStorage.removeItem("nodex.avatar.generator");
    expect(getPreferredAvatarGenerator()).toBe("boring");
  });

  it("persists selected generator", () => {
    setPreferredAvatarGenerator("dicebear-local");
    expect(getPreferredAvatarGenerator()).toBe("dicebear-local");
  });
});
