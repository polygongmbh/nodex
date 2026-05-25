import { describe, expect, it } from "vitest";
import { filterChannelsForAutocomplete, getComposerAutocompleteMatch, hasMentionQueryAtCursor } from "./composer-autocomplete";
import type { Channel } from "@/types";

const channels: Channel[] = [
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "backlog", name: "backlog", filterState: "neutral" },
  { id: "frontend", name: "frontend", filterState: "neutral" },
  { id: "ba", name: "ba", filterState: "neutral" },
];

describe("composer autocomplete helpers", () => {
  it("prefers hashtag matches over mention matches at the cursor", () => {
    expect(getComposerAutocompleteMatch("Ship #ba")).toEqual({ kind: "hashtag", query: "ba" });
    expect(getComposerAutocompleteMatch("Ping @al")).toEqual({ kind: "mention", query: "al" });
    expect(getComposerAutocompleteMatch("Ship(#ba")).toBeNull();
    expect(getComposerAutocompleteMatch("Ping(@al")).toBeNull();
    expect(getComposerAutocompleteMatch("Ship update")).toBeNull();
  });

  it("detects active mention queries at the cursor", () => {
    expect(hasMentionQueryAtCursor("Ping @al")).toBe(true);
    expect(hasMentionQueryAtCursor("Ping @alice ")).toBe(false);
  });

  it("puts exact match first, then falls back to prefix and alphabetical when there is no frecency signal", () => {
    expect(filterChannelsForAutocomplete(channels, "ba").map((channel) => channel.name)).toEqual([
      "ba",
      "backend",
      "backlog",
    ]);
  });

  it("supports result limits for constrained surfaces", () => {
    expect(filterChannelsForAutocomplete(channels, "b", 2).map((channel) => channel.name)).toEqual([
      "ba",
      "backend",
    ]);
  });

  it("lets a frecent substring match beat a prefix match without frecency", () => {
    const mixed: Channel[] = [
      { id: "platform", name: "platform", filterState: "neutral" },
      { id: "myproject", name: "myproject", filterState: "neutral", personalScore: 5 },
    ];
    expect(filterChannelsForAutocomplete(mixed, "p").map((channel) => channel.name)).toEqual([
      "myproject",
      "platform",
    ]);
  });

  it("still honors exact match over a frecent substring match", () => {
    const mixed: Channel[] = [
      { id: "p", name: "p", filterState: "neutral" },
      { id: "myproject", name: "myproject", filterState: "neutral", personalScore: 99 },
    ];
    expect(filterChannelsForAutocomplete(mixed, "p").map((channel) => channel.name)).toEqual([
      "p",
      "myproject",
    ]);
  });

  it("prefers more frecently used channels among same-relevance suggestions", () => {
    const personalized: Channel[] = [
      { id: "backend", name: "backend", filterState: "neutral" },
      { id: "backlog", name: "backlog", filterState: "neutral", personalScore: 5 },
    ];
    expect(filterChannelsForAutocomplete(personalized, "ba").map((channel) => channel.name)).toEqual([
      "backlog",
      "backend",
    ]);
  });

  it("breaks frecency ties with usage count before falling back to alpha", () => {
    const withUsage: Channel[] = [
      { id: "backend", name: "backend", filterState: "neutral", usageCount: 2 },
      { id: "backlog", name: "backlog", filterState: "neutral", usageCount: 10 },
    ];
    expect(filterChannelsForAutocomplete(withUsage, "ba").map((channel) => channel.name)).toEqual([
      "backlog",
      "backend",
    ]);
  });

  it("ranks personal frecency above raw popularity", () => {
    const mixed: Channel[] = [
      { id: "backend", name: "backend", filterState: "neutral", usageCount: 100 },
      { id: "backlog", name: "backlog", filterState: "neutral", personalScore: 1 },
    ];
    expect(filterChannelsForAutocomplete(mixed, "ba").map((channel) => channel.name)).toEqual([
      "backlog",
      "backend",
    ]);
  });

  it("orders empty-query suggestions purely by frecency then usage", () => {
    const mixed: Channel[] = [
      { id: "a", name: "a", filterState: "neutral", usageCount: 1 },
      { id: "b", name: "b", filterState: "neutral", usageCount: 50 },
      { id: "c", name: "c", filterState: "neutral", personalScore: 1 },
    ];
    expect(filterChannelsForAutocomplete(mixed, "").map((channel) => channel.name)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});
