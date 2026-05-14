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
  it("uses coarse height buckets", () => {
    expect(getCollapsedPreviewMaxItems(600)).toBe(4);
    expect(getCollapsedPreviewMaxItems(720)).toBe(6);
    expect(getCollapsedPreviewMaxItems(840)).toBe(6);
    expect(getCollapsedPreviewMaxItems(900)).toBe(8);
    expect(getCollapsedPreviewMaxItems(1080)).toBe(8);
  });
});

describe("buildCollapsedPreviewItems with isAlwaysIncluded", () => {
  it("force-includes items past the maxItems cap, ranked after selected and before pinned", () => {
    const items = [
      { id: "selected", selected: true, pinned: false, always: false },
      { id: "core", selected: false, pinned: false, always: true },
      { id: "pinned", selected: false, pinned: true, always: false },
      { id: "other-1", selected: false, pinned: false, always: false },
      { id: "other-2", selected: false, pinned: false, always: false },
    ];

    const result = buildCollapsedPreviewItems({
      items,
      isSelected: (item) => item.selected,
      isPinned: (item) => item.pinned,
      isAlwaysIncluded: (item) => item.always,
      maxItems: 1,
    });

    expect(result.map((item) => item.id)).toEqual(["selected", "core"]);
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
