import { describe, expect, it, vi } from "vitest";
import { shouldAutoOpenStatusMenuOnFocus } from "./status-menu-focus";

describe("shouldAutoOpenStatusMenuOnFocus", () => {
  it("returns true when focus is keyboard-visible", () => {
    const button = document.createElement("button");
    const matches = vi.fn((selector: string) => selector === ":focus-visible");
    button.matches = matches as unknown as typeof button.matches;

    expect(shouldAutoOpenStatusMenuOnFocus(button)).toBe(true);
    expect(matches).toHaveBeenCalledWith(":focus-visible");
  });

  it("returns false when focus is not keyboard-visible", () => {
    const button = document.createElement("button");
    const matches = vi.fn(() => false);
    button.matches = matches as unknown as typeof button.matches;

    expect(shouldAutoOpenStatusMenuOnFocus(button)).toBe(false);
    expect(matches).toHaveBeenCalledWith(":focus-visible");
  });
});
