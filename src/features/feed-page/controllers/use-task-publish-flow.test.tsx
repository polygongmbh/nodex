import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskPublishFlow } from "./use-task-publish-flow";
import { makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { PostedTag, Relay, Task } from "@/types";
import type { Person } from "@/types/person";

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
  notifyStatusRestricted: vi.fn(),
}));

vi.mock("@/lib/user-preferences", () => ({
  loadPublishDelayEnabled: vi.fn(() => false),
}));

function Harness({
  publishEvent = vi.fn(async () => ({ success: true, eventId: "b".repeat(64), publishedRelayUrls: ["wss://relay.one"] })),
  initialTasks = [] as Task[],
  currentUser = makePerson({ id: "a".repeat(64), name: "Alice", displayName: "Alice" }),
  people = [] as Person[],
  dispatchFrecencyIntent = vi.fn(),
  publishTaskDueUpdate = vi.fn(async () => true),
  publishTaskPriorityUpdate = vi.fn(async () => true),
  forceLocalMode = false,
  relays = [makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" })] as Relay[],
  hasDisconnectedSelectedRelays = false,
  queryClient = new QueryClient(),
}: {
  publishEvent?: ReturnType<typeof vi.fn>;
  initialTasks?: Task[];
  currentUser?: Person;
  people?: Person[];
  dispatchFrecencyIntent?: ReturnType<typeof vi.fn>;
  publishTaskDueUpdate?: ReturnType<typeof vi.fn>;
  publishTaskPriorityUpdate?: ReturnType<typeof vi.fn>;
  forceLocalMode?: boolean;
  relays?: Relay[];
  hasDisconnectedSelectedRelays?: boolean;
  queryClient?: QueryClient;
}) {
  const [localTasks, setLocalTasks] = useState<Task[]>(initialTasks);
  const [postedTags, setPostedTags] = useState<PostedTag[]>([]);
  const [suppressedNostrEventIds, setSuppressedNostrEventIds] = useState<Set<string>>(new Set());
  const availablePeople = people.length > 0 ? people : [currentUser];
  const allTasks = [...localTasks];
  const hook = useTaskPublishFlow({
    allTasks,
    relays,
    people: availablePeople,
    currentUser,
    user: { pubkey: currentUser.id, npub: "npub1alice", profile: { name: "Alice" } },
    canCreateContent: true,
    effectiveActiveRelayIds: forceLocalMode ? new Set() : new Set(relays.map((relay) => relay.id)),
    demoFeedActive: forceLocalMode,
    demoRelayId: "demo",
    queryClient,
    t: ((key: string) => key) as unknown as TFunction,
    setLocalTasks,
    setPostedTags,
    suppressedNostrEventIds,
    setSuppressedNostrEventIds,
    dispatchFrecencyIntent,
    guardInteraction: vi.fn(() => false),
    hasDisconnectedSelectedRelays,
    resolveRelayUrlsFromIds: (relayIds: string[]) =>
      forceLocalMode
        ? []
        : relays
          .filter((relay) => relayIds.includes(relay.id))
          .map((relay) => relay.url)
          .filter((url): url is string => Boolean(url)),
    publishEvent,
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
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
      <button
        onClick={async () => {
          const result = await hook.handleNewTask("Need support #general", ["general"], [], "offer");
          window.__TEST_RESULT__ = result;
        }}
      >
        SubmitRootOfferNoRelay
      </button>
      <button
        onClick={async () => {
          const result = await hook.handleNewTask(
            "Need support #general",
            ["general"],
            ["relay-one", "relay-two"],
            "offer"
          );
          window.__TEST_RESULT__ = result;
        }}
      >
        SubmitRootOfferMixedRelays
      </button>
      <button
        onClick={async () => {
          const result = await hook.handleNewTask(
            "Need support",
            [],
            ["relay-one"],
            "offer",
            new Date("2026-04-01T10:00:00.000Z"),
            "10:00",
            "start",
            "a".repeat(64)
          );
          window.__TEST_RESULT__ = result;
        }}
      >
        SubmitChildOfferWithDate
      </button>
      <button
        onClick={async () => {
          const result = await hook.handleNewTask(
            "Need support #general",
            ["general"],
            ["relay-one"],
            "offer",
            new Date("2026-04-01T10:00:00.000Z"),
            "10:00",
            "start"
          );
          window.__TEST_RESULT__ = result;
        }}
      >
        SubmitRootOfferWithDate
      </button>
      <button onClick={() => hook.handleRetryFailedPublish(hook.failedPublishDrafts[0]?.id || "")}>Retry</button>
      <button onClick={() => hook.handleDueDateChange("task-1", new Date("2026-04-01T10:00:00.000Z"), "10:00", "due")}>
        Due
      </button>
      <button onClick={() => hook.handlePriorityChange("task-1", 60)}>Priority</button>
      <output data-testid="draft-count">{String(hook.failedPublishDrafts.length)}</output>
      <output data-testid="visible-draft-count">{String(hook.visibleFailedPublishDrafts.length)}</output>
      <output data-testid="suppressed-count">{String(suppressedNostrEventIds.size)}</output>
      <output data-testid="local-count">{String(localTasks.length)}</output>
      <output data-testid="first-priority">{String(localTasks[0]?.priority ?? "")}</output>
      <output data-testid="first-due-date">{localTasks[0]?.dueDate?.toISOString() || ""}</output>
      <output data-testid="first-assignees">{(localTasks[0]?.assigneePubkeys || []).join(",")}</output>
      <output data-testid="posted-tags">{postedTags.map((tag) => `${tag.name}:${tag.relayIds.join("|")}`).join(",")}</output>
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
    expect(screen.getByTestId("posted-tags")).toHaveTextContent("general:relay-one");
    expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "queued" });
  });

  it("dispatches channel frecency intents for submitted tags", async () => {
    const dispatchFrecencyIntent = vi.fn();

    renderHarness({ dispatchFrecencyIntent });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(dispatchFrecencyIntent).toHaveBeenCalledWith({
        type: "channel.bump",
        tag: "general",
        weight: 1.1,
      });
    });
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
      expect(screen.getByTestId("first-priority")).toHaveTextContent("60");
    });
    expect(screen.getByTestId("first-due-date")).toHaveTextContent("2026-04-01T10:00:00.000Z");
  });

  it("blocks due date and priority changes for unrelated users on assigned tasks", async () => {
    const publishTaskDueUpdate = vi.fn(async () => true);
    const publishTaskPriorityUpdate = vi.fn(async () => true);
    const currentUser = makePerson({ id: "viewer-pubkey", name: "viewer", displayName: "Viewer" });
    const initialTask = makeTask({
      id: "task-1",
      relays: ["relay-one"],
      author: makePerson({ id: "creator-pubkey", name: "creator", displayName: "Creator" }),
      assigneePubkeys: ["assignee-pubkey"],
    });

    renderHarness({
      initialTasks: [initialTask],
      currentUser,
      people: [currentUser, initialTask.author],
      publishTaskDueUpdate,
      publishTaskPriorityUpdate,
    });
    fireEvent.click(screen.getByRole("button", { name: "Due" }));
    fireEvent.click(screen.getByRole("button", { name: "Priority" }));

    expect(screen.getByTestId("first-priority")).toBeEmptyDOMElement();
    expect(screen.getByTestId("first-due-date")).toBeEmptyDOMElement();
    expect(publishTaskDueUpdate).not.toHaveBeenCalled();
    expect(publishTaskPriorityUpdate).not.toHaveBeenCalled();
  });

  it("does not assign the creator when publishing an untagged task locally", async () => {
    renderHarness({ forceLocalMode: true });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByTestId("local-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("first-assignees")).toBeEmptyDOMElement();
  });

  it("defaults root offer submissions to the only active relay when none is explicitly selected", async () => {
    const publishEvent = vi.fn(async () => ({
      success: true,
      eventId: "e".repeat(64),
      publishedRelayUrls: ["wss://relay.one"],
    }));
    renderHarness({ publishEvent });
    fireEvent.click(screen.getByRole("button", { name: "SubmitRootOfferNoRelay" }));

    await waitFor(() => {
      expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "published" });
    });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    const [, , , , relayUrls] = publishEvent.mock.calls[0] as unknown as [
      number,
      string,
      string[][] | undefined,
      string | undefined,
      string[] | undefined
    ];
    expect(relayUrls).toEqual(["wss://relay.one"]);
  });

  it("publishes root offers when at least one selected relay remains writable", async () => {
    const publishEvent = vi.fn(async () => ({
      success: true,
      eventId: "f".repeat(64),
      publishedRelayUrls: ["wss://relay.one"],
    }));

    renderHarness({
      publishEvent,
      hasDisconnectedSelectedRelays: true,
      relays: [
        makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" }),
        makeRelay({ id: "relay-two", url: "wss://relay.two", connectionStatus: "disconnected" }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "SubmitRootOfferMixedRelays" }));

    await waitFor(() => {
      expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "published" });
    });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    const [, , , , relayUrls] = publishEvent.mock.calls[0] as unknown as [
      number,
      string,
      string[][] | undefined,
      string | undefined,
      string[] | undefined
    ];
    expect(relayUrls).toEqual(["wss://relay.one"]);
  });

  it("inherits parent tags and parent relay for child offer submissions", async () => {
    const publishEvent = vi.fn(async () => ({
      success: true,
      eventId: "f".repeat(64),
      publishedRelayUrls: ["wss://relay.one"],
    }));
    const parentTask = makeTask({
      id: "a".repeat(64),
      tags: ["backend"],
      relays: ["relay-one"],
    });

    renderHarness({ publishEvent, initialTasks: [parentTask] });
    fireEvent.click(screen.getByRole("button", { name: "SubmitChildOfferWithDate" }));

    await waitFor(() => {
      expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "published" });
    });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    const [, , publishTags, publishParentId, relayUrls] = publishEvent.mock.calls[0] as unknown as [
      number,
      string,
      string[][] | undefined,
      string | undefined,
      string[] | undefined
    ];
    expect(publishTags).toEqual(expect.arrayContaining([["t", "backend"]]));
    expect(publishParentId).toBe(parentTask.id);
    expect(relayUrls).toEqual(["wss://relay.one"]);
    expect(screen.getByTestId("first-due-date")).toBeEmptyDOMElement();
  });

  it("drops offer date fields when storing local-only submissions", async () => {
    renderHarness({ forceLocalMode: true });
    fireEvent.click(screen.getByRole("button", { name: "SubmitRootOfferWithDate" }));

    await waitFor(() => {
      expect(window.__TEST_RESULT__).toEqual({ ok: true, mode: "local" });
    });
    expect(screen.getByTestId("first-due-date")).toBeEmptyDOMElement();
  });
});
