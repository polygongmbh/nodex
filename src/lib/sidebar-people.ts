import type { Person, Task } from "@/types";

const DEFAULT_MIN_POSTS = 3;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

interface SidebarPersonStats {
  count: number;
  latestTimestampMs: number;
}

export function deriveSidebarPeople(
  people: Person[],
  tasks: Task[],
  now: Date = new Date(),
  minPosts: number = DEFAULT_MIN_POSTS
): Person[] {
  const statsByAuthorId = new Map<string, SidebarPersonStats>();

  for (const task of tasks) {
    const authorId = task.author?.id?.trim().toLowerCase();
    if (!authorId) continue;

    const nextTimestampMs = task.timestamp instanceof Date ? task.timestamp.getTime() : Number.NEGATIVE_INFINITY;
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

      return {
        person: {
          ...person,
          isOnline: nowMs - stats.latestTimestampMs <= ONLINE_WINDOW_MS,
        },
        latestTimestampMs: stats.latestTimestampMs,
      };
    })
    .filter((entry): entry is { person: Person; latestTimestampMs: number } => entry !== null)
    .sort((a, b) => {
      if (b.latestTimestampMs !== a.latestTimestampMs) {
        return b.latestTimestampMs - a.latestTimestampMs;
      }
      return a.person.displayName.localeCompare(b.person.displayName, undefined, { sensitivity: "base" });
    })
    .map((entry) => entry.person);
}
