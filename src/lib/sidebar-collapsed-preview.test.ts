import { describe, expect, it } from "vitest";
import { buildCollapsedPreviewItems, getCollapsedPreviewMaxItems } from "./sidebar-collapsed-preview";

describe("buildCollapsedPreviewItems", () => {
  it("prioritizes selected items before pinned and other items", () => {
    const items = [
      { id: "a", selected: false, pinned: false },
      { id: "b", selected: true, pinned: false },
      { id: "c", selected: false, pinned: true },
      { id: "d", selected: false, pinned: false },
      { id: "e", selected: false, pinned: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      maxItems: 3,
    });

    expect(result.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps all pinned items visible when configured to do so", () => {
    const items = [
      { id: "a", selected: false, pinned: true },
      { id: "b", selected: false, pinned: true },
      { id: "c", selected: true, pinned: false },
      { id: "d", selected: false, pinned: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      maxItems: 1,
      alwaysIncludePinned: true,
    });

    expect(result.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });
});

describe("getCollapsedPreviewMaxItems", () => {
  it("never returns fewer than the floor on tiny screens", () => {
    expect(getCollapsedPreviewMaxItems(0)).toBeGreaterThanOrEqual(4);
    expect(getCollapsedPreviewMaxItems(400)).toBeGreaterThanOrEqual(4);
    expect(getCollapsedPreviewMaxItems(600)).toBeGreaterThanOrEqual(4);
  });

  it("grows monotonically with available height", () => {
    const heights = [600, 800, 1000, 1400, 2000];
    const counts = heights.map(getCollapsedPreviewMaxItems);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});

describe("buildCollapsedPreviewItems with isAlwaysIncluded", () => {
  it("ranks selected > pinned > always-included, and force-includes both past the cap", () => {
    const items = [
      { id: "selected", selected: true, pinned: false, always: false },
      { id: "pinned", selected: false, pinned: true, always: false },
      { id: "core", selected: false, pinned: false, always: true },
      { id: "other", selected: false, pinned: false, always: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      isAlwaysIncluded: (item) => item.always,
      alwaysIncludePinned: true,
      maxItems: 1,
    });

    expect(result.map((item) => item.id)).toEqual(["selected", "pinned", "core"]);
  });

  it("shows all pinned and always-included items when there is no selection", () => {
    const items = [
      { id: "pin-a", selected: false, pinned: true, always: false },
      { id: "pin-b", selected: false, pinned: true, always: false },
      { id: "core-a", selected: false, pinned: false, always: true },
      { id: "core-b", selected: false, pinned: false, always: true },
      { id: "other", selected: false, pinned: false, always: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      isAlwaysIncluded: (item) => item.always,
      alwaysIncludePinned: true,
      maxItems: 1,
    });

    expect(result.map((item) => item.id)).toEqual(["pin-a", "pin-b", "core-a", "core-b"]);
  });

  it("dedupes items that are both pinned and always-included", () => {
    const items = [
      { id: "both", selected: false, pinned: true, always: true },
      { id: "other", selected: false, pinned: false, always: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      isAlwaysIncluded: (item) => item.always,
      alwaysIncludePinned: true,
      maxItems: 0,
    });

    expect(result.map((item) => item.id)).toEqual(["both"]);
  });
});
