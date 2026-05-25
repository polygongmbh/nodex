import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from "react";
import { useFeedComposerOptions } from "@/features/feed-page/views/feed-surface-context";
import { hasComposerSubstance } from "@/lib/composer-content";
import {
  formatMentionIdentifierForDisplay,
  getMentionAliases,
  getPreferredMentionIdentifier,
} from "@/lib/mentions";
import type {
  Channel,
  ComposeRecomposeOf,
  ComposeRestoreRequest,
  ComposerDraft,
  Nip99Metadata,
  PostType,
  PublishedAttachment,
  Relay,
  TaskDateType,
  TitledPostFields,
} from "@/types";
import type { Person, SelectablePerson } from "@/types/person";

/**
 * Serialized on-disk shape. Dates are ISO strings, optionals reflect "may be
 * absent from older drafts" — `deserializeDraft` applies defaults.
 */
interface PersistedComposerDraft {
  content: string;
  postType: PostType;
  savedAt: string;
  dueDate?: string;
  dueTime?: string;
  dateType?: TaskDateType;
  endDate?: string;
  endTime?: string;
  titledPost?: TitledPostFields;
  nip99?: Nip99Metadata;
  locationGeohash?: string;
  attachments?: PublishedAttachment[];
  /** Stored priority (0-100 scale). */
  priority?: number;
  explicitTagNames?: string[];
  explicitMentionPubkeys?: string[];
  recomposeOf?: ComposeRecomposeOf;
  selectedRelays?: string[];
}

export interface ResolvedTaskComposerEnvironment {
  relays: Relay[];
  channels: Channel[];
  people: SelectablePerson[];
  mentionablePeople: SelectablePerson[];
  includedChannels: string[];
  selectedPeoplePubkeys: string[];
}

export interface TaskComposerMentionOption {
  pubkey: string;
  identifier: string;
  mentionDisplay: string;
  primaryLabel: string;
  avatar?: string;
  isSelected: boolean;
  aliases: string[];
}

export interface TaskComposerModel {
  channelOptions: Channel[];
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
const TASK_COMPOSER_STALE_DRAFT_MAX_AGE_MS = 1000 * 60 * 60; // 1 hour

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
  people?: SelectablePerson[];
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
        .map((person) => person.pubkey.trim().toLowerCase())
        .filter((value) => /^[a-f0-9]{64}$/i.test(value)),
    }),
    [mentionablePeople, resolvedChannels, resolvedPeople, resolvedRelays]
  );
}

export function useTaskComposerEnvironment(): ResolvedTaskComposerEnvironment {
  const runtimeContext = useContext(TaskComposerRuntimeContext);
  const fallbackEnvironment = useResolvedTaskComposerEnvironment(defaultTaskComposerEnvironment);
  return runtimeContext?.environment ?? fallbackEnvironment;
}

export function useTaskComposerDraftStorageKey() {
  return useContext(TaskComposerRuntimeContext)?.draftStorageKey;
}

