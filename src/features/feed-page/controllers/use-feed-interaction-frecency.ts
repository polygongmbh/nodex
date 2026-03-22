import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeedInteractionEffect } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import {
  loadChannelFrecencyState,
  recordChannelInteraction,
  saveChannelFrecencyState,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import {
  loadPersonFrecencyState,
  recordPersonInteraction,
  savePersonFrecencyState,
  type PersonFrecencyState,
} from "@/lib/person-frecency";

export type FeedInteractionFrecencyIntent =
  | { type: "channel.bump"; tag: string; weight?: number }
  | { type: "person.bump"; personId: string; weight?: number };

export interface UseFeedInteractionFrecencyResult {
  channelFrecencyState: ChannelFrecencyState;
  personFrecencyState: PersonFrecencyState;
  dispatchFrecencyIntent: (intent: FeedInteractionFrecencyIntent) => void;
  interactionEffects: FeedInteractionEffect[];
}

export function useFeedInteractionFrecency(): UseFeedInteractionFrecencyResult {
  const [channelFrecencyState, setChannelFrecencyState] = useState<ChannelFrecencyState>(
    () => loadChannelFrecencyState()
  );
  const [personFrecencyState, setPersonFrecencyState] = useState<PersonFrecencyState>(
    () => loadPersonFrecencyState()
  );

  useEffect(() => {
    saveChannelFrecencyState(channelFrecencyState);
  }, [channelFrecencyState]);

  useEffect(() => {
    savePersonFrecencyState(personFrecencyState);
  }, [personFrecencyState]);

  const dispatchFrecencyIntent = useCallback((intent: FeedInteractionFrecencyIntent) => {
    switch (intent.type) {
      case "channel.bump":
        setChannelFrecencyState((previous) =>
          recordChannelInteraction(previous, intent.tag, intent.weight ?? 1)
        );
        return;
      case "person.bump":
        setPersonFrecencyState((previous) =>
          recordPersonInteraction(previous, intent.personId, intent.weight ?? 1)
        );
        return;
    }
  }, []);

  const interactionEffects = useMemo<FeedInteractionEffect[]>(
    () => [
      async (event) => {
        if (event.outcome.status !== "handled") return;

        switch (event.envelope.intent.type) {
          case "filter.applyHashtagExclusive":
            dispatchFrecencyIntent({
              type: "channel.bump",
              tag: event.envelope.intent.tag,
              weight: 1.9,
            });
            return;
          case "sidebar.channel.toggle":
            dispatchFrecencyIntent({
              type: "channel.bump",
              tag: event.envelope.intent.channelId,
              weight: 1.25,
            });
            return;
          case "sidebar.channel.exclusive":
            dispatchFrecencyIntent({
              type: "channel.bump",
              tag: event.envelope.intent.channelId,
              weight: 1.6,
            });
            return;
          case "filter.applyAuthorExclusive":
            dispatchFrecencyIntent({
              type: "person.bump",
              personId: event.envelope.intent.author.id,
              weight: 1.9,
            });
            return;
          case "sidebar.person.toggle":
            dispatchFrecencyIntent({
              type: "person.bump",
              personId: event.envelope.intent.personId,
              weight: 1.25,
            });
            return;
          case "sidebar.person.exclusive":
            dispatchFrecencyIntent({
              type: "person.bump",
              personId: event.envelope.intent.personId,
              weight: 1.6,
            });
            return;
          default:
            return;
        }
      },
    ],
    [dispatchFrecencyIntent]
  );

  return {
    channelFrecencyState,
    personFrecencyState,
    dispatchFrecencyIntent,
    interactionEffects,
  };
}
