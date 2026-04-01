import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

function Harness(props: Parameters<typeof useKeyboardShortcuts>[0]) {
  useKeyboardShortcuts(props);
  return <div>keyboard-shortcuts</div>;
}

describe("useKeyboardShortcuts", () => {
  it("routes view and toggle shortcuts when focus is not in an editor", () => {
    const onViewChange = vi.fn();
    const onToggleChannelMatchMode = vi.fn();
    const onToggleRecentFilter = vi.fn();
    const onTogglePriorityFilter = vi.fn();
    const onToggleCompactView = vi.fn();

    render(
      <Harness
        onViewChange={onViewChange}
        onToggleChannelMatchMode={onToggleChannelMatchMode}
        onToggleRecentFilter={onToggleRecentFilter}
        onTogglePriorityFilter={onTogglePriorityFilter}
        onToggleCompactView={onToggleCompactView}
      />
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));

    expect(onViewChange).toHaveBeenCalledWith("tree");
    expect(onToggleChannelMatchMode).toHaveBeenCalledTimes(1);
    expect(onToggleRecentFilter).toHaveBeenCalledTimes(1);
    expect(onTogglePriorityFilter).toHaveBeenCalledTimes(1);
    expect(onToggleCompactView).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while typing in inputs", () => {
    const onViewChange = vi.fn();
    const onToggleCompactView = vi.fn();

    render(
      <>
        <input aria-label="search" />
        <Harness onViewChange={onViewChange} onToggleCompactView={onToggleCompactView} />
      </>
    );

    const input = document.querySelector("input");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    expect(onViewChange).not.toHaveBeenCalled();
    expect(onToggleCompactView).not.toHaveBeenCalled();
  });
});
