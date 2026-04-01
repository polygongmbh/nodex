import type { FeedInteractionIntent, FeedInteractionIntentType } from "./feed-interaction-intent";

export interface FeedInteractionEnvelope<TIntent extends FeedInteractionIntent = FeedInteractionIntent> {
  id: number;
  dispatchedAtMs: number;
  intent: TIntent;
}

export type FeedInteractionOutcomeStatus = "handled" | "unhandled" | "blocked" | "failed";

export interface FeedInteractionOutcome {
  status: FeedInteractionOutcomeStatus;
  result?: unknown;
  error?: unknown;
}

export interface FeedInteractionPipelineEvent {
  envelope: FeedInteractionEnvelope;
  outcome: FeedInteractionOutcome;
}

export interface FeedInteractionRuntime {
  now: () => number;
}

export interface FeedInteractionPipelineApi {
  dispatch: FeedInteractionBus["dispatch"];
  dispatchBatch: FeedInteractionBus["dispatchBatch"];
}

export type FeedInteractionMiddleware = (
  envelope: FeedInteractionEnvelope,
  api: FeedInteractionPipelineApi,
  next: () => Promise<void>
) => void | Promise<void>;

export type FeedInteractionHandler<TIntent extends FeedInteractionIntent = FeedInteractionIntent> = (
  intent: TIntent,
  api: FeedInteractionPipelineApi
) => unknown | Promise<unknown>;

export type FeedInteractionHandlerMap = {
  [Type in FeedInteractionIntentType]?: FeedInteractionHandler<Extract<FeedInteractionIntent, { type: Type }>>;
};

export type FeedInteractionEffect = (
  event: FeedInteractionPipelineEvent,
  api: FeedInteractionPipelineApi
) => void | Promise<void>;

export interface FeedInteractionPipelineConfig {
  runtime?: Partial<FeedInteractionRuntime>;
  middlewares?: FeedInteractionMiddleware[];
  handlers?: FeedInteractionHandlerMap;
  effects?: FeedInteractionEffect[];
  onUnhandledIntent?: (envelope: FeedInteractionEnvelope, api: FeedInteractionPipelineApi) => void | Promise<void>;
  onDispatchError?: (event: FeedInteractionPipelineEvent, api: FeedInteractionPipelineApi) => void | Promise<void>;
}

export interface FeedInteractionBus {
  dispatch: (intent: FeedInteractionIntent) => Promise<FeedInteractionPipelineEvent>;
  dispatchBatch: (intents: FeedInteractionIntent[]) => Promise<FeedInteractionPipelineEvent[]>;
}

const defaultRuntime: FeedInteractionRuntime = {
  now: () => Date.now(),
};

export function createFeedInteractionBus(config: FeedInteractionPipelineConfig = {}): FeedInteractionBus {
  const runtime: FeedInteractionRuntime = {
    ...defaultRuntime,
    ...(config.runtime || {}),
  };
  const middlewares = config.middlewares || [];
  const handlers = config.handlers || {};
  const effects = config.effects || [];
  let nextEnvelopeId = 1;

  let api: FeedInteractionPipelineApi = {
    dispatch: async () => ({
      envelope: {
        id: -1,
        dispatchedAtMs: runtime.now(),
        intent: { type: "ui.focusTasks" },
      },
      outcome: { status: "blocked" },
    }),
    dispatchBatch: async () => [],
  };

  const executeDispatch = async (intent: FeedInteractionIntent): Promise<FeedInteractionPipelineEvent> => {
    const envelope: FeedInteractionEnvelope = {
      id: nextEnvelopeId,
      dispatchedAtMs: runtime.now(),
      intent,
    };
    nextEnvelopeId += 1;

    let reachedHandlerStage = false;
    let outcome: FeedInteractionOutcome = { status: "blocked" };

    const invokeHandler = async () => {
      reachedHandlerStage = true;
      const handler = handlers[envelope.intent.type] as FeedInteractionHandler | undefined;
      if (!handler) {
        outcome = { status: "unhandled" };
        return;
      }
      const result = await handler(envelope.intent, api);
      outcome = { status: "handled", result };
    };

    let runChain = invokeHandler;
    for (let index = middlewares.length - 1; index >= 0; index -= 1) {
      const middleware = middlewares[index];
      const next = runChain;
      runChain = () => Promise.resolve(middleware(envelope, api, next));
    }

    try {
      await runChain();
      if (!reachedHandlerStage) {
        outcome = { status: "blocked" };
      }
    } catch (error) {
      outcome = { status: "failed", error };
    }

    const event: FeedInteractionPipelineEvent = { envelope, outcome };

    if (event.outcome.status === "unhandled") {
      await config.onUnhandledIntent?.(event.envelope, api);
    }

    if (event.outcome.status === "failed") {
      await config.onDispatchError?.(event, api);
    }

    for (const effect of effects) {
      await effect(event, api);
    }

    return event;
  };

  api = {
    dispatch: executeDispatch,
    dispatchBatch: async (intents: FeedInteractionIntent[]) => {
      const events: FeedInteractionPipelineEvent[] = [];
      for (const intent of intents) {
        events.push(await executeDispatch(intent));
      }
      return events;
    },
  };

  return {
    dispatch: executeDispatch,
    dispatchBatch: api.dispatchBatch,
  };
}
