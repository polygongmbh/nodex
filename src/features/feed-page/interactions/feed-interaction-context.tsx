import { createContext, useContext, type PropsWithChildren } from "react";
import type { FeedInteractionIntent } from "./feed-interaction-intent";
import type { FeedInteractionBus, FeedInteractionPipelineEvent } from "./feed-interaction-pipeline";

const noopDispatch = async (_intent: FeedInteractionIntent): Promise<FeedInteractionPipelineEvent> => ({
  envelope: {
    id: -1,
    dispatchedAtMs: Date.now(),
    intent: { type: "ui.focusTasks" },
  },
  outcome: { status: "blocked" },
});

const defaultBus: FeedInteractionBus = {
  dispatch: noopDispatch,
  dispatchBatch: async (intents) => Promise.all(intents.map((intent) => noopDispatch(intent))),
};

const FeedInteractionBusContext = createContext<FeedInteractionBus>(defaultBus);

interface FeedInteractionProviderProps extends PropsWithChildren {
  bus: FeedInteractionBus;
}

export function FeedInteractionProvider({ bus, children }: FeedInteractionProviderProps) {
  return <FeedInteractionBusContext.Provider value={bus}>{children}</FeedInteractionBusContext.Provider>;
}

export function useFeedInteractionBus(): FeedInteractionBus {
  return useContext(FeedInteractionBusContext);
}

export function useFeedInteractionDispatch(): FeedInteractionBus["dispatch"] {
  return useFeedInteractionBus().dispatch;
}
