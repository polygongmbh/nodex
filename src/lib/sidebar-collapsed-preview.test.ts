import { describe, expect, it } from "vitest";
import { buildCollapsedPreviewItems } from "./sidebar-collapsed-preview";

describe("buildCollapsedPreviewItems", () => {
  it("keeps all selected items and appends only a few unselected items", () => {
    const items = [
      { id: "a", selected: false },
      { id: "b", selected: true },
      { id: "c", selected: false },
      { id: "d", selected: true },
      { id: "e", selected: false },
    ];

    const result = buildCollapsedPreviewItems(items, (item) => item.selected, 2);

    expect(result.map((item) => item.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("returns selected items even when there are more than preview limit", () => {
    const items = [
      { id: "a", selected: true },
      { id: "b", selected: true },
      { id: "c", selected: true },
      { id: "d", selected: false },
    ];

    const result = buildCollapsedPreviewItems(items, (item) => item.selected, 1);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});
