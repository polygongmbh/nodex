import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskPublishFlow } from "./use-task-publish-flow";
import { makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { Person, Relay, Task } from "@/types";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(() => "toast-id"), {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyLocalSaved: vi.fn(),
  notifyNeedTag: vi.fn(),
  notifyPartialPublish: vi.fn(),
  notifyPublished: vi.fn(),
  notifyPublishSavedForRetry: vi.fn(),
}));

vi.mock("@/lib/user-preferences", () => ({
  loadPublishDelayEnabled: vi.fn(() => false),
}));

function Harness({
  publishEvent = vi.fn(async () => ({ success: true, eventId: "b".repeat(64), publishedRelayUrls: ["wss://relay.one"] })),
  initialTasks = [] as Task[],
  queryClient,
}: {
  publishEvent?: ReturnType<typeof vi.fn>;
  initialTasks?: Task[];
  queryClient: QueryClient;
}) {
  const [localTasks, setLocalTasks] = useState<Task[]>(initialTasks);
  const [postedTags, setPostedTags] = useState<string[]>([]);
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());
  const relay = makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" });
  const currentUser = makePerson({ id: "a".repeat(64), name: "Alice", displayName: "Alice" });
  const people: Person[] = [currentUser];
  const allTasks = [...localTasks];
  const hook = useTaskPublishFlow({
    allTasks,
    relays: [relay] as Relay[],
    people,
    currentUser,
    user: { pubkey: currentUser.id, npub: "npub1alice", profile: { name: "Alice" } },
    effectiveActiveRelayIds: new Set(["relay-one"]),
    demoFeedActive: false,
    demoRelayId: "demo",
    queryClient,
    t: ((key: string) => key) as unknown as TFunction,
    setLocalTasks,
    setPostedTags,
    suppressedNostrEventIds,
    setSuppressedNostrEventIds,
    bumpChannelFrecency: vi.fn(),
    guardInteraction: vi.fn(() => false),
    hasDisconnectedSelectedRelays: false,
    resolveRelayUrlsFromIds: (relayIds: string[]) => relayIds.includes("relay-one") ? ["wss://relay.one"] : [],
    publishEvent,
    publishTaskDueUpdate: vi.fn(async () => true),
    publishTaskPriorityUpdate: vi.fn(async () => true),
    publishTaskCreateFollowUps: vi.fn(async () => undefined),
  });

  return (
    <>
      <button
        onClick={async () => {
          const result = await hook.handleNewTask("New task #general", ["general"], ["relay-one"], "task");
          window.__TEST_RESULT__ = result;
        }}
      >
        Submit
      </button>
      <button onClick={() => hook.handleRetryFailedPublish(hook.failedPublishDrafts[0]?.id || "")}>Retry</button>
      <button onClick={() => hook.handleDueDateChange("task-1", new Date("2026-04-01T10:00:00.000Z"), "10:00", "due")}>
        Due
      </button>
      <button onClick={() => hook.handlePriorityChange("task-1", 3)}>Priority</button>
      <output data-testid="draft-count">{String(hook.failedPublishDrafts.length)}</output>
      <output data-testid="visible-draft-count">{String(hook.visibleFailedPublishDrafts.length)}</output>
      <output data-testid="suppressed-count">{String(suppressedNostrEventIds.size)}</output>
      <output data-testid="local-count">{String(localTasks.length)}</output>
      <output data-testid="first-priority">{String(localTasks[0]?.priority ?? "")}</output>
      <output data-testid="first-due-date">{localTasks[0]?.dueDate?.toISOString() || ""}</output>
      <output data-testid="posted-tags">{postedTags.join(",")}</output>
    </>
  );
}

declare global {
  interface Window {
    __TEST_RESULT__?: unknown;
  }
}

function renderHarness(props?: Parameters<typeof Harness>[0]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} queryClient={queryClient} />
    </QueryClientProvider>
  );
}

describe("useTaskPublishFlow", () => {
  beforeEach(() => {
    window.__TEST_RESULT__ = undefined;
    window.localStorage.clear();
  });

  it("queues a failed publish draft when submission is rejected", async () => {
    const publishEvent = vi.fn(async () => ({
      success: false,
      eventId: "c".repeat(64),
      rejectionReason: "blocked",
      publishedRelayUrls: [],
    }));

    renderHarness({ publishEvent });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("visible-draft-count")).toHaveTextContent("1");
    expect(screen.getByTestId("suppressed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("posted-tags")).toHaveTextContent("general");
    expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "queued" });
  });

  it("retries a failed draft and restores it into local tasks", async () => {
    const publishEvent = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        eventId: "d".repeat(64),
        rejectionReason: "blocked",
        publishedRelayUrls: [],
      })
      .mockResolvedValueOnce({
        success: true,
        eventId: "e".repeat(64),
        publishedRelayUrls: ["wss://relay.one"],
      });

    renderHarness({ publishEvent });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("0");
    });
    expect(screen.getByTestId("local-count")).toHaveTextContent("1");
  });

  it("updates due date and priority through the extracted handlers", async () => {
    const initialTask = makeTask({ id: "task-1", relays: ["relay-one"] });

    renderHarness({ initialTasks: [initialTask] });
    fireEvent.click(screen.getByRole("button", { name: "Due" }));
    fireEvent.click(screen.getByRole("button", { name: "Priority" }));

    await waitFor(() => {
      expect(screen.getByTestId("first-priority")).toHaveTextContent("3");
    });
    expect(screen.getByTestId("first-due-date")).toHaveTextContent("2026-04-01T10:00:00.000Z");
  });
});
