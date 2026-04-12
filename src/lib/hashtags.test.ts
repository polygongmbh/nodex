import { describe, expect, it } from "vitest";
import {
  countHashtagsInContent,
  extractCommittedHashtags,
  extractHashtagsFromContent,
  getHashtagQueryAtCursor,
} from "./hashtags";

describe("hashtags helpers", () => {
  it("extracts whitespace-delimited hashtags and ignores embedded or punctuated prefixes", () => {
    expect(extractHashtagsFromContent("alpha#beta #gamma (#delta)")).toEqual(["gamma"]);
  });

  it("counts only standalone hashtags", () => {
    expect(countHashtagsInContent("alpha#beta #gamma #delta")).toBe(2);
  });

  it("returns an active hashtag query only when the cursor is in a standalone token", () => {
    expect(getHashtagQueryAtCursor("ship #back")).toBe("back");
    expect(getHashtagQueryAtCursor("ship email#back")).toBeNull();
    expect(getHashtagQueryAtCursor("ship (#back")).toBeNull();
  });

  it("extracts only committed hashtags followed by whitespace or end of content", () => {
    expect(extractCommittedHashtags("ship #alpha next #bet")).toEqual(["alpha", "bet"]);
    expect(extractCommittedHashtags("ship #alpha,next email#ops")).toEqual([]);
  });
});
