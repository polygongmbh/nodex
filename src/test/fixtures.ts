import type { Channel, CommentPost, ListingPost, Nip99Metadata, Post, Relay, TaskDate, TaskDateType, TaskPost, TaskState, TaskStatus, TaskStateUpdate } from "@/types";
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
 * Test convenience: accepts shorthands for state (object or status string)
 * and the legacy date trio (dueDate / dueTime / dateType). makeTask
 * synthesizes the canonical stateUpdates and dates entries from them.
 * Production code builds tasks via the converter, which writes those fields
 * directly.
 *
 * `kind` defaults to Task. Pass a different kind to produce a CommentPost
 * or ListingPost — the result type widens to Post in those cases.
 */
type BaseOverrides = Partial<Pick<TaskPost,
  | "id" | "author" | "content" | "tags" | "relays" | "timestamp"
  | "lastEditedAt" | "parentId" | "mentions" | "attachments" | "locationGeohash"
>>;

type MakeTaskOverrides = BaseOverrides & Partial<Pick<TaskPost,
  | "stateUpdates" | "dates" | "assigneePubkeys" | "priority"
>> & {
  kind?: NostrEventKind;
  state?: TaskState | TaskStatus;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  nip99?: Nip99Metadata;
};

export function withTaskState(task: TaskPost, state: TaskState | TaskStatus): TaskPost {
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

function buildBase(overrides: BaseOverrides) {
  const author = overrides.author ?? makePerson({ pubkey: "author-pubkey", name: "author", displayName: "Author" });
  return {
    id: overrides.id ?? "task-1",
    author,
    content: overrides.content ?? "Task content #general",
    tags: overrides.tags ?? ["general"],
    relays: overrides.relays ?? ["demo"],
    timestamp: overrides.timestamp ?? DEFAULT_TIME,
    lastEditedAt: overrides.lastEditedAt,
    parentId: overrides.parentId,
    mentions: overrides.mentions,
    attachments: overrides.attachments,
    locationGeohash: overrides.locationGeohash,
  };
}

export function makeTask(overrides: MakeTaskOverrides = {}): TaskPost {
  const {
    state, stateUpdates, dueDate, dueTime, dateType, dates,
    nip99: _nip99, assigneePubkeys, priority, kind: _kind,
    ...rest
  } = overrides;
  const base = buildBase(rest);

  const normalizedShorthand = state !== undefined ? normalizeTaskState(state) : undefined;
  const resolvedStateUpdates: TaskStateUpdate[] =
    normalizedShorthand && normalizedShorthand.status !== "open"
      ? [
          {
            id: base.id,
            state: normalizedShorthand,
            timestamp: base.timestamp,
            authorPubkey: base.author.pubkey,
          },
        ]
      : stateUpdates ?? [];
  const resolvedDates: TaskDate[] = dueDate
    ? [{ date: dueDate, time: dueTime, type: dateType ?? "due" }]
    : dates ?? [];

  return {
    ...base,
    kind: NostrEventKind.Task,
    stateUpdates: resolvedStateUpdates,
    dates: resolvedDates,
    assigneePubkeys: assigneePubkeys ?? [],
    priority,
  };
}

export function makeComment(overrides: BaseOverrides = {}): CommentPost {
  return { ...buildBase(overrides), kind: NostrEventKind.TextNote };
}

export function makeListing(
  overrides: BaseOverrides & { nip99?: Nip99Metadata } = {}
): ListingPost {
  const { nip99, ...rest } = overrides;
  const base = buildBase(rest);
  return {
    ...base,
    kind: NostrEventKind.ClassifiedListing,
    nip99: nip99 ?? { identifier: base.id, title: base.content, status: "active" },
  };
}
