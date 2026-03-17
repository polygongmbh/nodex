import type { Person, Task } from "@/types";

const DEFAULT_MIN_POSTS = 3;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const RECENT_WINDOW_MS = 60 * 60 * 1000;

interface SidebarPersonStats {
  count: number;
  latestTimestampMs: number;
}

export function deriveSidebarPeople(
  people: Person[],
  tasks: Task[],
  latestPresenceByAuthorId: Map<string, number> = new Map(),
  now: Date = new Date(),
  minPosts: number = DEFAULT_MIN_POSTS
): Person[] {
  const statsByAuthorId = new Map<string, SidebarPersonStats>();

  for (const task of tasks) {
    const authorId = task.author?.id?.trim().toLowerCase();
    if (!authorId) continue;

    const nextTimestampMs =
      task.timestamp instanceof Date ? task.timestamp.getTime() : Number.NEGATIVE_INFINITY;
    const previous = statsByAuthorId.get(authorId);

    if (!previous) {
      statsByAuthorId.set(authorId, {
        count: 1,
        latestTimestampMs: nextTimestampMs,
      });
      continue;
    }

    statsByAuthorId.set(authorId, {
      count: previous.count + 1,
      latestTimestampMs: Math.max(previous.latestTimestampMs, nextTimestampMs),
    });
  }

  const nowMs = now.getTime();

  return people
    .map((person) => {
      const stats = statsByAuthorId.get(person.id.trim().toLowerCase());
      if (!stats || stats.count < minPosts) {
        return null;
      }

      const latestPresenceTimestampMs = latestPresenceByAuthorId.get(
        person.id.trim().toLowerCase()
      );
      const latestActivityTimestampMs = Math.max(
        stats.latestTimestampMs,
        latestPresenceTimestampMs ?? Number.NEGATIVE_INFINITY
      );
      const ageMs = nowMs - latestActivityTimestampMs;
      const onlineStatus: Person["onlineStatus"] =
        ageMs <= ONLINE_WINDOW_MS ? "online" : ageMs <= RECENT_WINDOW_MS ? "recent" : "offline";

      return {
        person: {
          ...person,
          isOnline: onlineStatus === "online",
          onlineStatus,
        },
        latestTimestampMs: latestActivityTimestampMs,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      if (b.latestTimestampMs !== a.latestTimestampMs) {
        return b.latestTimestampMs - a.latestTimestampMs;
      }
      return a.person.displayName.localeCompare(b.person.displayName, undefined, {
        sensitivity: "base",
      });
    })
    .map((entry) => entry.person);
}
