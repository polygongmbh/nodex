import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskPublishFlow } from "./use-task-publish-flow";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useFailedPublishDraftsStore } from "@/features/feed-page/stores/failed-publish-drafts-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { Relay, Post, TaskCreatePayload, TaskCreateResult } from "@/types";
import { getTaskAssigneePubkeys, getTaskPriority, getTaskPrimaryDate } from "@/types";
import type { Person } from "@/types/person";

type PublishEventCall = [
  kind: number,
  content: string,
  tags: string[][],
  parentId: string | undefined,
  relayUrls: string[] | undefined,
];

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(() => "toast-id"), {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyNeedTag: vi.fn(),
  notifyPartialPublish: vi.fn(),
  notifyPostDeleted: vi.fn(),
  notifyPostDeleteFailed: vi.fn(),
  notifyPublished: vi.fn(),
  notifyPublishSavedForRetry: vi.fn(),
  notifyStatusRestricted: vi.fn(),
  notifyRelaySelectionError: vi.fn(),
  notifyPendingPublish: vi.fn(() => "pending-toast-id"),
  notifyPublishUndone: vi.fn(),
  notifyRetryRelayMissing: vi.fn(),
  notifyRetryRejectedByRelay: vi.fn(),
  notifyTaskCreationFailed: vi.fn(),
  notifyRecomposeRelaysUnavailable: vi.fn(),
}));

vi.mock("@/lib/user-preferences", () => ({
  loadPublishDelayEnabled: vi.fn(() => false),
}));

type HarnessProps = {
  publishEvent?: ReturnType<typeof vi.fn>;
  signEvent?: ReturnType<typeof vi.fn>;
  broadcastSignedEvent?: ReturnType<typeof vi.fn>;
  initialTasks?: Post[];
  currentUser?: Person;
  people?: Person[];
  dispatchFrecencyIntent?: ReturnType<typeof vi.fn>;
  publishTaskDueUpdate?: ReturnType<typeof vi.fn>;
  publishTaskPriorityUpdate?: ReturnType<typeof vi.fn>;
  forceLocalMode?: boolean;
  relays?: Relay[];
  hasDisconnectedSelectedRelays?: boolean;
};

type Hook = ReturnType<typeof useTaskPublishFlow>;
const hookRef: { current: Hook | null } = { current: null };

