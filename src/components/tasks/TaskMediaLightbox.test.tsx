import { fireEvent, render, screen } from "@testing-library/react";
import { TaskMediaLightbox } from "./TaskMediaLightbox";
import type { TaskMediaItem } from "@/lib/task-media";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("TaskMediaLightbox keyboard navigation", () => {
  const mediaItem: TaskMediaItem = {
    key: "task-1:attachment:0",
    taskId: "task-1",
    taskTimestampMs: Date.now(),
    taskContent: "Test content",
    url: "https://example.com/image.jpg",
    kind: "image",
    source: "attachment",
  };

  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps arrow keys and vim keys to media and post navigation", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onPreviousPost = vi.fn();
    const onNextPost = vi.fn();

    render(
      <TaskMediaLightbox
        open
        mediaItem={mediaItem}
        mediaCount={4}
        mediaIndex={1}
        postMediaIndex={0}
        postMediaCount={2}
        onOpenChange={vi.fn()}
        onPrevious={onPrevious}
        onNext={onNext}
        onPreviousPost={onPreviousPost}
        onNextPost={onNextPost}
      />
    );

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "l" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "j" });

    expect(onPrevious).toHaveBeenCalledTimes(2);
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onPreviousPost).toHaveBeenCalledTimes(2);
    expect(onNextPost).toHaveBeenCalledTimes(2);
  });

  it("opens the current post on Enter", () => {
    const onOpenTask = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <TaskMediaLightbox
        open
        mediaItem={mediaItem}
        mediaCount={4}
        mediaIndex={1}
        postMediaIndex={0}
        postMediaCount={2}
        onOpenChange={onOpenChange}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onPreviousPost={vi.fn()}
        onNextPost={vi.fn()}
        onOpenTask={onOpenTask}
      />
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(onOpenTask).toHaveBeenCalledWith("task-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores keybindings while typing into an input", () => {
    const onPrevious = vi.fn();

    const { container } = render(
      <TaskMediaLightbox
        open
        mediaItem={mediaItem}
        mediaCount={4}
        mediaIndex={1}
        postMediaIndex={0}
        postMediaCount={2}
        onOpenChange={vi.fn()}
        onPrevious={onPrevious}
        onNext={vi.fn()}
        onPreviousPost={vi.fn()}
        onNextPost={vi.fn()}
      />
    );

    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });

    expect(onPrevious).not.toHaveBeenCalled();
  });

  it("shows a load-full-image action in reduced-data mode when preview metadata exists", () => {
    window.localStorage.setItem("nodex.reduced-data-mode.v1", "on");

    render(
      <TaskMediaLightbox
        open
        mediaItem={{
          ...mediaItem,
          previewImageUrl: "https://example.com/preview.jpg",
          blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        }}
        mediaCount={1}
        mediaIndex={0}
        postMediaIndex={0}
        postMediaCount={1}
        onOpenChange={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /load full image/i })).toBeInTheDocument();
    expect(screen.getByText(/reduced-data mode is showing a preview first/i)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/preview.jpg");
  });
});
