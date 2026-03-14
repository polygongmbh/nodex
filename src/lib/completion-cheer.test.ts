import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerTaskCompletionCheer } from "./completion-cheer";

describe("triggerTaskCompletionCheer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  it("adds the completion class and removes it after the animation window", () => {
    const element = document.createElement("div");
    element.dataset.taskId = "task-1";
    document.body.appendChild(element);

    const matchMedia = vi.fn().mockReturnValue({ matches: false });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    triggerTaskCompletionCheer("task-1", new Map());
    vi.runAllTimers();

    expect(matchMedia).toHaveBeenCalled();
    expect(element.classList.contains("motion-completion-cheer")).toBe(false);
  });
});
