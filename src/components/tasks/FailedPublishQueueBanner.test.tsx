import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import { FailedPublishQueueBanner } from "./FailedPublishQueueBanner";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

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

beforeEach(() => {
  dispatchFeedInteraction.mockReset();
  dispatchFeedInteraction.mockImplementation(async () => undefined);
});

describe("FailedPublishQueueBanner", () => {
  it("shows selected space scope and hidden count by default", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
      { ...baseDraft, id: "2", content: "hidden one" },
    ];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={[drafts[0]]}
      />
    );

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
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All failed" }));

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
      />
    );

    expect(screen.getByRole("button", { name: "Dismiss all" })).toBeInTheDocument();
    view.rerender(
      <FailedPublishQueueBanner
        drafts={[]}
        selectedFeedDrafts={[]}
      />
    );
    expect(screen.queryByRole("button", { name: "Dismiss all" })).not.toBeInTheDocument();
  });

  it("renders dismiss all action and fires callback once", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", content: "selected one" },
      { ...baseDraft, id: "2", content: "hidden one" },
    ];
    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "publish.failed.dismissAll" });
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
      />
    );

    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Repost to currently selected space relays" })).toBeDisabled();

    view.rerender(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-b"]}
      />
    );

    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Repost to currently selected space relays" })).toBeEnabled();
  });

  it("shows retry progress state while retry is in flight", () => {
    let resolveRetry: (() => void) | undefined;
    dispatchFeedInteraction.mockImplementation((intent: { type: string }) => {
      if (intent.type !== "publish.failed.retry") return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveRetry = resolve;
      });
    });
    const drafts: FailedPublishDraft[] = [{ ...baseDraft, id: "1", relayIds: ["relay-a"] }];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-a"]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry on original relay targets" }));

    expect(screen.getByRole("button", { name: "Retry on original relay targets" })).toBeDisabled();

    resolveRetry?.();
  });
});
