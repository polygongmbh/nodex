import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";

describe("parseChangelog", () => {
  it("parses releases, summaries, sections, and bullets", () => {
    const parsed = parseChangelog(`
# Changelog

## [Unreleased]
- Pending change

## [1.2.3] - 2026-02-25
Release summary line.
### Added
- First
- Second
### Fixed
- Third
`);

    expect(parsed[0]).toEqual({
      version: "Unreleased",
      date: undefined,
      summary: undefined,
      sections: [{ items: ["Pending change"] }],
    });
    expect(parsed[1]).toEqual({
      version: "1.2.3",
      date: "2026-02-25",
      summary: "Release summary line.",
      sections: [
        { title: "Added", items: ["First", "Second"] },
        { title: "Fixed", items: ["Third"] },
      ],
    });
  });
});
