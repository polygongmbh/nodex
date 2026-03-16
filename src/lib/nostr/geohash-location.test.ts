import { describe, expect, it } from "vitest";
import {
  buildPreferredMapLink,
  buildGeohashTag,
  decodeGeohash,
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

  it("decodes geohash to approximate center and region size", () => {
    const decoded = decodeGeohash("u4pruyd");
    expect(decoded).toBeDefined();
    expect(decoded?.latitude).toBeCloseTo(57.649, 2);
    expect(decoded?.longitude).toBeCloseTo(10.407, 2);
    expect(decoded?.radiusMeters).toBeGreaterThan(0);
  });

  it("builds platform map links for decoded coordinates", () => {
    expect(buildPreferredMapLink(37.7749, -122.4194, "Android")).toContain("geo:");
    expect(buildPreferredMapLink(37.7749, -122.4194, "iPhone")).toContain("maps.apple.com");
    expect(buildPreferredMapLink(37.7749, -122.4194, "Desktop")).toContain("google.com/maps/search");
  });
});
