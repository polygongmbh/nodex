import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from "react";
import { useFeedComposerOptions } from "@/features/feed-page/views/feed-surface-context";
import type {
  Channel,
  ComposeRestoreRequest,
  Nip99Metadata,
  PostType,
  PublishedAttachment,
  Relay,
  TaskDateType,
} from "@/types";
import type { Person } from "@/types/person";

export interface TaskComposerDraftState {
  content?: string;
  taskType?: PostType;
  messageType?: PostType;
  dueDate?: string;
  dueTime?: string;
  dateType?: TaskDateType;
  selectedRelays?: string[];
  explicitMentionPubkeys?: string[];
  explicitTagNames?: string[];
  priority?: number;
  attachments?: PublishedAttachment[];
  nip99?: Nip99Metadata;
  locationGeohash?: string;
}

export interface TaskComposerInitialState {
  content: string;
  taskType: PostType;
  dueDate?: Date;
  dueTime: string;
  dateType: TaskDateType;
  selectedRelays: string[];
  explicitMentionPubkeys: string[];
  explicitTagNames: string[];
  priority?: number;
  attachments: PublishedAttachment[];
  nip99: Nip99Metadata;
  locationGeohash?: string;
}

export interface ResolvedTaskComposerEnvironment {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  mentionablePeople: Person[];
  includedChannels: string[];
  selectedPeoplePubkeys: string[];
}

const defaultTaskComposerEnvironment: ResolvedTaskComposerEnvironment = {
  relays: [],
  channels: [],
  people: [],
  mentionablePeople: [],
  includedChannels: [],
  selectedPeoplePubkeys: [],
};

const TaskComposerEnvironmentContext = createContext<ResolvedTaskComposerEnvironment | null>(null);

export function TaskComposerEnvironmentProvider({
  value,
  children,
}: PropsWithChildren<{ value: ResolvedTaskComposerEnvironment }>) {
  return createElement(TaskComposerEnvironmentContext.Provider, { value }, children);
}

export function useResolvedTaskComposerEnvironment({
  relays,
  channels,
  people,
}: {
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
}): ResolvedTaskComposerEnvironment {
  const composerOptions = useFeedComposerOptions();
  const resolvedRelays = relays ?? composerOptions.relays;
  const resolvedChannels = channels ?? composerOptions.channels;
  const resolvedPeople = people ?? composerOptions.people;
  const mentionablePeople = people ?? composerOptions.mentionablePeople ?? resolvedPeople;

  return useMemo(
    () => ({
      relays: resolvedRelays,
      channels: resolvedChannels,
      people: resolvedPeople,
      mentionablePeople,
      includedChannels: resolvedChannels
        .filter((channel) => channel.filterState === "included")
        .map((channel) => channel.name.trim().toLowerCase())
        .filter(Boolean),
      selectedPeoplePubkeys: resolvedPeople
        .filter((person) => person.isSelected)
        .map((person) => person.id.trim().toLowerCase())
        .filter((value) => /^[a-f0-9]{64}$/i.test(value)),
    }),
    [mentionablePeople, resolvedChannels, resolvedPeople, resolvedRelays]
  );
}

export function useTaskComposerEnvironment(fallback?: {
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
}): ResolvedTaskComposerEnvironment {
  const providedEnvironment = useContext(TaskComposerEnvironmentContext);
  const fallbackEnvironment = useResolvedTaskComposerEnvironment(fallback ?? defaultTaskComposerEnvironment);
  return providedEnvironment ?? fallbackEnvironment;
}

export function readTaskComposerDraft(key: string): TaskComposerDraftState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskComposerDraftState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseDraftDueDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function resolveInitialTaskType(
  draftState: TaskComposerDraftState | null,
  allowFeedMessageTypes: boolean
): PostType {
  const draftMessageType = draftState?.messageType;
  if (draftMessageType === "task" || draftMessageType === "comment") {
    return draftMessageType;
  }
  if (allowFeedMessageTypes && (draftMessageType === "offer" || draftMessageType === "request")) {
    return draftMessageType;
  }
  return draftState?.taskType === "comment" ? "comment" : "task";
}

export function resolveTaskComposerInitialState({
  draftStorageKey,
  defaultContent,
  defaultDueDate,
  relays,
  allowFeedMessageTypes,
}: {
  draftStorageKey?: string;
  defaultContent: string;
  defaultDueDate?: Date;
  relays: Relay[];
  allowFeedMessageTypes: boolean;
}): TaskComposerInitialState {
  const draftState = draftStorageKey ? readTaskComposerDraft(draftStorageKey) : null;

  return {
    content: draftState?.content ?? defaultContent,
    taskType: resolveInitialTaskType(draftState, allowFeedMessageTypes),
    dueDate: parseDraftDueDate(draftState?.dueDate) ?? defaultDueDate,
    dueTime: draftState?.dueTime || "",
    dateType: draftState?.dateType || "due",
    selectedRelays:
      draftState?.selectedRelays?.filter((id): id is string => typeof id === "string")
      ?? relays
        .filter((relay) => relay.isActive && (relay.connectionStatus === undefined || relay.connectionStatus === "connected"))
        .map((relay) => relay.id),
    explicitTagNames:
      draftState?.explicitTagNames
        ?.filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      ?? [],
    explicitMentionPubkeys:
      draftState?.explicitMentionPubkeys
        ?.filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[a-f0-9]{64}$/i.test(value))
      ?? [],
    priority: draftState?.priority,
    attachments: draftState?.attachments || [],
    nip99: { ...(draftState?.nip99 || {}) },
    locationGeohash: draftState?.locationGeohash,
  };
}

export function writeTaskComposerDraft(key: string, state: TaskComposerDraftState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore persistence errors.
  }
}

export function clearTaskComposerDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore persistence errors.
  }
}

export function resolveTaskComposerMention(mentionRequest: { mention: string; id: number } | null) {
  if (!mentionRequest?.mention) return null;
  return {
    id: mentionRequest.id,
    mention: mentionRequest.mention.startsWith("@")
      ? mentionRequest.mention
      : `@${mentionRequest.mention}`,
  };
}

export function getTaskComposerRestoreMessageType(
  request: ComposeRestoreRequest | null,
  allowComment: boolean,
  allowFeedMessageTypes: boolean
): PostType {
  const requestedMessageType = request?.state.messageType;
  if (
    allowFeedMessageTypes &&
    (requestedMessageType === "offer" || requestedMessageType === "request")
  ) {
    return requestedMessageType;
  }
  return allowComment && request?.state.taskType === "comment" ? "comment" : "task";
}