function Harness({
  publishEvent = vi.fn(async () => ({ success: true, eventId: "b".repeat(64), publishedRelayUrls: ["wss://relay.one"] })),
  signEvent,
  broadcastSignedEvent,
  initialTasks = [] as Post[],
  currentUser = makePerson({ pubkey: "a".repeat(64), name: "Alice", displayName: "Alice" }),
  people = [] as Person[],
  dispatchFrecencyIntent = vi.fn(),
  publishTaskDueUpdate = vi.fn(async () => true),
  publishTaskPriorityUpdate = vi.fn(async () => true),
  forceLocalMode = false,
  relays = [makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" })] as Relay[],
  hasDisconnectedSelectedRelays = false,
}: HarnessProps) {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const availablePeople = people.length > 0 ? people : [currentUser];
  const allTasks = localTasks.length > 0 ? localTasks : initialTasks;
  hookRef.current = useTaskPublishFlow({
    allTasks,
    relays,
    people: availablePeople,
    currentUser,
    user: { pubkey: currentUser.pubkey, npub: "npub1alice", profile: { name: "Alice" } },
    canCreateContent: true,
    effectiveActiveRelayIds: forceLocalMode ? new Set() : new Set(relays.map((relay) => relay.id)),
    demoFeedActive: forceLocalMode,
    demoRelayId: "demo",
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
    signEvent: signEvent ?? vi.fn(async () => ({ id: "deadbeef".repeat(8) })),
    broadcastSignedEvent:
      broadcastSignedEvent ??
      vi.fn(async (event: { id: string }) => ({
        success: true,
        eventId: event.id,
        publishedRelayUrls: ["wss://relay.one"],
      })),
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
    publishTaskCreateFollowUps: vi.fn(async () => undefined),
  });
  return null;
}

function renderHarness(props: HarnessProps = {}) {
  if (props.initialTasks?.length) {
    useTaskMutationStore.setState({ localTasks: props.initialTasks });
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness {...props} />
    </QueryClientProvider>
  );
}

const basePayload: TaskCreatePayload = {
  content: "",
  tags: [],
  relays: ["relay-one"],
  postType: "task",
  dates: [],
  attachments: [],
};

const AUTHOR = makePerson({ pubkey: "author-pub", name: "Author", displayName: "Author" });
const VIEWER = makePerson({ pubkey: "viewer-pub", name: "Viewer", displayName: "Viewer" });

function authoredTask(overrides: Partial<Parameters<typeof makeTask>[0]> = {}): Post {
  return makeTask({ id: "task-1", relays: ["relay-one"], author: AUTHOR, ...overrides });
}

async function submit(overrides: Partial<TaskCreatePayload> = {}): Promise<TaskCreateResult> {
  let result!: TaskCreateResult;
  await act(async () => {
    result = await hookRef.current!.handleNewTask({ ...basePayload, ...overrides });
  });
  return result;
}

const localTasks = () => useTaskMutationStore.getState().localTasks;
const failedDrafts = () => useFailedPublishDraftsStore.getState().failedPublishDrafts;
const postedTags = () => useTaskMutationStore.getState().postedTags;
const suppressedIds = () => useTaskMutationStore.getState().suppressedNostrEventIds;

describe("useTaskPublishFlow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
    useFailedPublishDraftsStore.setState({ failedPublishDrafts: [] });
    usePreferencesStore.setState({ publishDelayEnabled: false });
    useFilterStore.setState({ activeRelayIds: new Set() });
    hookRef.current = null;
  });

  it("queues a failed publish draft and records posted tags when submission is rejected", async () => {
    const publishEvent = vi.fn(async () => ({
      success: false,
      eventId: "c".repeat(64),
      rejectionReason: "blocked",
      publishedRelayUrls: [],
    }));

    renderHarness({ publishEvent });
    const result = await submit({ content: "New task #general", tags: ["general"] });

    expect(result).toEqual({ ok: true });
    expect(failedDrafts()).toHaveLength(1);
    expect(suppressedIds().size).toBeGreaterThan(0);
    expect(postedTags()).toEqual([{ name: "general", relayIds: ["relay-one"] }]);
  });

  it("dispatches channel frecency intents for submitted tags", async () => {
    const dispatchFrecencyIntent = vi.fn();

    renderHarness({ dispatchFrecencyIntent });
    await submit({ content: "New task #general", tags: ["general"] });

    expect(dispatchFrecencyIntent).toHaveBeenCalledWith({
      type: "channel.bump",
      tag: "general",
      weight: 1.1,
    });
  });

  it("clears the failed draft after a successful retry", async () => {
    const publishEvent = vi
      .fn()
      .mockResolvedValueOnce({ success: false, eventId: "d".repeat(64), rejectionReason: "blocked", publishedRelayUrls: [] })
      .mockResolvedValueOnce({ success: true, eventId: "e".repeat(64), publishedRelayUrls: ["wss://relay.one"] });

    renderHarness({ publishEvent });
    await submit({ content: "New task #general", tags: ["general"] });
    expect(failedDrafts()).toHaveLength(1);

    await act(async () => {
      await hookRef.current!.handleRetryFailedPublish(failedDrafts()[0].id);
    });

    expect(failedDrafts()).toHaveLength(0);
    expect(publishEvent).toHaveBeenCalledTimes(2);
  });

  it("restores the event start and end fields when undoing a pending publish", async () => {
    usePreferencesStore.setState({ publishDelayEnabled: true });
    renderHarness({});

    await submit({
      content: "Standup #general",
      tags: ["general"],
      postType: "event",
      dates: [
        { datetime: new Date("2026-04-01T10:00:00.000Z"), type: "start" },
        { datetime: new Date("2026-04-01T12:00:00.000Z"), type: "end" },
      ],
      titledPost: { title: "Standup" },
    });
    const taskId = localTasks()[0].id;
    await act(async () => {
      hookRef.current!.handleUndoPendingPublish(taskId);
    });

    const restored = hookRef.current!.composeRestoreRequest;
    expect(restored?.state.postType).toBe("event");
    expect(restored?.state.dates).toEqual([
      { datetime: new Date("2026-04-01T10:00:00.000Z"), type: "start" },
      { datetime: new Date("2026-04-01T12:00:00.000Z"), type: "end" },
    ]);
    expect(localTasks()).toHaveLength(0);
  });

  it("updates due date and priority through the extracted handlers", async () => {
    const initialTask = makeTask({ id: "task-1", relays: ["relay-one"] });
    const publishTaskDueUpdate = vi.fn(async () => true);
    const publishTaskPriorityUpdate = vi.fn(async () => true);

    renderHarness({ initialTasks: [initialTask], publishTaskDueUpdate, publishTaskPriorityUpdate });
    await act(async () => {
      hookRef.current!.handleDueDateChange("task-1", new Date("2026-04-01T10:00:00.000Z"), "10:00", "due");
      hookRef.current!.handlePriorityChange("task-1", 60);
    });

    expect(publishTaskPriorityUpdate).toHaveBeenCalledWith("task-1", 60);
    expect(publishTaskDueUpdate).toHaveBeenCalledWith(
      "task-1",
      expect.any(String),
      new Date("2026-04-01T10:00:00.000Z"),
      "10:00",
      "due",
    );
  });

  it("blocks due date and priority changes for unrelated users on assigned tasks", async () => {
    const currentUser = makePerson({ pubkey: "viewer-pubkey", name: "viewer", displayName: "Viewer" });
    const taskAuthor = makePerson({ pubkey: "creator-pubkey", name: "creator", displayName: "Creator" });
    const initialTask = makeTask({
      id: "task-1",
      relays: ["relay-one"],
      author: taskAuthor,
      assigneePubkeys: ["assignee-pubkey"],
    });
    const publishTaskDueUpdate = vi.fn(async () => true);
    const publishTaskPriorityUpdate = vi.fn(async () => true);

    renderHarness({
      initialTasks: [initialTask],
      currentUser,
      people: [currentUser, taskAuthor],
      publishTaskDueUpdate,
      publishTaskPriorityUpdate,
    });
    await act(async () => {
      hookRef.current!.handleDueDateChange("task-1", new Date("2026-04-01T10:00:00.000Z"), "10:00", "due");
      hookRef.current!.handlePriorityChange("task-1", 60);
    });

    expect(getTaskPriority(localTasks()[0])).toBeUndefined();
    expect(getTaskPrimaryDate(localTasks()[0])).toBeUndefined();
    expect(publishTaskDueUpdate).not.toHaveBeenCalled();
    expect(publishTaskPriorityUpdate).not.toHaveBeenCalled();
  });

  it("publishes a NIP-09 deletion and removes the local task on success", async () => {
    const initialTask = authoredTask();
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "del-1", publishedRelayUrls: ["wss://relay.one"] }));

    renderHarness({ initialTasks: [initialTask], currentUser: AUTHOR, publishEvent });
    let deleted!: boolean;
    await act(async () => {
      deleted = await hookRef.current!.handlePostDelete("task-1");
    });

    expect(deleted).toBe(true);
    expect(publishEvent).toHaveBeenCalledWith(
      5,
      "",
      [["e", "task-1"], ["k", String(initialTask.kind)]],
      undefined,
      ["wss://relay.one"],
    );
    expect(localTasks()).toHaveLength(0);
    expect(suppressedIds().size).toBeGreaterThan(0);
  });

  it("refuses to delete a post the user does not own", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "x" }));

    renderHarness({ initialTasks: [authoredTask()], currentUser: VIEWER, publishEvent });
    let deleted!: boolean;
    await act(async () => {
      deleted = await hookRef.current!.handlePostDelete("task-1");
    });

    expect(deleted).toBe(false);
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("primes the composer and clears the restore request once consumed", async () => {
    renderHarness({
      initialTasks: [authoredTask({ content: "Original body #general" })],
      currentUser: AUTHOR,
    });
    await act(async () => {
      hookRef.current!.handleRecomposeTask("task-1");
    });

    const primed = hookRef.current!.composeRestoreRequest;
    expect(primed?.state.content).toBe("Original body #general");
    expect(primed?.state.recomposeOf?.eventId).toBe("task-1");

    await act(async () => {
      hookRef.current!.onComposeRestoreRequestConsumed(primed!.id);
    });

    expect(hookRef.current!.composeRestoreRequest).toBeNull();
  });

  it("fires a deletion event after a re-compose submit succeeds", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "new-evt", publishedRelayUrls: ["wss://relay.one"] }));

    renderHarness({ initialTasks: [authoredTask()], currentUser: AUTHOR, publishEvent });
    await submit({
      content: "Edited #general",
      tags: ["general"],
      recomposeOf: { eventId: "task-1", originalKind: 1621, relayIds: ["relay-one"] },
    });

    expect(publishEvent).toHaveBeenCalledWith(
      5,
      "",
      [["e", "task-1"], ["k", "1621"]],
      undefined,
      ["wss://relay.one"],
    );
  });

  it("skips deletion when the re-compose replacement publish fails", async () => {
    const publishEvent = vi.fn(async () => ({ success: false, eventId: "new-evt" }));

    renderHarness({ initialTasks: [authoredTask()], currentUser: AUTHOR, publishEvent });
    await submit({
      content: "Edited #general",
      tags: ["general"],
      recomposeOf: { eventId: "task-1", originalKind: 1621, relayIds: ["relay-one"] },
    });

    const deletionCall = (publishEvent.mock.calls as unknown as PublishEventCall[]).find(([kind]) => kind === 5);
    expect(deletionCall).toBeUndefined();
  });

  it("keeps the original parent when re-composing while focused on the post being recomposed", async () => {
    const parentId = "b".repeat(64);
    const parentTask = makeTask({ id: parentId, content: "Parent #general", relays: ["relay-one"] });
    const childTask = authoredTask({ content: "Reply", parentId });
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "new-evt" }));

    renderHarness({ initialTasks: [parentTask, childTask], currentUser: AUTHOR, publishEvent });
    await submit({
      content: "Edited",
      tags: ["general"],
      postType: "comment",
      focusedTaskId: "task-1",
      recomposeOf: { eventId: "task-1", originalKind: 1, relayIds: ["relay-one"], parentId },
    });

    const replacement = (publishEvent.mock.calls as unknown as PublishEventCall[]).find(([kind]) => kind !== 5);
    expect(replacement?.[3]).toBe(parentId);
  });

  it("inherits the current focused task as parent when re-composing", async () => {
    const originalParentId = "b".repeat(64);
    const newFocusId = "c".repeat(64);
    const originalParent = makeTask({ id: originalParentId, content: "Original #general", relays: ["relay-one"] });
    const newFocusTask = makeTask({ id: newFocusId, content: "New focus #general", relays: ["relay-one"] });
    const childTask = authoredTask({ content: "Reply", parentId: originalParentId });
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "new-evt" }));

    renderHarness({ initialTasks: [originalParent, newFocusTask, childTask], currentUser: AUTHOR, publishEvent });
    await submit({
      content: "Edited",
      tags: ["general"],
      postType: "comment",
      focusedTaskId: newFocusId,
      recomposeOf: { eventId: "task-1", originalKind: 1, relayIds: ["relay-one"], parentId: originalParentId },
    });

    const replacement = (publishEvent.mock.calls as unknown as PublishEventCall[]).find(([kind]) => kind !== 5);
    expect(replacement?.[3]).toBe(newFocusId);
  });

  it("uses provided mention identifiers as the authoritative mention set", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "f".repeat(64), publishedRelayUrls: ["wss://relay.one"] }));

    renderHarness({
      publishEvent,
      people: [makePerson({ pubkey: "a".repeat(64), name: "alice", displayName: "Alice" })],
    });
    await submit({
      content: "Assign @alice #general",
      tags: ["general"],
      explicitMentionPubkeys: [],
      mentionIdentifiers: [],
    });

    const [, , publishTags] = publishEvent.mock.calls[0] as unknown as PublishEventCall;
    expect(publishTags).toEqual(expect.arrayContaining([["t", "general"]]));
    expect(publishTags).not.toEqual(expect.arrayContaining([["p", "a".repeat(64)]]));
    expect(getTaskAssigneePubkeys(localTasks()[0])).toHaveLength(0);
    expect(localTasks()[0]?.mentions ?? []).toHaveLength(0);
  });

  it("publishes only whitespace-delimited mention and hashtag tokens from content", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "f".repeat(64), publishedRelayUrls: ["wss://relay.one"] }));

    renderHarness({
      publishEvent,
      people: [makePerson({ pubkey: "a".repeat(64), name: "alice", displayName: "Alice" })],
    });
    await submit({
      content: "Assign(@alice) (#general) and @alice #general",
      tags: ["general"],
    });

    const [, , publishTags] = publishEvent.mock.calls[0] as unknown as PublishEventCall;
    expect(publishTags).toEqual(expect.arrayContaining([["t", "general"], ["p", "a".repeat(64)]]));
    expect(publishTags).not.toEqual(expect.arrayContaining([["t", "(#general)"]]));
  });

  it("defaults root offer submissions to the only active relay when none is explicitly selected", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "e".repeat(64), publishedRelayUrls: ["wss://relay.one"] }));
    renderHarness({ publishEvent });

    await submit({ content: "Need support #general", tags: ["general"], relays: [], postType: "listing" });

    const [, , , , relayUrls] = publishEvent.mock.calls[0] as unknown as PublishEventCall;
    expect(relayUrls).toEqual(["wss://relay.one"]);
  });

  it("publishes root offers when at least one selected relay remains writable", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "f".repeat(64), publishedRelayUrls: ["wss://relay.one"] }));

    renderHarness({
      publishEvent,
      hasDisconnectedSelectedRelays: true,
      relays: [
        makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" }),
        makeRelay({ id: "relay-two", url: "wss://relay.two", connectionStatus: "disconnected" }),
      ],
    });
    await submit({
      content: "Need support #general",
      tags: ["general"],
      relays: ["relay-one", "relay-two"],
      postType: "listing",
    });

    const [, , , , relayUrls] = publishEvent.mock.calls[0] as unknown as PublishEventCall;
    expect(relayUrls).toEqual(["wss://relay.one"]);
  });

  it("inherits parent tags and parent relay for child offer submissions", async () => {
    const publishEvent = vi.fn(async () => ({ success: true, eventId: "f".repeat(64), publishedRelayUrls: ["wss://relay.one"] }));
    const parentTask = makeTask({ id: "a".repeat(64), tags: ["backend"], relays: ["relay-one"] });

    renderHarness({ publishEvent, initialTasks: [parentTask] });
    await submit({
      content: "Need support",
      postType: "listing",
      dates: [{ datetime: new Date("2026-04-01T10:00:00.000Z"), type: "start" }],
      focusedTaskId: "a".repeat(64),
    });

    const [, , publishTags, publishParentId, relayUrls] = publishEvent.mock.calls[0] as unknown as PublishEventCall;
    expect(publishTags).toEqual(expect.arrayContaining([["t", "backend"]]));
    expect(publishParentId).toBe(parentTask.id);
    expect(relayUrls).toEqual(["wss://relay.one"]);
    expect(getTaskPrimaryDate(localTasks()[0])).toBeUndefined();
  });

  it("assigns the signed eventId to the optimistic task when publish delay is enabled", async () => {
    usePreferencesStore.setState({ publishDelayEnabled: true });
    const signedEventId = "a".repeat(64);
    const signEvent = vi.fn(async () => ({ id: signedEventId }));
    const broadcastSignedEvent = vi.fn();
    const publishEvent = vi.fn();

    renderHarness({ publishEvent, signEvent, broadcastSignedEvent });
    const result = await submit({ content: "New task #general", tags: ["general"] });

    expect(result).toEqual({ ok: true });
    expect(signEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent).not.toHaveBeenCalled();
    expect(broadcastSignedEvent).not.toHaveBeenCalled();
    expect(localTasks()[0]?.id).toBe(signedEventId);
  });

  it("queues a failed publish draft when signing fails in the delay path", async () => {
    usePreferencesStore.setState({ publishDelayEnabled: true });
    const signEvent = vi.fn(async () => null);
    const broadcastSignedEvent = vi.fn();

    renderHarness({ signEvent, broadcastSignedEvent });
    const result = await submit({ content: "New task #general", tags: ["general"] });

    expect(result).toEqual({ ok: true });
    expect(failedDrafts()).toHaveLength(1);
    expect(broadcastSignedEvent).not.toHaveBeenCalled();
  });

  it("switches the active-relay sidebar to the original post's relays on recompose initiate", async () => {
    renderHarness({
      initialTasks: [authoredTask({ relays: ["relay-two"] })],
      currentUser: AUTHOR,
      relays: [
        makeRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" }),
        makeRelay({ id: "relay-two", url: "wss://relay.two", connectionStatus: "connected" }),
      ],
    });
    useFilterStore.setState({ activeRelayIds: new Set(["relay-one"]) });

    await act(async () => {
      hookRef.current!.handleRecomposeTask("task-1");
    });

    expect(Array.from(useFilterStore.getState().activeRelayIds)).toEqual(["relay-two"]);
  });

  it("warns and leaves the sidebar untouched when the original post's relays are unknown", async () => {
    const { notifyRecomposeRelaysUnavailable } = await import("@/lib/notifications");

    renderHarness({
      initialTasks: [authoredTask({ relays: ["relay-gone"] })],
      currentUser: AUTHOR,
    });
    useFilterStore.setState({ activeRelayIds: new Set(["relay-one"]) });

    await act(async () => {
      hookRef.current!.handleRecomposeTask("task-1");
    });

    expect(notifyRecomposeRelaysUnavailable).toHaveBeenCalledTimes(1);
    expect(Array.from(useFilterStore.getState().activeRelayIds)).toEqual(["relay-one"]);
  });
});
