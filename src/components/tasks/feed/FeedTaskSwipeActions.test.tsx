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
});
