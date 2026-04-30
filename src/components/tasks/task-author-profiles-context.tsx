import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useNostrProfiles, type NostrProfile } from "@/infrastructure/nostr/use-nostr-profiles";
import type { Task } from "@/types";

const TaskAuthorProfilesContext = createContext<Record<string, NostrProfile>>({});

interface TaskAuthorProfilesProviderProps extends PropsWithChildren {
  tasks: Task[];
}

export function TaskAuthorProfilesProvider({
  tasks,
  children,
}: TaskAuthorProfilesProviderProps) {
  const authorPubkeys = useMemo(() => {
    const pubkeys = tasks.map((task) => task.author.pubkey);
    return Array.from(new Set(pubkeys));
  }, [tasks]).filter((authorId): authorId is string =>
    authorId.length === 64 && /^[a-f0-9]+$/i.test(authorId)
  );
  const { profiles } = useNostrProfiles(authorPubkeys);

  return (
    <TaskAuthorProfilesContext.Provider value={profiles}>
      {children}
    </TaskAuthorProfilesContext.Provider>
  );
}

export function useTaskAuthorProfiles() {
  return useContext(TaskAuthorProfilesContext);
}