export function useTaskComposerModel(): TaskComposerModel {
  const environment = useTaskComposerEnvironment();

  return useMemo(() => {
    const channelOptions = environment.channels;

    const mentionOptions = environment.people.map((person) => {
      const identifier = getPreferredMentionIdentifier(person);
      const primaryLabel = (person.name || person.displayName || "").trim()
        || formatMentionIdentifierForDisplay(identifier);
      return {
        pubkey: person.pubkey,
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
        .map((person) => [person.pubkey, person.pubkey] as const)
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

function parseDraftDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readPersistedDraft(key: string): PersistedComposerDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedComposerDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.content !== "string" || typeof parsed.postType !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPersistedDraftStale(persisted: PersistedComposerDraft): boolean {
  const savedAtMs = new Date(persisted.savedAt).getTime();
  if (Number.isNaN(savedAtMs)) return true;
  return Date.now() - savedAtMs > TASK_COMPOSER_STALE_DRAFT_MAX_AGE_MS;
}

function resolveInitialPostType(
  persisted: PersistedComposerDraft | null,
  allowFeedMessageTypes: boolean,
  defaultPostType?: PostType
): PostType {
  // An explicit defaultPostType (e.g. from "Add Event" on the calendar) is a
  // direct user gesture and wins over any persisted draft mode, so the button
  // the user just clicked actually decides what they're composing.
  if (defaultPostType) {
    if (defaultPostType === "task" || defaultPostType === "comment") return defaultPostType;
    if (allowFeedMessageTypes) return defaultPostType;
  }
  const draftPostType = persisted?.postType;
  if (draftPostType === "task" || draftPostType === "comment") return draftPostType;
  if (allowFeedMessageTypes && (draftPostType === "listing" || draftPostType === "event")) {
    return draftPostType;
  }
  return "task";
}

function emptyDraft(
  content: string,
  postType: PostType,
  defaultDueDate?: Date
): ComposerDraft {
  return {
    content,
    postType,
    dueDate: defaultDueDate,
    dueTime: "",
    dateType: "due",
    endTime: "",
    titledPost: {},
    nip99: {},
    attachments: [],
    explicitTagNames: [],
    explicitMentionPubkeys: [],
  };
}

/**
 * Deserialize a persisted draft into the in-memory shape, applying defaults
 * and converting stored priority back to the display tier (1-5).
 */
function deserializeDraft(
  persisted: PersistedComposerDraft,
  postType: PostType,
  displayPriorityFromStored: (stored?: number) => number | undefined,
  defaultDueDate?: Date
): ComposerDraft {
  return {
    content: persisted.content,
    postType,
    dueDate: parseDraftDate(persisted.dueDate) ?? defaultDueDate,
    dueTime: persisted.dueTime || "",
    dateType: persisted.dateType || "due",
    endDate: parseDraftDate(persisted.endDate),
    endTime: persisted.endTime || "",
    titledPost: { ...(persisted.titledPost || {}) },
    nip99: { ...(persisted.nip99 || {}) },
    locationGeohash: persisted.locationGeohash,
    attachments: persisted.attachments || [],
    priority: displayPriorityFromStored(persisted.priority),
    explicitTagNames: (persisted.explicitTagNames || [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    explicitMentionPubkeys: (persisted.explicitMentionPubkeys || [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/i.test(value)),
    recomposeOf: persisted.recomposeOf,
    selectedRelays: persisted.selectedRelays,
  };
}

function serializeDraft(
  draft: ComposerDraft,
  storedPriorityFromDisplay: (display?: number) => number | undefined
): PersistedComposerDraft {
  return {
    content: draft.content,
    postType: draft.postType,
    savedAt: new Date().toISOString(),
    dueDate: draft.dueDate?.toISOString(),
    dueTime: draft.dueTime || undefined,
    dateType: draft.dateType,
    endDate: draft.endDate?.toISOString(),
    endTime: draft.endTime || undefined,
    titledPost: draft.titledPost,
    nip99: draft.nip99,
    locationGeohash: draft.locationGeohash,
    attachments: draft.attachments,
    priority: storedPriorityFromDisplay(draft.priority),
    explicitTagNames: draft.explicitTagNames,
    explicitMentionPubkeys: draft.explicitMentionPubkeys,
    recomposeOf: draft.recomposeOf,
    selectedRelays: draft.selectedRelays,
  };
}

export function resolveTaskComposerInitialState({
  draftStorageKey,
  defaultContent,
  defaultDueDate,
  allowFeedMessageTypes,
  defaultPostType,
  displayPriorityFromStored,
}: {
  draftStorageKey?: string;
  defaultContent: string;
  defaultDueDate?: Date;
  allowFeedMessageTypes: boolean;
  defaultPostType?: PostType;
  displayPriorityFromStored: (stored?: number) => number | undefined;
}): ComposerDraft {
  const persisted = draftStorageKey ? readPersistedDraft(draftStorageKey) : null;
  // Drafts must have real user-entered substance (text, attachments, or NIP-99
  // metadata) to be eligible. Auxiliary state alone — a seeded due date,
  // priority, channels, or location — must not leak from a previous context
  // (like the calendar view) into a fresh composer elsewhere.
  const substantive =
    persisted &&
    hasComposerSubstance({
      content: persisted.content,
      attachments: persisted.attachments,
      nip99: persisted.nip99,
    })
      ? persisted
      : null;
  const postType = resolveInitialPostType(substantive, allowFeedMessageTypes, defaultPostType);
  if (!substantive) return emptyDraft(defaultContent, postType, defaultDueDate);
  const restored = deserializeDraft(substantive, postType, displayPriorityFromStored, defaultDueDate);
  // For stale drafts, the user's text/attachments/listing details are still
  // worth keeping — those are the "core" content — but auxiliary state (date,
  // location, tags/mentions, recompose intent, selected relays) is dropped so
  // it can't leak across long gaps.
  if (isPersistedDraftStale(substantive)) {
    restored.dueDate = defaultDueDate;
    restored.dueTime = "";
    restored.dateType = "due";
    restored.endDate = undefined;
    restored.endTime = "";
    restored.titledPost = {};
    restored.locationGeohash = undefined;
    restored.explicitTagNames = [];
    restored.explicitMentionPubkeys = [];
    restored.recomposeOf = undefined;
    restored.selectedRelays = undefined;
  }
  return restored;
}

export function clearTaskComposerDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore persistence errors.
  }
}

/**
 * Persist a substantive draft, or clear storage when the draft has no
 * user-entered substance (text/attachments/nip99).
 */
export function persistTaskComposerDraft(
  key: string,
  draft: ComposerDraft,
  storedPriorityFromDisplay: (display?: number) => number | undefined
) {
  if (
    !hasComposerSubstance({
      content: draft.content,
      attachments: draft.attachments,
      nip99: draft.nip99,
    })
  ) {
    clearTaskComposerDraft(key);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(serializeDraft(draft, storedPriorityFromDisplay)));
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

export function getTaskComposerRestorePostType(
  request: ComposeRestoreRequest | null,
  allowComment: boolean,
  allowFeedMessageTypes: boolean
): PostType {
  const requested = request?.state.postType;
  if (allowFeedMessageTypes && (requested === "listing" || requested === "event")) {
    return requested;
  }
  return allowComment && requested === "comment" ? "comment" : "task";
}
