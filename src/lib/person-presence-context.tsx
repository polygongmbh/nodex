import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { Post } from "@/types";
import type { PersonPresenceSnapshot } from "@/types/person";
import { derivePersonPresenceSnapshot, type LatestPresenceSnapshot } from "@/lib/presence-status";

interface PersonPresenceContextValue {
  presenceByPubkey: Map<string, PersonPresenceSnapshot>;
}

const PersonPresenceContext = createContext<PersonPresenceContextValue>({
  presenceByPubkey: new Map(),
});

interface PersonPresenceProviderProps extends PropsWithChildren {
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  allTasks?: Post[];
  now?: Date;
  currentUserPubkey?: string | null;
}

export function PersonPresenceProvider({
  latestPresenceByAuthor,
  allTasks,
  now,
  currentUserPubkey,
  children,
}: PersonPresenceProviderProps) {
  const presenceByPubkey = useMemo(() => {
    const evaluatedAt = now ?? new Date();
    const latestActivityByAuthor = new Map<string, number>();
    if (allTasks) {
      for (const task of allTasks) {
        const authorId = task.author?.pubkey?.trim().toLowerCase();
        if (!authorId) continue;
        const ts = task.timestamp instanceof Date ? task.timestamp.getTime() : 0;
        const previous = latestActivityByAuthor.get(authorId);
        if (previous === undefined || ts > previous) {
          latestActivityByAuthor.set(authorId, ts);
        }
      }
    }
    const authorIds = new Set<string>([
      ...latestPresenceByAuthor.keys(),
      ...latestActivityByAuthor.keys(),
    ]);
    const result = new Map<string, PersonPresenceSnapshot>();
    for (const authorId of authorIds) {
      result.set(
        authorId,
        derivePersonPresenceSnapshot(
          latestPresenceByAuthor.get(authorId),
          latestActivityByAuthor.get(authorId),
          evaluatedAt,
        ),
      );
    }
    // The self user's own kind 30315 is published only on view/task changes —
    // no periodic heartbeat — so the 3-minute online window would mark us
    // OFFLINE while the app is plainly open. Override to "online" locally;
    // remote observers still see the real (possibly stale) presence event.
    if (currentUserPubkey) {
      const selfKey = currentUserPubkey.trim().toLowerCase();
      const selfPresence = latestPresenceByAuthor.get(selfKey);
      result.set(selfKey, {
        state: "online",
        reportedAtMs: selfPresence?.reportedAtMs ?? evaluatedAt.getTime(),
        context: selfPresence?.state === "active"
          ? { view: selfPresence.view, taskId: selfPresence.taskId ?? null }
          : undefined,
      });
    }
    return result;
  }, [latestPresenceByAuthor, allTasks, now, currentUserPubkey]);

  const value = useMemo(() => ({ presenceByPubkey }), [presenceByPubkey]);

  return (
    <PersonPresenceContext.Provider value={value}>
      {children}
    </PersonPresenceContext.Provider>
  );
}

export function usePersonPresence(pubkey: string | undefined): PersonPresenceSnapshot | undefined {
  const { presenceByPubkey } = useContext(PersonPresenceContext);
  if (!pubkey) return undefined;
  return presenceByPubkey.get(pubkey.trim().toLowerCase());
}
