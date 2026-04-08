import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { PRESENCE_ONLINE_WINDOW_MS, PRESENCE_RECENT_WINDOW_MS, type LatestPresenceSnapshot } from "@/lib/presence-status";

const DEFAULT_MIN_POSTS = 3;

interface DeriveSidebarPeopleOptions {
  minPosts?: number;
  personalizeScores?: Map<string, number>;
}

interface SidebarPersonStats {
  count: number;
  latestTimestampMs: number;
}

export function deriveSidebarPeople(
  people: Person[],
  tasks: Task[],
  latestPresenceByAuthorId: Map<string, LatestPresenceSnapshot> = new Map(),
  now: Date = new Date(),
  options: DeriveSidebarPeopleOptions = {}
): Person[] {
  const minPosts = options.minPosts ?? DEFAULT_MIN_POSTS;
  const personalizeScores = options.personalizeScores ?? new Map();
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
      const normalizedId = person.id.trim().toLowerCase();
      const stats = statsByAuthorId.get(normalizedId);
      if (!stats || stats.count < minPosts) {
        return null;
      }
      const personalScore = personalizeScores.get(normalizedId) || 0;

      const latestPresence = latestPresenceByAuthorId.get(normalizedId);
      const latestPresenceTimestampMs =
        latestPresence?.state === "active" ? latestPresence.reportedAtMs : undefined;
      const latestActivityTimestampMs = Math.max(
        stats?.latestTimestampMs ?? Number.NEGATIVE_INFINITY,
        latestPresenceTimestampMs ?? Number.NEGATIVE_INFINITY
      );
      const ageMs =
        latestActivityTimestampMs === Number.NEGATIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : nowMs - latestActivityTimestampMs;
      const onlineStatus: Person["onlineStatus"] = latestPresence?.state === "offline"
        ? "offline"
        : ageMs <= PRESENCE_ONLINE_WINDOW_MS
          ? "online"
          : ageMs <= PRESENCE_RECENT_WINDOW_MS
            ? "recent"
            : "offline";

      return {
        person: {
          ...person,
          isOnline: onlineStatus === "online",
          onlineStatus,
          lastPresenceAtMs: latestPresence?.reportedAtMs,
          presenceView: latestPresence?.state === "active" ? latestPresence.view : undefined,
          presenceTaskId: latestPresence?.state === "active" ? latestPresence.taskId : undefined,
        },
        latestTimestampMs: latestActivityTimestampMs,
        personalScore,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      if (b.latestTimestampMs !== a.latestTimestampMs) {
        return b.latestTimestampMs - a.latestTimestampMs;
      }
      if (b.personalScore !== a.personalScore) {
        return b.personalScore - a.personalScore;
      }
      return a.person.displayName.localeCompare(b.person.displayName, undefined, {
        sensitivity: "base",
      });
    })
    .map((entry) => entry.person);
}
