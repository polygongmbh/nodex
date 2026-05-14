import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/config";
import { FeedTaskSwipeActions } from "./FeedTaskSwipeActions";
import { makeTask } from "@/test/fixtures";

function renderSwipe(overrides: Partial<Parameters<typeof FeedTaskSwipeActions>[0]> = {}) {
  const props: Parameters<typeof FeedTaskSwipeActions>[0] = {
    task: makeTask({
      author: { pubkey: "owner-pub", name: "owner", displayName: "Owner", avatar: "" },
      timestamp: new Date(),
    }),
    currentUserPubkey: "owner-pub",
    hasChildren: false,
    onReact: vi.fn(),
    onCopyPermalink: vi.fn(),
    onRecompose: vi.fn(),
    onDelete: vi.fn(),
    children: <div data-testid="card-surface">card</div>,
    ...overrides,
  };
  return {
    props,
    ...render(
      <I18nextProvider i18n={i18n}>
        <FeedTaskSwipeActions {...props} />
      </I18nextProvider>
    ),
  };
}

function swipeLeft(content: HTMLElement, distance: number) {
  fireEvent.pointerDown(content, { pointerType: "touch", clientX: 300, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(content, { pointerType: "touch", clientX: 295, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(content, { pointerType: "touch", clientX: 300 - distance, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(content, { pointerType: "touch", clientX: 300 - distance, clientY: 100, pointerId: 1 });
}

describe("FeedTaskSwipeActions", () => {
  it("renders owner actions when the gate allows mutations", () => {
    const { props } = renderSwipe();
    expect(screen.getByTestId(`feed-task-swipe-copy-${props.task.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`feed-task-swipe-react-${props.task.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`feed-task-swipe-recompose-${props.task.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`feed-task-swipe-delete-${props.task.id}`)).toBeInTheDocument();
  });

  it("omits destructive actions for non-owners", () => {
    const { props } = renderSwipe({ currentUserPubkey: "viewer" });
    expect(screen.getByTestId(`feed-task-swipe-copy-${props.task.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`feed-task-swipe-delete-${props.task.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`feed-task-swipe-recompose-${props.task.id}`)).not.toBeInTheDocument();
  });

  it("fires the corresponding callback when an action is tapped", () => {
    const onCopyPermalink = vi.fn();
    const { props } = renderSwipe({ onCopyPermalink });
    fireEvent.click(screen.getByTestId(`feed-task-swipe-copy-${props.task.id}`));
    expect(onCopyPermalink).toHaveBeenCalledTimes(1);
  });

  it("opens after a horizontal swipe past the threshold", () => {
    const { props } = renderSwipe();
    const content = screen.getByTestId(`feed-task-swipe-content-${props.task.id}`);
    // 4 actions × 64 px = 256 px total width when open.
    swipeLeft(content, 200);
    expect(content.style.transform).toBe("translate3d(-256px, 0, 0)");
  });

  it("collapses an already-open row when a new horizontal drag activates on another row", () => {
    const taskA = makeTask({
      id: "task-a",
      author: { pubkey: "owner-pub", name: "owner", displayName: "Owner", avatar: "" },
      timestamp: new Date(),
    });
    const taskB = makeTask({
      id: "task-b",
      author: { pubkey: "owner-pub", name: "owner", displayName: "Owner", avatar: "" },
      timestamp: new Date(),
    });
    const baseProps = {
      currentUserPubkey: "owner-pub",
      hasChildren: false,
      onReact: vi.fn(),
      onCopyPermalink: vi.fn(),
      onRecompose: vi.fn(),
      onDelete: vi.fn(),
    };
    render(
      <I18nextProvider i18n={i18n}>
        <FeedTaskSwipeActions task={taskA} {...baseProps}>
          <div>card A</div>
        </FeedTaskSwipeActions>
        <FeedTaskSwipeActions task={taskB} {...baseProps}>
          <div>card B</div>
        </FeedTaskSwipeActions>
      </I18nextProvider>
    );

    const contentA = screen.getByTestId(`feed-task-swipe-content-${taskA.id}`);
    const contentB = screen.getByTestId(`feed-task-swipe-content-${taskB.id}`);

    swipeLeft(contentA, 200);
    expect(contentA.style.transform).toBe("translate3d(-256px, 0, 0)");

    // Begin a horizontal drag on B (past activation threshold, but not yet released).
    fireEvent.pointerDown(contentB, { pointerType: "touch", clientX: 300, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(contentB, { pointerType: "touch", clientX: 290, clientY: 100, pointerId: 2 });

    // A must already be closing; its DOM transform should reflect the settled-closed value.
    expect(contentA.style.transform).toBe("translate3d(0px, 0, 0)");
  });
});
