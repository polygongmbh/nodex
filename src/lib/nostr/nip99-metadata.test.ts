import { describe, expect, it } from "vitest";
import { buildNip99PublishTags, parseNip99MetadataFromTags } from "./nip99-metadata";

describe("nip99 metadata normalization", () => {
  it("parses common alias tags and normalizes values", () => {
    const parsed = parseNip99MetadataFromTags([
      ["d", "listing-1"],
      ["title", "Bike"],
      ["description", "Great commuter bike"],
      ["publishedAt", "1700000000"],
      ["availability", "closed"],
      ["amount", "150"],
      ["currency", "eur"],
      ["frequency", "MONTH"],
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

  it("publishes canonical tags with compatibility aliases", () => {
    const tags = buildNip99PublishTags({
      feedMessageType: "offer",
      hashtags: ["bikes"],
      mentionPubkeys: [],
      metadata: {
        identifier: "listing-2",
        title: "Road bike",
        summary: "Lightweight aluminum frame",
        price: "500",
        currency: "usd",
        frequency: "Month",
        publishedAt: "1700000123",
      },
    });

    expect(tags).toContainEqual(["published_at", "1700000123"]);
    expect(tags).toContainEqual(["publishedAt", "1700000123"]);
    expect(tags).toContainEqual(["price", "500", "USD", "month"]);
    expect(tags).toContainEqual(["currency", "USD"]);
    expect(tags).toContainEqual(["frequency", "month"]);
  });

  it("defaults price currency to EUR when omitted", () => {
    const tags = buildNip99PublishTags({
      feedMessageType: "offer",
      hashtags: [],
      mentionPubkeys: [],
      metadata: {
        identifier: "listing-3",
        title: "Desk lamp",
        price: "30",
      },
    });

    expect(tags).toContainEqual(["price", "30", "EUR", ""]);
  });
});
