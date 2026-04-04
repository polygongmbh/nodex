import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useListingStatusPublish } from "./use-listing-status-publish";
import { makePerson, makeTask } from "@/test/fixtures";
import type { Task } from "@/types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

function Harness({
  publishEvent = vi.fn(async () => ({ success: true })),
}: {
  publishEvent?: ReturnType<typeof vi.fn>;
}) {
  const currentUser = makePerson({ id: "a".repeat(64), name: "Alice", displayName: "Alice" });
  const [localTasks, setLocalTasks] = useState<Task[]>([
    makeTask({
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
    }),
  ]);

  const { handleListingStatusChange } = useListingStatusPublish({
    allTasks: localTasks,
    currentUser,
    guardInteraction: vi.fn(() => false),
    publishEvent,
    resolveTaskOriginRelay: () => ({ relayUrls: ["wss://relay.one"] }),
    setLocalTasks,
  });

  return (
    <>
      <button onClick={() => handleListingStatusChange("b".repeat(64), "sold")}>Sold</button>
      <output data-testid="status">{localTasks[0]?.nip99?.status || ""}</output>
      <output data-testid="publish-count">{String(publishEvent.mock.calls.length)}</output>
    </>
  );
}

describe("useListingStatusPublish", () => {
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
