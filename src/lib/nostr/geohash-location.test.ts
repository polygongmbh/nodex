import { describe, expect, it } from "vitest";
import {
  buildGeohashTag,
  encodeGeohash,
  normalizeGeohash,
  parseFirstGeohashTag,
} from "./geohash-location";

describe("geohash location helpers", () => {
  it("normalizes valid geohash input", () => {
    expect(normalizeGeohash(" U4PRUYD ")).toBe("u4pruyd");
  });

  it("rejects invalid geohash input", () => {
    expect(normalizeGeohash("abc!123")).toBeUndefined();
  });

  it("builds g tag from valid geohash", () => {
    expect(buildGeohashTag("u4pruyd")).toEqual(["g", "u4pruyd"]);
    expect(buildGeohashTag("invalid!")).toBeUndefined();
  });

  it("parses first valid g tag", () => {
    expect(parseFirstGeohashTag([["g", "invalid!"], ["g", "u4pruyd"]])).toBe("u4pruyd");
    expect(parseFirstGeohashTag([["t", "foo"]])).toBeUndefined();
  });

  it("encodes latitude/longitude to deterministic geohash", () => {
    // Times Square (approximate)
    expect(encodeGeohash(40.758, -73.9855, 7)).toBe("dr5ru7v");
  });
});
