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
  it("splits scoped writable relays by whether they carry the focused task", () => {
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
        relayUrls: ["wss://relay.a"],
        taskId: "a".repeat(64),
      }),
      expect.objectContaining({
        relayUrls: ["wss://relay.b"],
        taskId: null,
      }),
    ]);
  });

});

describe("useRelayScopedPresence", () => {
  it("publishes relay-specific presence payloads and skips unchanged fingerprints", async () => {
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

    rerender({ currentView: "feed" });
    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(2);

    rerender({ currentView: "list" });
    await act(async () => {});
    expect(publishEvent).toHaveBeenCalledTimes(4);
    expect(publishEvent.mock.calls[2]?.[1]).toContain(`"view":"list"`);
    expect(publishEvent.mock.calls[3]?.[1]).toContain(`"view":"list"`);
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
    expect(publishEvent.mock.calls.every((call) => !String(call[1]).includes('"state":"offline"'))).toBe(true);

    await act(async () => {
      await result.current.publishOfflinePresenceNow();
    });

    expect(publishEvent).toHaveBeenCalledTimes(3);
    expect(publishEvent.mock.calls[2]?.[1]).toContain(`"state":"offline"`);
    expect(publishEvent.mock.calls[2]?.[4]).toEqual(["wss://relay.b", "wss://relay.a"]);
  });
});
