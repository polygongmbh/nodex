import { create } from "zustand";
import type { ComposeRestoreRequest } from "@/types";

export interface MentionRequest {
  mention: string;
  id: number;
}

type AckById = (requestId: number) => void;

export interface KanbanComposerHint {
  columnSelector: "firstActive";
  id: number;
}

interface ComposerSignalsState {
  mentionRequest: MentionRequest | null;
  composeRestoreRequest: ComposeRestoreRequest | null;
  composeGuideActivationSignal: number;
  forceShowComposer: boolean;
  kanbanComposerHint: KanbanComposerHint | null;
  onMentionRequestConsumed: AckById;
  onComposeRestoreRequestConsumed: AckById;
  setMentionRequest: (value: MentionRequest | null) => void;
  setComposeRestoreRequest: (value: ComposeRestoreRequest | null) => void;
  setComposeGuideActivationSignal: (value: number) => void;
  setForceShowComposer: (value: boolean) => void;
  requestKanbanComposer: (selector: KanbanComposerHint["columnSelector"]) => void;
  clearKanbanComposerHint: (id: number) => void;
  setMentionRequestAck: (ack: AckById) => void;
  setComposeRestoreRequestAck: (ack: AckById) => void;
}

const noop: AckById = () => {};

/**
 * Short-lived signals routed from Index producers to composer leaves.
 *
 * Owners (push side, all in Index via effects):
 * - `useChannelFilterController` → `mentionRequest`
 * - `useTaskPublishFlow` → `composeRestoreRequest`
 * - `useOnboarding` → `forceShowComposer`, `composeGuideActivationSignal`
 *
 * Consumers (read side) subscribe via the selector hooks below. Each
 * signal carries a request id; consumers acknowledge by clearing the
 * value (or by calling the producer's existing `…Consumed` callback —
 * routed via the relevant controller hook, not this store).
 */
let nextKanbanComposerHintId = 1;

export const useComposerSignalsStore = create<ComposerSignalsState>((set, get) => ({
  mentionRequest: null,
  composeRestoreRequest: null,
  composeGuideActivationSignal: 0,
  forceShowComposer: false,
  kanbanComposerHint: null,
  onMentionRequestConsumed: noop,
  onComposeRestoreRequestConsumed: noop,
  setMentionRequest: (value) => set({ mentionRequest: value }),
  setComposeRestoreRequest: (value) => set({ composeRestoreRequest: value }),
  setComposeGuideActivationSignal: (value) => set({ composeGuideActivationSignal: value }),
  setForceShowComposer: (value) => set({ forceShowComposer: value }),
  requestKanbanComposer: (selector) =>
    set({ kanbanComposerHint: { columnSelector: selector, id: nextKanbanComposerHintId++ } }),
  clearKanbanComposerHint: (id) => {
    if (get().kanbanComposerHint?.id === id) set({ kanbanComposerHint: null });
  },
  setMentionRequestAck: (ack) => set({ onMentionRequestConsumed: ack }),
  setComposeRestoreRequestAck: (ack) => set({ onComposeRestoreRequestConsumed: ack }),
}));

export const useMentionSignal = () =>
  useComposerSignalsStore((s) => s.mentionRequest);

export const useMentionRequestConsumedHandler = () =>
  useComposerSignalsStore((s) => s.onMentionRequestConsumed);

export const useComposeRestoreSignal = () =>
  useComposerSignalsStore((s) => s.composeRestoreRequest);

export const useComposeRestoreRequestConsumedHandler = () =>
  useComposerSignalsStore((s) => s.onComposeRestoreRequestConsumed);

export const useOnboardingComposerSignal = () =>
  useComposerSignalsStore((s) => s.forceShowComposer);

export const useComposeGuideActivationSignal = () =>
  useComposerSignalsStore((s) => s.composeGuideActivationSignal);

export const useKanbanComposerHint = () =>
  useComposerSignalsStore((s) => s.kanbanComposerHint);

export const useClearKanbanComposerHint = () =>
  useComposerSignalsStore((s) => s.clearKanbanComposerHint);
