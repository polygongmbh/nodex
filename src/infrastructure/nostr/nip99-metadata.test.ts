import { describe, expect, it } from "vitest";
import { buildNip99PublishTags, parseNip99MetadataFromTags } from "./nip99-metadata";

describe("nip99 metadata", () => {
  it("parses canonical NIP-99 tags", () => {
    const parsed = parseNip99MetadataFromTags([
      ["d", "listing-1"],
      ["title", "Bike"],
      ["summary", "Great commuter bike"],
      ["published_at", "1700000000"],
      ["status", "sold"],
      ["price", "150", "EUR", "month"],
    ]);

    expect(parsed).toEqual({
      identifier: "listing-1",
      title: "Bike",
      summary: "Great commuter bike",
      location: undefined,
      status: "sold",
      publishedAt: "1700000000",
      price: "150",
      currency: "EUR",
      frequency: "month",
    });
  });

  it("publishes canonical NIP-99 tags", () => {
    const tags = buildNip99PublishTags({
      hashtags: ["bikes"],
      mentionPubkeys: [],
      metadata: {
        identifier: "listing-2",
        title: "Road bike",
        summary: "Lightweight aluminum frame",
        price: "500",
        currency: "USD",
        frequency: "month",
        publishedAt: "1700000123",
      },
    });

    expect(tags).toContainEqual(["published_at", "1700000123"]);
    expect(tags).toContainEqual(["price", "500", "USD", "month"]);
    expect(tags.some((tag) => tag[0] === "type")).toBe(false);
    expect(tags.some((tag) => tag[0] === "currency")).toBe(false);
    expect(tags.some((tag) => tag[0] === "frequency")).toBe(false);
  });

  it("omits currency from price tag when not provided", () => {
    const tags = buildNip99PublishTags({
      hashtags: [],
      mentionPubkeys: [],
      metadata: {
        identifier: "listing-3",
        title: "Desk lamp",
        price: "30",
      },
    });

    expect(tags).toContainEqual(["price", "30"]);
  });

  it("adds g tag when location geohash is provided", () => {
    const tags = buildNip99PublishTags({
      hashtags: [],
      mentionPubkeys: [],
      metadata: {
        identifier: "listing-4",
        title: "Chair",
      },
      locationGeohash: "U4PRUYD",
    });

    expect(tags).toContainEqual(["g", "u4pruyd"]);
  });
});
