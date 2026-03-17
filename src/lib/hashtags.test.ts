import { describe, expect, it } from "vitest";
import {
  countHashtagsInContent,
  extractCommittedHashtags,
  extractHashtagsFromContent,
  getHashtagQueryAtCursor,
} from "./hashtags";

describe("hashtags helpers", () => {
  it("extracts standalone hashtags and ignores embedded ones", () => {
    expect(extractHashtagsFromContent("alpha#beta #gamma (#delta)")).toEqual(["gamma", "delta"]);
  });

  it("counts only standalone hashtags", () => {
    expect(countHashtagsInContent("alpha#beta #gamma #delta")).toBe(2);
  });

  it("returns an active hashtag query only when the cursor is in a standalone token", () => {
    expect(getHashtagQueryAtCursor("ship #back")).toBe("back");
    expect(getHashtagQueryAtCursor("ship email#back")).toBeNull();
  });

  it("extracts only committed hashtags followed by whitespace or end of content", () => {
    expect(extractCommittedHashtags("ship #alpha next #bet")).toEqual(["alpha", "bet"]);
    expect(extractCommittedHashtags("ship #alpha,next email#ops")).toEqual([]);
  });
});
