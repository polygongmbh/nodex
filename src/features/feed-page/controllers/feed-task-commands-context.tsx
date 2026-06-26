// TODO: Remove this context once composer-shell-ownership-refactor.md lands —
// when UnifiedBottomBar delegates submission to the shared composer hook,
// createTask has a single consumer and no longer needs a context.
import { createContext, useContext, type PropsWithChildren } from "react";
import type { TaskCreateResult, TaskCreatePayload } from "@/types";

/**
 * The one task command with direct component consumers: the composer submit
 * hook and the mobile bottom bar both await its TaskCreateResult. Every other
 * task command is bus-only (see TaskInteractionCommands in
 * feed-interaction-inputs.ts).
 */
export interface FeedTaskCommands {
  createTask(payload: TaskCreatePayload): Promise<TaskCreateResult>;
}

const defaultCommands: FeedTaskCommands = {
  createTask: async () => ({ ok: false, reason: "unexpected-error" }),
};

const FeedTaskCommandsContext = createContext<FeedTaskCommands>(defaultCommands);

interface FeedTaskCommandsProviderProps extends PropsWithChildren {
  value: FeedTaskCommands;
}

export function FeedTaskCommandsProvider({ value, children }: FeedTaskCommandsProviderProps) {
  return (
    <FeedTaskCommandsContext.Provider value={value}>
      {children}
    </FeedTaskCommandsContext.Provider>
  );
}

export function useFeedTaskCommands(): FeedTaskCommands {
  return useContext(FeedTaskCommandsContext);
}
