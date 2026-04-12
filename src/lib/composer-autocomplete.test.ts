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

  it("orders channel suggestions like the desktop composer", () => {
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
});
