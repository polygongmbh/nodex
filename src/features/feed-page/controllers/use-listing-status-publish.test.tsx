import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useListingStatusPublish } from "./use-listing-status-publish";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { makePerson, makeTask } from "@/test/fixtures";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const currentUser = makePerson({ id: "a".repeat(64), name: "Alice", displayName: "Alice" });
const listingTask = makeTask({
  id: "b".repeat(64),
  author: currentUser,
  taskType: "comment",
  feedMessageType: "offer",
  content: "Listing body",
  tags: ["market"],
  relays: ["relay-one"],
  nip99: {
    identifier: "listing-1",
    title: "Listing 1",
    status: "active",
  },
});

function Harness({
  publishEvent = vi.fn(async () => ({ success: true })),
}: {
  publishEvent?: ReturnType<typeof vi.fn>;
}) {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const allTasks = localTasks.length > 0 ? localTasks : [listingTask];

  const { handleListingStatusChange } = useListingStatusPublish({
    allTasks,
    currentUser,
    guardInteraction: vi.fn(() => false),
    publishEvent,
    resolveTaskOriginRelay: () => ({ relayUrls: ["wss://relay.one"] }),
  });

  return (
    <>
      <button onClick={() => handleListingStatusChange("b".repeat(64), "sold")}>Sold</button>
      <output data-testid="status">{allTasks[0]?.nip99?.status || ""}</output>
      <output data-testid="publish-count">{String(publishEvent.mock.calls.length)}</output>
    </>
  );
}

describe("useListingStatusPublish", () => {
  beforeEach(() => {
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("optimistically updates listing status and publishes the listing event", async () => {
    const publishEvent = vi.fn(async () => ({ success: true }));
    render(<Harness publishEvent={publishEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "Sold" }));

    expect(screen.getByTestId("status")).toHaveTextContent("sold");
    await waitFor(() => {
      expect(screen.getByTestId("publish-count")).toHaveTextContent("1");
    });
  });

  it("reverts the optimistic status when publishing fails", async () => {
    const publishEvent = vi.fn(async () => ({ success: false }));
    render(<Harness publishEvent={publishEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "Sold" }));

    expect(screen.getByTestId("status")).toHaveTextContent("sold");
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("active");
    });
  });
});
