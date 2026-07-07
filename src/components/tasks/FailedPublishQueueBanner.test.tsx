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
  content: "failed content",
  tags: ["tag"],
  relayIds: ["relay-a"],
  relayUrls: ["wss://relay.a"],
  postType: "task",
  dates: [],
  mentionPubkeys: [],
  attachments: [],
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

    expect(screen.getByRole("button", { name: "Discard all" })).toBeInTheDocument();
    view.rerender(
      <FailedPublishQueueBanner
        drafts={[]}
        selectedFeedDrafts={[]}
      />
    );
    expect(screen.queryByRole("button", { name: "Discard all" })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Discard all" }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "publish.failed.discardAll" });
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

    expect(screen.getByTestId("failed-publish-retry")).toBeEnabled();
    expect(screen.getByTestId("failed-publish-repost")).toBeDisabled();

    view.rerender(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-b"]}
      />
    );

    expect(screen.getByTestId("failed-publish-retry")).toBeDisabled();
    expect(screen.getByTestId("failed-publish-repost")).toBeEnabled();
  });

  it("dispatches edit for a draft regardless of relay selection", () => {
    const drafts: FailedPublishDraft[] = [
      { ...baseDraft, id: "1", relayIds: ["relay-a"], relayUrls: ["wss://relay.a"] },
    ];

    render(
      <FailedPublishQueueBanner
        drafts={drafts}
        selectedFeedDrafts={drafts}
        selectedRelayIds={["relay-b"]}
      />
    );

    expect(screen.getByTestId("failed-publish-edit")).toBeEnabled();
    fireEvent.click(screen.getByTestId("failed-publish-edit"));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "publish.failed.edit", draftId: "1" });
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

    fireEvent.click(screen.getByTestId("failed-publish-retry"));

    expect(screen.getByTestId("failed-publish-retry")).toBeDisabled();

    resolveRetry?.();
  });
});
