import { describe, expect, it } from "vitest";
import { buildComposePrefillFromFiltersAndContext } from "./compose-prefill";
import { makeChannel } from "@/test/fixtures";

describe("buildComposePrefillFromFiltersAndContext", () => {
  it("combines included filters and context tags without duplicates", () => {
    const channels = [
      makeChannel({ id: "alpha", name: "alpha", filterState: "included" }),
      makeChannel({ id: "beta", name: "beta", filterState: "neutral" }),
      makeChannel({ id: "gamma", name: "gamma", filterState: "included" }),
    ];

    expect(buildComposePrefillFromFiltersAndContext(channels, ["gamma", "delta"])).toBe(
      "#alpha #gamma #delta "
    );
  });

  it("returns empty string when no tags are available", () => {
    const channels = [makeChannel({ id: "alpha", name: "alpha", filterState: "neutral" })];
    expect(buildComposePrefillFromFiltersAndContext(channels, [])).toBe("");
  });
});
