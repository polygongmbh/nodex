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

export interface UseFeedInteractionFrecencyResult {
  channelFrecencyState: ChannelFrecencyState;
  personFrecencyState: PersonFrecencyState;
  bumpChannelFrecency: (tag: string, weight?: number) => void;
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

  const bumpChannelFrecency = useCallback((tag: string, weight = 1) => {
    setChannelFrecencyState((previous) => recordChannelInteraction(previous, tag, weight));
  }, []);

  const bumpPersonFrecency = useCallback((personId: string, weight = 1) => {
    setPersonFrecencyState((previous) => recordPersonInteraction(previous, personId, weight));
  }, []);

  const interactionEffects = useMemo<FeedInteractionEffect[]>(
    () => [
      async (event) => {
        if (event.outcome.status !== "handled") return;

        switch (event.envelope.intent.type) {
          case "filter.applyHashtagExclusive":
            bumpChannelFrecency(event.envelope.intent.tag, 1.9);
            return;
          case "sidebar.channel.toggle":
            bumpChannelFrecency(event.envelope.intent.channelId, 1.25);
            return;
          case "sidebar.channel.exclusive":
            bumpChannelFrecency(event.envelope.intent.channelId, 1.6);
            return;
          case "filter.applyAuthorExclusive":
            bumpPersonFrecency(event.envelope.intent.author.id, 1.9);
            return;
          case "sidebar.person.toggle":
            bumpPersonFrecency(event.envelope.intent.personId, 1.25);
            return;
          case "sidebar.person.exclusive":
            bumpPersonFrecency(event.envelope.intent.personId, 1.6);
            return;
          default:
            return;
        }
      },
    ],
    [bumpChannelFrecency, bumpPersonFrecency]
  );

  return {
    channelFrecencyState,
    personFrecencyState,
    bumpChannelFrecency,
    interactionEffects,
  };
}
