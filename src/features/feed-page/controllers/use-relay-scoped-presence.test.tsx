import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Relay, Task } from "@/types";
import {
  buildRelayScopedPresenceTargets,
  useRelayScopedPresence,
} from "./use-relay-scoped-presence";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { makePerson } from "@/test/fixtures";

function buildRelay(overrides: Partial<Relay> & Pick<Relay, "id" | "url">): Relay {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    isActive: overrides.isActive ?? true,
    connectionStatus: overrides.connectionStatus ?? "connected",
    url: overrides.url,
  };
}

function buildTask(overrides: Partial<Task> & Pick<Task, "id" | "relays">): Task {
  return {
    id: overrides.id,
    author: overrides.author ?? makePerson({ pubkey: "author", name: "Author", displayName: "Author" }),
    content: overrides.content ?? "Task",
    tags: overrides.tags ?? [],
    relays: overrides.relays,
    taskType: overrides.taskType ?? "task",
    timestamp: overrides.timestamp ?? new Date("2026-03-27T00:00:00.000Z"),
    likes: overrides.likes ?? 0,
    replies: overrides.replies ?? 0,
    reposts: overrides.reposts ?? 0,
  };
}

const PRESENCE_DEBOUNCE_MS = 3000;

async function flushPresenceDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PRESENCE_DEBOUNCE_MS);
  });
}

describe("buildRelayScopedPresenceTargets", () => {
  it("splits scoped reachable relays by whether they carry the focused task", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a", "relay-c"] }),
      relayScopeIds: new Set(["relay-a", "relay-b", "relay-c"]),
      relays: [
        buildRelay({ id: "relay-a", url: "wss://relay.a", connectionStatus: "connected" }),
        buildRelay({ id: "relay-b", url: "wss://relay.b", connectionStatus: "connected" }),
        buildRelay({ id: "relay-c", url: "wss://relay.c", connectionStatus: "read-only" }),
      ],
    });

    expect(targets).toHaveLength(2);
    expect(targets).toEqual([
      expect.objectContaining({
        relayUrls: ["wss://relay.a", "wss://relay.c"],
        taskId: "a".repeat(64),
      }),
      expect.objectContaining({
        relayUrls: ["wss://relay.b"],
        taskId: null,
      }),
    ]);
  });

  it("includes read-only relays but excludes disconnected and errored ones", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: null,
      relayScopeIds: new Set(["relay-a", "relay-b", "relay-c", "relay-d"]),
      relays: [
        buildRelay({ id: "relay-a", url: "wss://relay.a", connectionStatus: "connected" }),
        buildRelay({ id: "relay-b", url: "wss://relay.b", connectionStatus: "read-only" }),
        buildRelay({ id: "relay-c", url: "wss://relay.c", connectionStatus: "disconnected" }),
        buildRelay({ id: "relay-d", url: "wss://relay.d", connectionStatus: "connection-error" }),
      ],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0].relayUrls).toEqual(["wss://relay.a", "wss://relay.b"]);
  });

});

describe("useRelayScopedPresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePreferencesStore.setState({ presencePublishingEnabled: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes relay-specific presence payloads and skips unchanged fingerprints", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { rerender } = renderHook(
      ({ currentView }) =>
        useRelayScopedPresence({
          userPubkey: "pub",
          currentView,
          focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a"] }),
          relayScopeIds: new Set(["relay-a", "relay-b"]),
          relays: [
            buildRelay({ id: "relay-a", url: "wss://relay.a" }),
            buildRelay({ id: "relay-b", url: "wss://relay.b" }),
          ],
          publishEvent,
        }),
      {
        initialProps: { currentView: "feed" },
      }
    );

    expect(publishEvent).not.toHaveBeenCalled();
    await flushPresenceDebounce();

    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent.mock.calls).toEqual([
      [
        30315,
        expect.stringContaining(`"taskId":"${"a".repeat(64)}"`),
        expect.any(Array),
        undefined,
        ["wss://relay.a"],
      ],
      [
        30315,
        expect.stringContaining(`"taskId":null`),
        expect.any(Array),
        undefined,
        ["wss://relay.b"],
      ],
    ]);

    rerender({ currentView: "feed" });
    await flushPresenceDebounce();
    expect(publishEvent).toHaveBeenCalledTimes(2);

    rerender({ currentView: "list" });
    expect(publishEvent).toHaveBeenCalledTimes(2);
    await flushPresenceDebounce();
    expect(publishEvent).toHaveBeenCalledTimes(4);
    expect(publishEvent.mock.calls[2]?.[1]).toContain(`"view":"list"`);
    expect(publishEvent.mock.calls[3]?.[1]).toContain(`"view":"list"`);
  });

  it("only publishes the latest active presence after rapid view changes", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { rerender } = renderHook(
      ({ currentView }) =>
        useRelayScopedPresence({
          userPubkey: "pub",
          currentView,
          focusedTask: null,
          relayScopeIds: new Set(["relay-a"]),
          relays: [
            buildRelay({ id: "relay-a", url: "wss://relay.a" }),
          ],
          publishEvent,
        }),
      {
        initialProps: { currentView: "feed" },
      }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_DEBOUNCE_MS - 1);
    });
    rerender({ currentView: "list" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_DEBOUNCE_MS - 1);
    });
    rerender({ currentView: "calendar" });

    expect(publishEvent).not.toHaveBeenCalled();

    await flushPresenceDebounce();

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent.mock.calls[0]?.[1]).toContain(`"view":"calendar"`);
  });

  it("switches relays without implicit offline and only publishes offline on demand", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { result, rerender } = renderHook(
      ({ relayScopeIds }) =>
        useRelayScopedPresence({
          userPubkey: "pub",
          currentView: "feed",
          focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a", "relay-b"] }),
          relayScopeIds,
          relays: [
            buildRelay({ id: "relay-a", url: "wss://relay.a" }),
            buildRelay({ id: "relay-b", url: "wss://relay.b" }),
          ],
          publishEvent,
        }),
      {
        initialProps: { relayScopeIds: new Set(["relay-a"]) },
      }
    );

    await flushPresenceDebounce();

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent.mock.calls[0]?.[4]).toEqual(["wss://relay.a"]);

    rerender({ relayScopeIds: new Set(["relay-b"]) });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    await flushPresenceDebounce();

    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent.mock.calls[1]?.[4]).toEqual(["wss://relay.b"]);
    expect(publishEvent.mock.calls.every((call) => !String(call[1]).includes('"state":"offline"'))).toBe(true);

    await act(async () => {
      await result.current.publishOfflinePresenceNow();
    });

    expect(publishEvent).toHaveBeenCalledTimes(3);
    expect(publishEvent.mock.calls[2]?.[1]).toContain(`"state":"offline"`);
    expect(publishEvent.mock.calls[2]?.[4]).toEqual(["wss://relay.b", "wss://relay.a"]);
  });
});
