import type { Channel, CommentPost, ListingPost, Nip99Metadata, Post, Relay, TaskDate, TaskDateType, TaskPost, TaskState, TaskStatus, TaskStateUpdate } from "@/types";
import { formatLocalIsoDate, normalizeTaskState } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Person } from "@/types/person";
import { defaultKind0Cache } from "@/infrastructure/nostr/people-from-kind0";

/**
 * Seed the shared kind-0 profile cache so person components (which resolve
 * display via `useResolvedPerson(pubkey)` → the cache) render real metadata in
 * tests. `content` is the kind-0 wire shape (`name`, `display_name`, `picture`,
 * `nip05`, `about`). Pair with `clearKind0Cache()` in beforeEach.
 */
export function seedKind0Profile(
  pubkey: string,
  content: Record<string, string> = {},
  relayUrl = "wss://demo.test",
): void {
  // The kind-0 cache is relay-scoped (relay-less saves were removed), so seed
  // into a relay bucket. `useResolvedPerson` reads across all buckets, so any
  // relay works for tests that don't assert on relay scope.
  defaultKind0Cache.save(
    [
      {
        id: "",
        pubkey,
        kind: NostrEventKind.Metadata,
        tags: [],
        sig: "",
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(content),
      },
    ],
    relayUrl,
  );
}

export function clearKind0Cache(): void {
  defaultKind0Cache.clear();
}

const DEFAULT_TIME = new Date("2026-01-01T00:00:00.000Z");

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    pubkey: "person-pubkey",
    name: "person",
    displayName: "Person",
    picture: "",
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
  | "id" | "pubkey" | "content" | "tags" | "relays" | "timestamp"
  | "lastEditedAt" | "parentId" | "mentions" | "attachments" | "locationGeohash"
>> & {
  /** Test convenience: pass a whole Person and only its pubkey lands on the
   *  post (posts carry pubkey, not embedded author). Prefer `pubkey` directly. */
  author?: Person;
};

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
        authorPubkey: task.pubkey,
      },
    ],
  };
}

function buildBase(overrides: BaseOverrides) {
  const pubkey = overrides.pubkey ?? overrides.author?.pubkey ?? "author-pubkey";
  return {
    id: overrides.id ?? "task-1",
    pubkey,
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
            authorPubkey: base.pubkey,
          },
        ]
      : stateUpdates ?? [];
  const resolvedDates: TaskDate[] = dueDate
    ? [
        dueTime
          ? (() => {
              const m = dueTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
              const dt = new Date(dueDate);
              if (m) dt.setHours(Number(m[1]), Number(m[2]), 0, 0);
              return { datetime: dt, type: dateType ?? "due" };
            })()
          : { date: formatLocalIsoDate(dueDate), type: dateType ?? "due" },
      ]
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
  overrides: BaseOverrides & { nip99?: Nip99Metadata; title?: string; summary?: string } = {}
): ListingPost {
  const { nip99, title, summary, ...rest } = overrides;
  const base = buildBase(rest);
  return {
    ...base,
    kind: NostrEventKind.ClassifiedListing,
    title,
    summary,
    nip99: nip99 ?? { identifier: base.id, status: "active" },
  };
}
