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
    expect(getCollapsedPreviewMaxItems(720)).toBe(3);
    expect(getCollapsedPreviewMaxItems(840)).toBe(5);
    expect(getCollapsedPreviewMaxItems(1080)).toBe(7);
  });
});
