import type { Channel, Relay, Task, TaskState, TaskStatus, TaskStateUpdate } from "@/types";
import { normalizeTaskState } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { SelectablePerson } from "@/types/person";

const DEFAULT_TIME = new Date("2026-01-01T00:00:00.000Z");

export function makePerson(overrides: Partial<SelectablePerson> = {}): SelectablePerson {
  return {
    pubkey: "person-pubkey",
    name: "person",
    displayName: "Person",
    avatar: "",
    isSelected: false,
    ...overrides,
  };
}

export function makeRelay(overrides: Partial<Relay> = {}): Relay {
  return {
    id: "demo",
    name: "Demo",
    isActive: true,
    url: "wss://demo.test",
    ...overrides,
  };
}

export function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "general",
    name: "general",
    filterState: "neutral",
    ...overrides,
  };
}

/**
 * Test convenience: accepts a `state` shorthand (object or status string) and
 * synthesizes the canonical stateUpdates entry from it. Production code
 * builds tasks via the converter, which seeds stateUpdates directly.
 */
type MakeTaskOverrides = Partial<Task> & { state?: TaskState | TaskStatus };

/**
 * Test convenience: returns a copy of `task` whose latest stateUpdate is the
 * given state. Useful for `{ ...baseTask, state: { status: ... } }`-style
 * overrides that historically wrote to a now-removed `state` field.
 */
export function withTaskState(task: Task, state: TaskState | TaskStatus): Task {
  return {
    ...task,
    stateUpdates: [
      {
        id: `synthetic-${task.id}`,
        state: normalizeTaskState(state),
        timestamp: task.timestamp,
        authorPubkey: task.author.pubkey,
      },
    ],
  };
}

export function makeTask(overrides: MakeTaskOverrides = {}): Task {
  const { state, stateUpdates, ...rest } = overrides;
  const author = rest.author ?? makePerson({ pubkey: "author-pubkey", name: "author", displayName: "Author" });
  const timestamp = rest.timestamp ?? DEFAULT_TIME;
  const id = rest.id ?? "task-1";
  const normalizedShorthand = state !== undefined ? normalizeTaskState(state) : undefined;
  // Precedence: explicit `state` shorthand wins (it's how tests express "the
  // current status is X" succinctly). Otherwise use explicit `stateUpdates`,
  // or default to an empty history.
  const resolvedStateUpdates: TaskStateUpdate[] =
    normalizedShorthand && normalizedShorthand.status !== "open"
      ? [
          {
            id,
            state: normalizedShorthand,
            timestamp,
            authorPubkey: author.pubkey,
          },
        ]
      : stateUpdates ?? [];
  return {
    id,
    kind: NostrEventKind.Task,
    author,
    content: "Task content #general",
    tags: ["general"],
    relays: ["demo"],
    timestamp,
    stateUpdates: resolvedStateUpdates,
    ...rest,
  };
}
