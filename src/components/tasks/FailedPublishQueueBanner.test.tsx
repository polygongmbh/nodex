import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FailedPublishDraft } from "@/lib/failed-publish-drafts";
import { FailedPublishQueueBanner } from "./FailedPublishQueueBanner";

const baseDraft: FailedPublishDraft = {
  id: "draft-1",
  author: {
    id: "author-1",
    name: "Author",
    displayName: "Author",
    isOnline: true,
    isSelected: false,
  },
  content: "failed content",
  tags: ["tag"],
  relayIds: ["relay-a"],
  relayUrls: ["wss://relay.a"],
  taskType: "task",
  createdAt: new Date().toISOString(),
  mentionPubkeys: [],
  publishKind: 1,
  publishTags: [],
};

describe("FailedPublishQueueBanner", () => {
  it("shows selected feed scope and hidden count by default", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
      { ...baseDraft, id: "2", content: "hidden one" },
    ];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={[drafts[0]]}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("1 post failed to publish")).toBeInTheDocument();
    expect(screen.getByText("1 hidden")).toBeInTheDocument();
    expect(screen.getByText("selected one")).toBeInTheDocument();
    expect(screen.queryByText("hidden one")).not.toBeInTheDocument();
  });

  it("switches to all failed scope", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
      { ...baseDraft, id: "2", content: "hidden one" },
    ];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={[drafts[0]]}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All failed" }));

    expect(screen.getByText("2 post failed to publish")).toBeInTheDocument();
    expect(screen.getByText("hidden one")).toBeInTheDocument();
  });

  it("does not crash when rerendering from non-empty to empty drafts", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
    ];

    const view = render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("1 post failed to publish")).toBeInTheDocument();
    view.rerender(
      <FailedPublishQueueBanner
        drafts={[]}
        selectedFeedDrafts={[]}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.queryByText("1 post failed to publish")).not.toBeInTheDocument();
  });

  it("renders dismiss all action and fires callback once", () => {
    const onDismissAll = vi.fn();
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
      { ...baseDraft, id: "2", content: "hidden one" },
    ];
    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
        onDismissAll={onDismissAll}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it("enables retry only with selected original relays and repost only with selected non-original relays", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", relayIds: ["relay-a"], relayUrls: ["wss://relay.a"] },
    ];

    const view = render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-a"]}
        onRetry={vi.fn()}
        onRepost={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Repost to currently selected feed relays" })).toBeDisabled();

    view.rerender(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-b"]}
        onRetry={vi.fn()}
        onRepost={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repost to currently selected feed relays" })).toBeEnabled();
  });

  it("shows retry progress state while retry is in flight", () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(() => new Promise<void>((resolve) => {
      resolveRetry = resolve;
    }));
    const drafts: FailedPublishDraft[] = [{ ...baseDraft, id: "1", relayIds: ["relay-a"] }];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-a"]}
        onRetry={onRetry}
        onRepost={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry on original relay targets" }));

    expect(screen.getByText("Retrying...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeDisabled();

    resolveRetry?.();
  });
});
