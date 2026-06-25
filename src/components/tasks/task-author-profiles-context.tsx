import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import type { Post } from "@/types";
import type { Person } from "@/types/person";

const TaskAuthorProfilesContext = createContext<Record<string, Person>>({});

interface TaskAuthorProfilesProviderProps extends PropsWithChildren {
  tasks: Post[];
}

export function TaskAuthorProfilesProvider({
  tasks,
  children,
}: TaskAuthorProfilesProviderProps) {
  const authorPubkeys = useMemo(() => {
    const pubkeys = tasks.map((task) => task.pubkey);
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
