import { createContext, useContext, type PropsWithChildren } from "react";
import type { OnNewTask } from "@/types";

export interface FeedTaskCommands {
  onNewTask: OnNewTask;
}

const defaultCommands: FeedTaskCommands = {
  onNewTask: async () => ({ ok: false, reason: "unexpected-error" }),
};

const FeedTaskCommandContext = createContext<FeedTaskCommands>(defaultCommands);

interface FeedTaskCommandProviderProps extends PropsWithChildren {
  value: FeedTaskCommands;
}

export function FeedTaskCommandProvider({ value, children }: FeedTaskCommandProviderProps) {
  return <FeedTaskCommandContext.Provider value={value}>{children}</FeedTaskCommandContext.Provider>;
}

export function useFeedTaskCommands(): FeedTaskCommands {
  return useContext(FeedTaskCommandContext);
}
