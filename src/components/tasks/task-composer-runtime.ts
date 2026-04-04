import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from "react";
import { useFeedComposerOptions } from "@/features/feed-page/views/feed-surface-context";
import {
  formatMentionIdentifierForDisplay,
  getMentionAliases,
  getPreferredMentionIdentifier,
} from "@/lib/mentions";
import type {
  Channel,
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

export interface TaskComposerChannelOption {
  id: string;
  name: string;
  isIncluded: boolean;
}

export interface TaskComposerMentionOption {
  id: string;
  pubkey: string;
  identifier: string;
  mentionDisplay: string;
  primaryLabel: string;
  avatar?: string;
  isSelected: boolean;
  aliases: string[];
}

export interface TaskComposerModel {
  channelOptions: TaskComposerChannelOption[];
  mentionOptions: TaskComposerMentionOption[];
  includedChannels: string[];
  selectedPeoplePubkeys: string[];
  channelIdByName: Map<string, string>;
  selectedPersonIdByPubkey: Map<string, string>;
  mentionOptionByPubkey: Map<string, TaskComposerMentionOption>;
  mentionOptionByAlias: Map<string, TaskComposerMentionOption>;
}

interface TaskComposerRuntimeContextValue {
  environment: ResolvedTaskComposerEnvironment;
  draftStorageKey?: string;
}

const defaultTaskComposerEnvironment: ResolvedTaskComposerEnvironment = {
  relays: [],
  channels: [],
  people: [],
  mentionablePeople: [],
  includedChannels: [],
  selectedPeoplePubkeys: [],
};

const TaskComposerRuntimeContext = createContext<TaskComposerRuntimeContextValue | null>(null);

export function TaskComposerRuntimeProvider({
  value,
  children,
}: PropsWithChildren<{ value: TaskComposerRuntimeContextValue }>) {
  return createElement(TaskComposerRuntimeContext.Provider, { value }, children);
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
  const runtimeContext = useContext(TaskComposerRuntimeContext);
  const fallbackEnvironment = useResolvedTaskComposerEnvironment(fallback ?? defaultTaskComposerEnvironment);
  return runtimeContext?.environment ?? fallbackEnvironment;
}

export function useTaskComposerDraftStorageKey() {
  return useContext(TaskComposerRuntimeContext)?.draftStorageKey;
}

export function useTaskComposerModel(fallback?: {
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
}): TaskComposerModel {
  const environment = useTaskComposerEnvironment(fallback);

  return useMemo(() => {
    const channelOptions = environment.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      isIncluded: channel.filterState === "included",
    }));

    const mentionOptions = environment.people.map((person) => {
      const identifier = getPreferredMentionIdentifier(person);
      const primaryLabel = (person.name || person.displayName || "").trim()
        || formatMentionIdentifierForDisplay(identifier);
      return {
        id: person.id,
        pubkey: person.id.trim().toLowerCase(),
        identifier,
        mentionDisplay: formatMentionIdentifierForDisplay(identifier),
        primaryLabel,
        avatar: person.avatar,
        isSelected: person.isSelected,
        aliases: getMentionAliases(person),
      };
    });

    const channelIdByName = new Map(
      channelOptions.map((channel) => [channel.name.trim().toLowerCase(), channel.id] as const)
    );
    const selectedPersonIdByPubkey = new Map(
      mentionOptions
        .filter((person) => person.isSelected)
        .map((person) => [person.pubkey, person.id] as const)
    );
    const mentionOptionByPubkey = new Map(
      mentionOptions.map((person) => [person.pubkey, person] as const)
    );
    const mentionOptionByAlias = new Map<string, TaskComposerMentionOption>();
    for (const person of mentionOptions) {
      for (const alias of person.aliases) {
        mentionOptionByAlias.set(alias, person);
      }
    }

    return {
      channelOptions,
      mentionOptions,
      includedChannels: environment.includedChannels,
      selectedPeoplePubkeys: environment.selectedPeoplePubkeys,
      channelIdByName,
      selectedPersonIdByPubkey,
      mentionOptionByPubkey,
      mentionOptionByAlias,
    };
  }, [environment]);
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
  allowFeedMessageTypes,
}: {
  draftStorageKey?: string;
  defaultContent: string;
  defaultDueDate?: Date;
  allowFeedMessageTypes: boolean;
}): TaskComposerInitialState {
  const draftState = draftStorageKey ? readTaskComposerDraft(draftStorageKey) : null;

  return {
    content: draftState?.content ?? defaultContent,
    taskType: resolveInitialTaskType(draftState, allowFeedMessageTypes),
    dueDate: parseDraftDueDate(draftState?.dueDate) ?? defaultDueDate,
    dueTime: draftState?.dueTime || "",
    dateType: draftState?.dateType || "due",
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

export function isWritableRelay(relay: { connectionStatus?: string } | undefined): boolean {
  return relay?.connectionStatus === undefined || relay.connectionStatus === "connected";
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
