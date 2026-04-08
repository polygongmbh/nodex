import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Relay, Task } from "@/types";
import {
  buildRelayScopedPresenceTargets,
  useRelayScopedPresence,
} from "./use-relay-scoped-presence";

function buildRelay(overrides: Partial<Relay> & Pick<Relay, "id" | "url">): Relay {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    icon: overrides.icon ?? "radio",
    isActive: overrides.isActive ?? true,
    connectionStatus: overrides.connectionStatus ?? "connected",
    url: overrides.url,
  };
}

function buildTask(overrides: Partial<Task> & Pick<Task, "id" | "relays">): Task {
  return {
    id: overrides.id,
    author: overrides.author ?? {
      id: "author",
      name: "Author",
      displayName: "Author",
      isOnline: false,
      isSelected: false,
    },
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

describe("buildRelayScopedPresenceTargets", () => {
  const relays = [
    buildRelay({ id: "relay-a", url: "wss://relay.a" }),
    buildRelay({ id: "relay-b", url: "wss://relay.b" }),
  ];

  it("includes the focused task id only on relays that carry the task", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a"] }),
      relayScopeIds: new Set(["relay-a", "relay-b"]),
      relays,
    });

    expect(targets).toHaveLength(2);
    expect(targets).toEqual([
      expect.objectContaining({
        relayUrls: ["wss://relay.a"],
        taskId: "a".repeat(64),
      }),
      expect.objectContaining({
        relayUrls: ["wss://relay.b"],
        taskId: null,
      }),
    ]);
  });

  it("omits the task id for non-nostr task ids", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: buildTask({ id: "local-task", relays: ["relay-a", "relay-b"] }),
      relayScopeIds: new Set(["relay-a", "relay-b"]),
      relays,
    });

    expect(targets).toEqual([
      expect.objectContaining({
        relayUrls: ["wss://relay.a", "wss://relay.b"],
        taskId: null,
      }),
    ]);
  });

  it("omits the task id when relay membership is unknown", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: buildTask({ id: "a".repeat(64), relays: [] }),
      relayScopeIds: new Set(["relay-a", "relay-b"]),
      relays,
    });

    expect(targets).toEqual([
      expect.objectContaining({
        relayUrls: ["wss://relay.a", "wss://relay.b"],
        taskId: null,
      }),
    ]);
  });

  it("excludes non-writable relays from presence targets", () => {
    const targets = buildRelayScopedPresenceTargets({
      currentView: "feed",
      focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a", "relay-b", "relay-c"] }),
      relayScopeIds: new Set(["relay-a", "relay-b", "relay-c"]),
      relays: [
        buildRelay({ id: "relay-a", url: "wss://relay.a", connectionStatus: "connected" }),
        buildRelay({ id: "relay-b", url: "wss://relay.b", connectionStatus: "read-only" }),
        buildRelay({ id: "relay-c", url: "wss://relay.c", connectionStatus: "disconnected" }),
      ],
    });

    expect(targets).toEqual([
      expect.objectContaining({
        relayUrls: ["wss://relay.a"],
        taskId: "a".repeat(64),
      }),
    ]);
  });
});

describe("useRelayScopedPresence", () => {
  it("publishes relay-specific presence payloads for selected relays", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    renderHook(() =>
      useRelayScopedPresence({
        userPubkey: "pub",
        presenceEnabled: true,
        currentView: "feed",
        focusedTask: buildTask({ id: "a".repeat(64), relays: ["relay-a"] }),
        relayScopeIds: new Set(["relay-a", "relay-b"]),
        relays: [
          buildRelay({ id: "relay-a", url: "wss://relay.a" }),
          buildRelay({ id: "relay-b", url: "wss://relay.b" }),
        ],
        publishEvent,
      })
    );

    await act(async () => {});

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
  });

  it("switches relay without sending offline on deselection", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { rerender } = renderHook(
      ({ relayScopeIds }) =>
        useRelayScopedPresence({
          userPubkey: "pub",
          presenceEnabled: true,
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

    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent.mock.calls[0]?.[4]).toEqual(["wss://relay.a"]);

    rerender({ relayScopeIds: new Set(["relay-b"]) });
    await act(async () => {});

    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent.mock.calls[1]?.[4]).toEqual(["wss://relay.b"]);
    // No offline published to relay-a
    expect(publishEvent.mock.calls.every((call) => !String(call[1]).includes('"state":"offline"'))).toBe(true);
  });

  it("does not re-publish when the fingerprint has not changed", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { rerender } = renderHook(
      ({ currentView }) =>
        useRelayScopedPresence({
          userPubkey: "pub",
          presenceEnabled: true,
          currentView,
          focusedTask: null,
          relayScopeIds: new Set(["relay-a"]),
          relays: [buildRelay({ id: "relay-a", url: "wss://relay.a" })],
          publishEvent,
        }),
      {
        initialProps: { currentView: "feed" },
      }
    );

    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(1);

    // Re-render with the same view — fingerprint unchanged, no re-publish.
    rerender({ currentView: "feed" });

    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(1);

    // Change view — new fingerprint, publish again.
    rerender({ currentView: "list" });

    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent.mock.calls[1]?.[1]).toContain(`"view":"list"`);
  });

  it("publishes offline only when explicitly requested", async () => {
    const publishEvent = vi.fn(async (_kind, _content, _tags, _parentId, relayUrls) => ({
      success: true,
      publishedRelayUrls: relayUrls ?? [],
    }));

    const { result } = renderHook(() =>
      useRelayScopedPresence({
        userPubkey: "pub",
        presenceEnabled: true,
        currentView: "feed",
        focusedTask: null,
        relayScopeIds: new Set(["relay-a"]),
        relays: [buildRelay({ id: "relay-a", url: "wss://relay.a" })],
        publishEvent,
      })
    );

    await act(async () => {});

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent.mock.calls[0]?.[1]).not.toContain(`"state":"offline"`);

    await act(async () => {
      await result.current.publishOfflinePresenceNow();
    });

    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent.mock.calls[1]?.[1]).toContain(`"state":"offline"`);
    expect(publishEvent.mock.calls[1]?.[4]).toEqual(["wss://relay.a"]);
  });
});
