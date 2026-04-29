import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { Search, X, Hash, Radio, Users, Check, Minus, Calendar, Clock, MessageSquare, CheckSquare, Send, LogIn, Paperclip, Package, HandHelping, MapPin, AlertTriangle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import {   Relay, Channel, TaskCreateResult, TaskDateType, ComposeRestoreRequest, ComposeAttachment, PublishedAttachment, Nip99Metadata, FeedMessageType } from "@/types";
import type { Person } from "@/types/person";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  formatMentionIdentifierForDisplay,
  getPreferredMentionIdentifier,
  personMatchesMentionQuery,
} from "@/lib/mentions";
import { hasMeaningfulComposerText } from "@/lib/composer-content";
import { UserAvatar } from "@/components/ui/user-avatar";
import { notifyNeedTag, notifyTaskCreationFailed } from "@/lib/notifications";
import {
  isAlternateSubmitKey,
  isAutocompleteAcceptKey,
  isMetadataOnlyAutocompleteClick,
  isMetadataOnlyAutocompleteKey,
  isPrimarySubmitKey,
} from "@/lib/composer-shortcuts";
import { getAttachmentMaxFileSizeBytes, isAttachmentUploadConfigured, uploadAttachment } from "@/lib/nostr/nip96-attachment-upload";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { featureDebugLog } from "@/lib/feature-debug";
import { generateLocalImageCaption, notifyAutoCaptionFailureOnce } from "@/lib/local-image-caption";
import { DEFAULT_GEOHASH_PRECISION, encodeGeohash, normalizeGeohash } from "@/infrastructure/nostr/geohash-location";
import {
  countHashtagsInContent,
  extractCommittedHashtags,
  extractHashtagsFromContent,
  getHashtagQueryAtCursor,
} from "@/lib/hashtags";
import {
  filterChannelsForAutocomplete,
  getComposerAutocompleteMatch,
  hasMentionQueryAtCursor,
} from "@/lib/composer-autocomplete";
import { resolveComposeSubmitBlock } from "@/lib/compose-submit-block";
import { buildComposerPlaceholder } from "@/lib/composer-placeholder";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { PrioritySelect } from "@/components/tasks/TaskMetadataEditors";
import { TaskDateTypeSelect } from "@/components/tasks/TaskDateTypeSelect";
import {
  DISPLAY_PRIORITY_OPTIONS,
  displayPriorityFromStored,
  storedPriorityFromDisplay,
} from "@/domain/content/task-priority";
import { getCompactPersonLabel, getPersonDisplayName } from "@/types/person";
import {
  isWritableRelay,
  resolveTaskComposerInitialState,
  persistTaskComposerDraft,
} from "@/components/tasks/task-composer-runtime";
import { resolveEffectiveWritableRelayIds } from "@/lib/nostr/task-relay-routing";
import { resolveRelayIcon } from "@/infrastructure/nostr/relay-icon";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

interface UnifiedBottomBarProps {
  searchQuery?: string;
  currentView: ViewType;
  focusedTaskId?: string | null;
  selectedCalendarDate?: Date | null;
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
  // Default content for composing
  defaultContent?: string;
  canCreateContent: boolean;
  forceComposeMode?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

type SelectorType = "relay" | "channel" | "person" | "date" | null;

const getMonthKey = (month: Date) => format(startOfMonth(month), "yyyy-MM");
const NIP99_TITLE_MAX_LENGTH = 80;
const COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO = 0.5;

function normalizeListingTextFromContent(content: string): string {
  return content
    .replace(/(^|\s)#\w+/g, " ")
    .replace(/(^|\s)@[^\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWordSafe(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength).trim();
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated;
}

export function UnifiedBottomBar({
  searchQuery: searchQueryProp,
  currentView,
  focusedTaskId = null,
  selectedCalendarDate = null,
  relays: relaysProp,
  channels: channelsProp,
  people: peopleProp,
  defaultContent = "",
  canCreateContent,
  composeRestoreRequest = null,
}: UnifiedBottomBarProps) {
  const { t, i18n } = useTranslation("composer");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const surface = useFeedSurfaceState();
  const { allTasks } = useFeedTaskViewModel();
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.visibleChannels ?? surface.channels;
  const people = peopleProp ?? surface.people;
  const visiblePeople = peopleProp ?? surface.visiblePeople ?? surface.people;
  const searchQuery = searchQueryProp ?? surface.searchQuery;
  const dispatchSearchChange = useCallback(
    (query: string) => {
      void dispatchFeedInteraction({ type: "ui.search.change", query });
    },
    [dispatchFeedInteraction]
  );
  const { createHttpAuthHeader } = useNDK();
  const includedChannels = channels.filter((c) => c.filterState === "included").map((c) => c.name);
  const contextTaskTitle = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)?.content ?? ""
    : "";
  const composerPlaceholder = useMemo(() => {
    const mentionLabels = people.filter((person) => person.isSelected).map((person) => getCompactPersonLabel(person));
    return buildComposerPlaceholder({
      baseKey: "composer.placeholders.mobileSearchCreatePosts",
      contextTaskTitle,
      channelNames: includedChannels,
      mentionLabels,
      locale: i18n.resolvedLanguage || i18n.language || "en",
      t,
    });
  }, [contextTaskTitle, i18n.language, i18n.resolvedLanguage, includedChannels, people, t]);
  const initialComposerStateRef = useRef<ReturnType<typeof resolveTaskComposerInitialState> | null>(null);
  if (initialComposerStateRef.current === null) {
    initialComposerStateRef.current = resolveTaskComposerInitialState({
      draftStorageKey: COMPOSE_DRAFT_STORAGE_KEY,
      defaultContent: searchQuery || defaultContent,
      allowFeedMessageTypes: true,
    });
  }
  const initialComposerState = initialComposerStateRef.current;
  const [sharedText, setSharedText] = useState(initialComposerState.content);
  const [activeSelector, setActiveSelector] = useState<SelectorType>(null);
  const [isBottomBarFocused, setIsBottomBarFocused] = useState(false);
  const [isBottomBarInteracting, setIsBottomBarInteracting] = useState(false);
  const [isComposeFocused, setIsComposeFocused] = useState(false);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [activeHashtagIndex, setActiveHashtagIndex] = useState(0);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dueDate, setDueDate] = useState<Date | undefined>(initialComposerState.dueDate);
  const [dueTime, setDueTime] = useState(initialComposerState.dueTime);
  const [dateType, setDateType] = useState<TaskDateType>(initialComposerState.dateType);
  const [priority, setPriority] = useState<number | undefined>(
    typeof initialComposerState.priority === "number"
      ? displayPriorityFromStored(initialComposerState.priority)
      : undefined
  );
  const [explicitTagNames, setExplicitTagNames] = useState<string[]>(initialComposerState.explicitTagNames);
  const [explicitMentionPubkeys, setExplicitMentionPubkeys] = useState<string[]>(
    initialComposerState.explicitMentionPubkeys
  );
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(() =>
    (initialComposerState.attachments || []).map((attachment, index) => ({
      id: `restored-draft-${index}`,
      fileName: attachment.name || attachment.url,
      status: "uploaded" as const,
      source: "url" as const,
      ...attachment,
    }))
  );
  const [locationGeohash, setLocationGeohash] = useState<string | undefined>(
    normalizeGeohash(initialComposerState.locationGeohash)
  );
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [highlightedTarget, setHighlightedTarget] = useState<"input" | "attachments" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<HTMLDivElement | null>(null);
  const attachmentFileRef = useRef<Record<string, File>>({});
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const cursorPositionRef = useRef(0);
  const prevSearchQueryRef = useRef(searchQuery);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const autoManagedChannelsRef = useRef<Set<string>>(new Set());
  const dateScrollerRef = useRef<HTMLDivElement | null>(null);
  const dateMonthRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dateLoadingRef = useRef(false);
  const datePrependCompensationRef = useRef<{ previousWidth: number } | null>(null);
  const [inlineDateMonths, setInlineDateMonths] = useState<Date[]>(() => {
    const anchor = startOfMonth(new Date());
    return [subMonths(anchor, 1), anchor, addMonths(anchor, 1)];
  });
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [isSendLaunching, setIsSendLaunching] = useState(false);
  const uploadEnabled = isAttachmentUploadConfigured();
  const attachmentMaxFileSizeBytes = getAttachmentMaxFileSizeBytes();
  const canOfferComment = currentView === "feed" || (currentView === "tree" && Boolean(focusedTaskId));
  const lastAppliedRestoreRequestIdRef = useRef<number | null>(null);
  const sendLaunchTimeoutRef = useRef<number | null>(null);
  const remediationHighlightTimeoutRef = useRef<number | null>(null);
  const trackedTimeoutIdsRef = useRef<Set<number>>(new Set());
  const trackedAnimationFrameIdsRef = useRef<Set<number>>(new Set());

  const clearTrackedTimeout = (handle: number | null | undefined) => {
    if (handle === null || handle === undefined) return;
    trackedTimeoutIdsRef.current.delete(handle);
    window.clearTimeout(handle);
  };

  const scheduleTrackedTimeout = (callback: () => void, delay: number) => {
    const handle = window.setTimeout(() => {
      trackedTimeoutIdsRef.current.delete(handle);
      callback();
    }, delay);
    trackedTimeoutIdsRef.current.add(handle);
    return handle;
  };

  const clearTrackedAnimationFrame = (handle: number | null | undefined) => {
    if (handle === null || handle === undefined) return;
    trackedAnimationFrameIdsRef.current.delete(handle);
    window.cancelAnimationFrame(handle);
  };

  const scheduleTrackedAnimationFrame = (callback: FrameRequestCallback) => {
    const handle = window.requestAnimationFrame((timestamp) => {
      trackedAnimationFrameIdsRef.current.delete(handle);
      callback(timestamp);
    });
    trackedAnimationFrameIdsRef.current.add(handle);
    return handle;
  };

  const syncChannelFiltersFromContent = (nextContent: string, previousContent: string) => {
    const endedWithSpace = /\s$/.test(nextContent);
    const removedText = nextContent.length < previousContent.length;
    if (!endedWithSpace && !removedText) return;

    const previousCommittedTags = new Set(extractCommittedHashtags(previousContent));
    const nextCommittedTags = new Set(extractCommittedHashtags(nextContent));
    const changedTagNames = new Set<string>([
      ...Array.from(previousCommittedTags).filter((tag) => !nextCommittedTags.has(tag)),
      ...Array.from(nextCommittedTags).filter((tag) => !previousCommittedTags.has(tag)),
    ]);

    if (changedTagNames.size === 0) return;

    const channelsByName = new Map(channels.map((channel) => [channel.name.toLowerCase(), channel]));
    for (const tagName of changedTagNames) {
      const channel = channelsByName.get(tagName);
      if (!channel) continue;
      const shouldBeIncluded = nextCommittedTags.has(tagName);

      if (shouldBeIncluded) {
        if (channel.filterState === "neutral") {
          void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
        } else if (channel.filterState === "excluded") {
          void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
          void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
        }
        continue;
      }

      if (channel.filterState === "included") {
        void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
        void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
      } else if (channel.filterState === "excluded") {
        void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
      }
    }
  };

  useEffect(() => {
    const trackedTimeoutIds = trackedTimeoutIdsRef.current;
    const trackedAnimationFrameIds = trackedAnimationFrameIdsRef.current;
    return () => {
      clearTrackedTimeout(sendLaunchTimeoutRef.current);
      sendLaunchTimeoutRef.current = null;
      clearTrackedTimeout(remediationHighlightTimeoutRef.current);
      remediationHighlightTimeoutRef.current = null;
      trackedTimeoutIds.forEach((handle) => window.clearTimeout(handle));
      trackedAnimationFrameIds.forEach((handle) => window.cancelAnimationFrame(handle));
      trackedTimeoutIds.clear();
      trackedAnimationFrameIds.clear();
    };
  }, []);

  useEffect(() => {
    if (prevSearchQueryRef.current === searchQuery) return;
    prevSearchQueryRef.current = searchQuery;
    setSharedText(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!composeRestoreRequest) return;
    if (lastAppliedRestoreRequestIdRef.current === composeRestoreRequest.id) return;
    lastAppliedRestoreRequestIdRef.current = composeRestoreRequest.id;
    const restoreState = composeRestoreRequest.state;
    setSharedText(restoreState.content || "");
    dispatchSearchChange(restoreState.content || "");
    setDueDate(restoreState.dueDate);
    setDueTime(restoreState.dueTime || "");
    setDateType(restoreState.dateType || "due");
    setPriority(displayPriorityFromStored(restoreState.priority));
    setAttachments(
      (restoreState.attachments || []).map((attachment, index) => ({
        id: `restore-${composeRestoreRequest.id}-${index}`,
        fileName: attachment.name || attachment.url,
        status: "uploaded",
        source: "url",
        ...attachment,
      }))
    );
    setExplicitTagNames(
      (restoreState.explicitTagNames || [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    );
    setExplicitMentionPubkeys(
      (restoreState.explicitMentionPubkeys || [])
        .map((pubkey) => pubkey.trim().toLowerCase())
        .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
    );
    setLocationGeohash(normalizeGeohash(restoreState.locationGeohash));
    setActiveSelector(null);
    setShowSendOptions(false);
    scheduleTrackedAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      cursorPositionRef.current = end;
    });
  }, [composeRestoreRequest, dispatchSearchChange]);

  // Persist composer draft to localStorage so reloads do not discard in-progress
  // text/attachments/metadata. Shares the storage key and write/clear semantics
  // with the desktop TaskComposer via persistTaskComposerDraft.
  useEffect(() => {
    const persistableAttachments = attachments
      .filter((attachment) => attachment.status === "uploaded" && attachment.url)
      .map((attachment) => ({
        url: attachment.url,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256,
        size: attachment.size,
        dimensions: attachment.dimensions,
        blurhash: attachment.blurhash,
        alt: attachment.alt,
        name: attachment.name || attachment.fileName,
      })) as PublishedAttachment[];
    persistTaskComposerDraft(
      COMPOSE_DRAFT_STORAGE_KEY,
      {
        content: sharedText,
        dueDate,
        dueTime,
        dateType,
        explicitTagNames,
        explicitMentionPubkeys,
        priority,
        locationGeohash,
        attachments: persistableAttachments,
      },
      storedPriorityFromDisplay
    );
  }, [
    sharedText,
    dueDate,
    dueTime,
    dateType,
    explicitTagNames,
    explicitMentionPubkeys,
    priority,
    locationGeohash,
    attachments,
  ]);


  useEffect(() => {
    if (currentView === "calendar") {
      setDueDate(selectedCalendarDate || new Date());
    }
  }, [currentView, selectedCalendarDate]);

  useEffect(() => {
    const scroller = dateScrollerRef.current;
    const pending = datePrependCompensationRef.current;
    if (!scroller || !pending) return;
    const addedWidth = scroller.scrollWidth - pending.previousWidth;
    if (addedWidth > 0) {
      scroller.scrollLeft += addedWidth;
    }
    datePrependCompensationRef.current = null;
    dateLoadingRef.current = false;
  }, [inlineDateMonths]);

  useEffect(() => {
    if (activeSelector !== "date") return;
    const targetMonth = startOfMonth(dueDate || new Date());
    const targetMonthTime = targetMonth.getTime();
    setInlineDateMonths((prev) => {
      if (prev.some((month) => startOfMonth(month).getTime() === targetMonthTime)) {
        return prev;
      }
      return [...prev, targetMonth].sort((a, b) => a.getTime() - b.getTime());
    });
    scheduleTrackedAnimationFrame(() => {
      const key = getMonthKey(targetMonth);
      dateMonthRefs.current[key]?.scrollIntoView({
        behavior: "auto",
        inline: "center",
        block: "nearest",
      });
    });
  }, [activeSelector, dueDate]);

  useEffect(() => {
    const scroller = dateScrollerRef.current;
    if (!scroller || activeSelector !== "date") return;

    const onScroll = () => {
      if (dateLoadingRef.current) return;
      const nearRight = scroller.scrollWidth - (scroller.scrollLeft + scroller.clientWidth) < 260;
      const nearLeft = scroller.scrollLeft < 160;

      if (nearRight) {
        dateLoadingRef.current = true;
        setInlineDateMonths((prev) => {
          const sorted = [...prev].sort((a, b) => a.getTime() - b.getTime());
          const last = sorted[sorted.length - 1] ?? startOfMonth(new Date());
          return [...sorted, addMonths(startOfMonth(last), 1)];
        });
        scheduleTrackedAnimationFrame(() => {
          dateLoadingRef.current = false;
        });
      }

      if (nearLeft) {
        dateLoadingRef.current = true;
        datePrependCompensationRef.current = { previousWidth: scroller.scrollWidth };
        setInlineDateMonths((prev) => {
          const sorted = [...prev].sort((a, b) => a.getTime() - b.getTime());
          const first = sorted[0] ?? startOfMonth(new Date());
          return [subMonths(startOfMonth(first), 1), ...sorted];
        });
      }
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [activeSelector]);

  useEffect(() => {
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasTag = (text: string, channelName: string) =>
      new RegExp(`(^|\\s)#${escapeRegex(channelName)}(?=\\s|$)`, "i").test(text);
    const appendTag = (text: string, channelName: string) =>
      text + (text && !text.endsWith(" ") ? " " : "") + `#${channelName} `;
    const removeTag = (text: string, channelName: string) => {
      const tagPattern = new RegExp(`(^|\\s)#${escapeRegex(channelName)}(?=\\s|$)`, "gi");
      const suffixHasOnlyTags = (suffix: string) => /^\s*(?:#\w+\s*)*$/.test(suffix);

      let match: RegExpExecArray | null;
      let updated = text;
      let removedLengthOffset = 0;

      while ((match = tagPattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const leadingWhitespace = match[1] || "";
        const start = match.index;
        const end = start + fullMatch.length;
        const suffix = text.slice(end);

        if (!suffixHasOnlyTags(suffix)) {
          continue;
        }

        const adjustedStart = start - removedLengthOffset;
        const adjustedEnd = end - removedLengthOffset;
        updated = updated.slice(0, adjustedStart) + leadingWhitespace + updated.slice(adjustedEnd);
        removedLengthOffset += fullMatch.length - leadingWhitespace.length;
      }

      return updated.replace(/[ \t]{2,}/g, " ").replace(/^\s+/, "");
    };

    const previous = new Set(prevIncludedChannelsRef.current);
    const next = new Set(includedChannels);
    const added = includedChannels.filter((name) => !previous.has(name));
    const removed = prevIncludedChannelsRef.current.filter((name) => !next.has(name));

    if (added.length === 0 && removed.length === 0) {
      return;
    }

    setSharedText((previousContent) => {
      let updated = previousContent;

      for (const channelName of added) {
        if (!hasTag(updated, channelName)) {
          updated = appendTag(updated, channelName);
        }
        autoManagedChannelsRef.current.add(channelName);
      }

      for (const channelName of removed) {
        if (autoManagedChannelsRef.current.has(channelName)) {
          updated = removeTag(updated, channelName);
          autoManagedChannelsRef.current.delete(channelName);
        }
      }

      return updated;
    });

    prevIncludedChannelsRef.current = [...includedChannels];
  }, [includedChannels]);

  const handleSubmit = async (submitType: "task" | "comment" | FeedMessageType = "task") => {
    if (!sharedText.trim()) return;
    if (!hasMeaningfulComposerText(sharedText)) return;
    const extractedChannels = extractHashtagsFromContent(sharedText);
    const submitChannels = Array.from(new Set([...extractedChannels, ...explicitTagNames]));
    if (submitChannels.length === 0 && !focusedTaskId) {
      notifyNeedTag();
      return;
    }
    const uploadedAttachments: PublishedAttachment[] = attachments
      .filter((attachment) => attachment.status === "uploaded" && attachment.url)
      .map((attachment) => ({
        url: attachment.url,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256,
        size: attachment.size,
        dimensions: attachment.dimensions,
        blurhash: attachment.blurhash,
        alt: attachment.alt,
        name: attachment.name || attachment.fileName,
      }));
    const activeWritableRelayIds = relays
      .filter((relay) => relay.isActive && isWritableRelay(relay))
      .map((relay) => relay.id);
    const relayIds = resolveEffectiveWritableRelayIds({
      selectedRelayIds: activeWritableRelayIds,
      relays,
    });
    if (submitType === "task" && !focusedTaskId && relayIds.length !== 1) {
      toast.error(t("composer:toasts.errors.selectRelayOrParent"));
      return;
    }
    const listingMetadata: Nip99Metadata | undefined =
      submitType === "offer" || submitType === "request"
        ? {
            title: truncateWordSafe(normalizeListingTextFromContent(sharedText), NIP99_TITLE_MAX_LENGTH) || t("composer.nip99.defaultTitle"),
            status: "active",
          }
        : undefined;

    let result: TaskCreateResult;
    const submittedPriority = storedPriorityFromDisplay(priority);
    try {
      const normalizedLocationGeohash = normalizeGeohash(locationGeohash);
      const event = await dispatchFeedInteraction({
        type: "task.create",
        content: sharedText,
        tags: submitChannels,
        relays: relayIds,
        taskType: submitType,
        dueDate,
        dueTime: dueTime || undefined,
        dateType,
        focusedTaskId,
        explicitMentionPubkeys,
        priority: submittedPriority,
        attachments: uploadedAttachments,
        nip99: listingMetadata,
        locationGeohash: normalizedLocationGeohash,
      });
      result = (event.outcome.result as TaskCreateResult | undefined) ?? { ok: false, reason: "unexpected-error" };
    } catch (error) {
      console.error("Mobile task submit failed", error);
      notifyTaskCreationFailed();
      return;
    }
    if (!result.ok) {
      return;
    }
    setIsSendLaunching(true);
    clearTrackedTimeout(sendLaunchTimeoutRef.current);
    sendLaunchTimeoutRef.current = scheduleTrackedTimeout(() => {
      setIsSendLaunching(false);
      sendLaunchTimeoutRef.current = null;
    }, 260);
    const hashtagOnlyContent = Array.from(
      new Set([
        ...extractHashtagsFromContent(sharedText).map((tag) => `#${tag}`),
        ...explicitTagNames.map((tag) => `#${tag.toLowerCase()}`),
      ])
    ).join(" ");
    setSharedText(hashtagOnlyContent);
    dispatchSearchChange(hashtagOnlyContent);
    prevIncludedChannelsRef.current = [...includedChannels];
    autoManagedChannelsRef.current = new Set(includedChannels);
    setLocationGeohash(undefined);
    setExplicitTagNames([]);
    setExplicitMentionPubkeys([]);
    setAttachments([]);
    attachmentFileRef.current = {};
    setActiveSelector(null);
    scheduleTrackedTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleAttachmentUpload = async (file: File, id: string) => {
    try {
      const uploaded = await uploadAttachment(file, {
        getAuthHeader: (url, method) => createHttpAuthHeader(url, method),
      });
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                ...uploaded,
                fileName: attachment.fileName || uploaded.name || file.name,
                status: "uploaded",
                source: "upload",
              }
            : attachment
        )
      );
      if (file.type.startsWith("image/") && usePreferencesStore.getState().autoCaptionEnabled) {
        featureDebugLog("auto-caption", "Starting mobile post-upload caption generation for image attachment", {
          attachmentId: id,
          fileName: file.name,
        });
        void (async () => {
          const result = await generateLocalImageCaption(file);
          if (!result.caption) {
            notifyAutoCaptionFailureOnce(result);
            featureDebugLog("auto-caption", "No caption generated for uploaded mobile image attachment", {
              attachmentId: id,
              fileName: file.name,
              status: result.status,
              reason: result.reason || result.error || null,
            });
            return;
          }
          setAttachments((previous) =>
            previous.map((attachment) =>
              attachment.id === id && !attachment.alt
                ? {
                    ...attachment,
                    alt: result.caption!,
                  }
                : attachment
            )
          );
          featureDebugLog("auto-caption", "Applied generated image caption on mobile", {
            attachmentId: id,
            fileName: file.name,
          });
        })();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("composer.attachments.uploadFailed");
      console.warn("[mobile-composer] Attachment upload failed", {
        fileName: file.name,
        size: file.size,
        mimeType: file.type || null,
        error: message,
      });
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                status: "failed",
                error: message,
              }
            : attachment
        )
      );
    }
  };

  const queueSelectedFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length > 0 && usePreferencesStore.getState().autoCaptionEnabled) {
      featureDebugLog("auto-caption", "Mobile image attachments queued for local caption inference", {
        imageCount: imageFiles.length,
      });
    }
    const validFiles = selectedFiles.filter((file) => {
      if (file.size <= attachmentMaxFileSizeBytes) return true;
      const maxSizeMb = Math.max(1, Math.ceil(attachmentMaxFileSizeBytes / (1024 * 1024)));
      toast.error(`Attachment "${file.name}" exceeds the ${maxSizeMb} MB limit.`);
      return false;
    });
    if (validFiles.length === 0) return;
    const now = Date.now().toString(36);
    const nextEntries: ComposeAttachment[] = validFiles.map((file, index) => {
      const id = `mobile-file-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      attachmentFileRef.current[id] = file;
      return {
        id,
        url: "",
        fileName: file.name,
        mimeType: file.type || undefined,
        size: file.size,
        status: "uploading" as const,
        source: "upload" as const,
      };
    });
    setAttachments((previous) => [...previous, ...nextEntries]);
    for (const entry of nextEntries) {
      const file = attachmentFileRef.current[entry.id];
      if (!file) continue;
      void handleAttachmentUpload(file, entry.id);
    }
  };

  const retryAttachmentUpload = (attachmentId: string) => {
    const file = attachmentFileRef.current[attachmentId];
    if (!file) return;
    setAttachments((previous) =>
      previous.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "uploading",
              error: undefined,
            }
          : attachment
      )
    );
    void handleAttachmentUpload(file, attachmentId);
  };

  const removeAttachment = (attachmentId: string) => {
    delete attachmentFileRef.current[attachmentId];
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleCancel = () => {
    setSharedText("");
    dispatchSearchChange("");
    setActiveSelector(null);
    setShowSendOptions(false);
    setShowHashtagSuggestions(false);
    setHashtagFilter("");
    setActiveHashtagIndex(0);
    setShowMentionSuggestions(false);
    setMentionFilter("");
    setActiveMentionIndex(0);
    setAttachments([]);
    setLocationGeohash(undefined);
    attachmentFileRef.current = {};
  };

  const toggleSelector = (type: SelectorType) => {
    setActiveSelector(activeSelector === type ? null : type);
  };

  // Count active filters
  const activeRelaysCount = relays.filter(r => r.isActive).length;
  const activeChannelsCount = channels.filter(c => c.filterState !== "neutral").length;
  const activePeopleCount = people.filter(p => p.isSelected).length;
  const activeWritableRelayIds = relays
    .filter((relay) => relay.isActive && isWritableRelay(relay))
    .map((relay) => relay.id);
  const effectiveWritableRelayIds = resolveEffectiveWritableRelayIds({
    selectedRelayIds: activeWritableRelayIds,
    relays,
  });
  const hasInvalidRootTaskRelaySelection = !focusedTaskId && effectiveWritableRelayIds.length !== 1;
  const hasComposeText = sharedText.trim().length > 0;
  const hasMeaningfulComposeText = hasMeaningfulComposerText(sharedText);
  const hasAtLeastOneTag = countHashtagsInContent(sharedText) + explicitTagNames.length > 0;
  const canInheritParentTags = Boolean(focusedTaskId);
  const hasPendingAttachmentUploads = attachments.some((attachment) => attachment.status === "uploading");
  const hasFailedAttachmentUploads = attachments.some((attachment) => attachment.status === "failed");
  const taskSubmitBlock = resolveComposeSubmitBlock({
    isSignedIn: canCreateContent,
    hasMeaningfulContent: hasMeaningfulComposeText,
    hasAtLeastOneTag,
    canInheritParentTags,
    hasInvalidRootTaskRelaySelection,
    hasPendingAttachmentUploads,
    hasFailedAttachmentUploads,
    t,
  });
  const taskSubmitBlockedReason = taskSubmitBlock?.reason ?? null;
  // Hide the banner for "signin" too — the submit button already conveys the
  // signed-out state, so the extra "Can't post yet / Sign in required" panel
  // is redundant and visually heavy on mobile.
  const showTaskSubmitBlockBanner =
    taskSubmitBlock?.code !== "write" && taskSubmitBlock?.code !== "signin" && taskSubmitBlock?.code !== "uploading";
  const isPrimarySendEmptyDisabled = canCreateContent && sharedText.trim().length === 0;
  const primarySendTitle = isPrimarySendEmptyDisabled
    ? (taskSubmitBlock?.reason
      ?? (canOfferComment ? `${t("composer.actions.createTask")} / ${t("composer.actions.addComment")}` : t("composer.actions.createTask")))
    : !canCreateContent
      ? t("composer.hints.signInToCreate")
      : taskSubmitBlock
        ? taskSubmitBlock.reason
        : canOfferComment
          ? `${t("composer.actions.createTask")} / ${t("composer.actions.addComment")}`
          : t("composer.hints.createFromText");
  const filteredChannels = filterChannelsForAutocomplete(channels, hashtagFilter, 8);
  const filteredPeople = people.filter((person) => {
    return personMatchesMentionQuery(person, mentionFilter);
  }).slice(0, 8);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = Math.max(window.innerHeight * COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO, 44);
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [sharedText]);

  useEffect(() => {
    const handleResize = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const maxHeight = Math.max(window.innerHeight * COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO, 44);
      textarea.style.height = "0px";
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.maxHeight = `${maxHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    scheduleTrackedAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      cursorPositionRef.current = end;
    });
  }, []);

  const pulseTarget = (target: "input" | "attachments") => {
    setHighlightedTarget(target);
    clearTrackedTimeout(remediationHighlightTimeoutRef.current);
    remediationHighlightTimeoutRef.current = scheduleTrackedTimeout(() => {
      setHighlightedTarget((current) => (current === target ? null : current));
      remediationHighlightTimeoutRef.current = null;
    }, 1800);
  };

  const focusComposeInput = () => {
    scheduleTrackedTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const nextCursor = textarea.selectionStart ?? textarea.value.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
      cursorPositionRef.current = nextCursor;
    }, 0);
    pulseTarget("input");
  };

  const focusAttachments = () => {
    attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    pulseTarget("attachments");
  };

  const handleBlockedTaskAttempt = () => {
    if (!taskSubmitBlock) return;
    if (taskSubmitBlock.code === "uploading") {
      toast.info(taskSubmitBlock.reason, { id: "task-composer-uploading-blocked" });
    }
    switch (taskSubmitBlock.action) {
      case "focus-input":
        focusComposeInput();
        break;
      case "open-channel-selector":
        setActiveSelector("channel");
        break;
      case "open-relay-selector":
        setActiveSelector("relay");
        break;
      case "focus-attachments":
        focusAttachments();
        break;
      case "focus-task-context":
      case "review-blocker":
      case null:
        break;
    }
  };

  // Note: the date picker stays open even when the submit block reason is set
  // (e.g. empty content / missing tag). Closing it on every keystroke before
  // a hashtag was added caused the picker to flash open for a split second.

  useEffect(() => {
    if (!canOfferComment || !hasComposeText) {
      setShowSendOptions(false);
    }
  }, [canOfferComment, hasComposeText]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const root = bottomBarRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      setIsBottomBarInteracting(root.contains(target));
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const insertMention = (mentionToken: string) => {
    const cursorPos = cursorPositionRef.current;
    const textBeforeCursor = sharedText.slice(0, cursorPos);
    const textAfterCursor = sharedText.slice(cursorPos);
    const mentionStart = textBeforeCursor.lastIndexOf("@");
    if (mentionStart < 0) return;
    const newText = textBeforeCursor.slice(0, mentionStart) + `@${mentionToken} ` + textAfterCursor;
    setSharedText(newText);
    dispatchSearchChange(newText);
    setShowMentionSuggestions(false);
    setActiveMentionIndex(0);
    scheduleTrackedTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const pos = mentionStart + mentionToken.length + 2;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      cursorPositionRef.current = pos;
    }, 0);
  };

  const insertHashtag = (tagName: string) => {
    const cursorPos = cursorPositionRef.current;
    const textBeforeCursor = sharedText.slice(0, cursorPos);
    const textAfterCursor = sharedText.slice(cursorPos);
    const hashtagStart = textBeforeCursor.lastIndexOf("#");
    if (hashtagStart < 0) return;
    const newText = textBeforeCursor.slice(0, hashtagStart) + `#${tagName} ` + textAfterCursor;
    setSharedText(newText);
    dispatchSearchChange(newText);
    setShowHashtagSuggestions(false);
    setActiveHashtagIndex(0);
    scheduleTrackedTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const pos = hashtagStart + tagName.length + 2;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      cursorPositionRef.current = pos;
    }, 0);
  };

  const clearAutocomplete = () => {
    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setActiveHashtagIndex(0);
    setActiveMentionIndex(0);
  };

  const updateAutocompleteFromCursor = (textValue: string, nextCursorPosition: number, focused: boolean) => {
    if (!focused) {
      clearAutocomplete();
      return;
    }

    const textBeforeCursor = textValue.slice(0, nextCursorPosition);
    const autocompleteMatch = getComposerAutocompleteMatch(textBeforeCursor);
    if (autocompleteMatch?.kind === "hashtag") {
      const shouldResetHashtagIndex = !showHashtagSuggestions || hashtagFilter !== autocompleteMatch.query;
      setHashtagFilter(autocompleteMatch.query);
      setShowHashtagSuggestions(true);
      setShowMentionSuggestions(false);
      if (shouldResetHashtagIndex) {
        setActiveHashtagIndex(0);
      }
      setActiveMentionIndex(0);
      return;
    }
    if (autocompleteMatch?.kind === "mention") {
      const shouldResetMentionIndex = !showMentionSuggestions || mentionFilter !== autocompleteMatch.query;
      setMentionFilter(autocompleteMatch.query);
      setShowMentionSuggestions(true);
      setShowHashtagSuggestions(false);
      if (shouldResetMentionIndex) {
        setActiveMentionIndex(0);
      }
      setActiveHashtagIndex(0);
      return;
    }

    clearAutocomplete();
  };

  const canSendTask = hasMeaningfulComposeText && !hasInvalidRootTaskRelaySelection && !hasPendingAttachmentUploads && !hasFailedAttachmentUploads;
  const canSendComment = hasMeaningfulComposeText && (hasAtLeastOneTag || canInheritParentTags) && !hasPendingAttachmentUploads && !hasFailedAttachmentUploads;
  const canSendListing = hasMeaningfulComposeText && (hasAtLeastOneTag || canInheritParentTags) && !hasPendingAttachmentUploads && !hasFailedAttachmentUploads;
  const canOpenSendOptions = canCreateContent && canOfferComment && hasComposeText;
  const hasTaskSubmitBlock = taskSubmitBlock !== null;
  const showInlineTaskSubmitBlock = hasTaskSubmitBlock && hasComposeText;

  const handlePrimarySend = () => {
    if (!canCreateContent) {
      void handleSubmit("task");
      return;
    }
    if (taskSubmitBlock && !taskSubmitBlock.isHardDisabled && !canSendComment && !canSendListing) {
      handleBlockedTaskAttempt();
      return;
    }
    if (canOfferComment) {
      setShowSendOptions((previous) => !previous);
      return;
    }
    if (taskSubmitBlock && !taskSubmitBlock.isHardDisabled) {
      handleBlockedTaskAttempt();
      return;
    }
    void handleSubmit("task");
  };

  const captureCurrentLocation = () => {
    featureDebugLog("compose-location", "Attempting mobile location capture");
    if (!navigator.geolocation) {
      featureDebugLog("compose-location", "Mobile location capture unavailable: geolocation API missing");
      console.warn("[compose-location] Geolocation API is unavailable on this device");
      toast.error(t("composer:toasts.errors.locationUnavailable"));
      return;
    }
    setIsCapturingLocation(true);
    toast.info(t("composer:toasts.info.locationCapturing"));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geohash = encodeGeohash(position.coords.latitude, position.coords.longitude, DEFAULT_GEOHASH_PRECISION);
        setLocationGeohash(geohash);
        setIsCapturingLocation(false);
        featureDebugLog("compose-location", "Mobile location capture succeeded", { geohash });
        toast.success(t("composer:toasts.success.locationCaptured", { geohash }));
      },
      (error) => {
        setIsCapturingLocation(false);
        const errorDetails = {
          code: error.code,
          message: error.message,
          PERMISSION_DENIED: error.PERMISSION_DENIED,
          POSITION_UNAVAILABLE: error.POSITION_UNAVAILABLE,
          TIMEOUT: error.TIMEOUT,
        };
        featureDebugLog("compose-location", "Mobile location capture failed", errorDetails);
        console.warn("[compose-location] Geolocation request failed", errorDetails);

        let reasonKey: string;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reasonKey = "composer:toasts.errors.locationPermissionDenied";
            break;
          case error.POSITION_UNAVAILABLE:
            reasonKey = "composer:toasts.errors.locationPositionUnavailable";
            break;
          case error.TIMEOUT:
            reasonKey = "composer:toasts.errors.locationTimeout";
            break;
          default:
            reasonKey = "composer:toasts.errors.locationCaptureFailed";
        }
        const reason = t(reasonKey);
        toast.error(error.message ? `${reason} (${error.message})` : reason);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleLocationToggle = () => {
    if (isCapturingLocation) return;
    if (locationGeohash) {
      featureDebugLog("compose-location", "Clearing mobile location toggle state", { geohash: locationGeohash });
      setLocationGeohash(undefined);
      return;
    }
    captureCurrentLocation();
  };

  const addMentionTagOnly = (person: Person) => {
    const normalizedPubkey = person.id.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedPubkey)) {
      return;
    }

    const cursorPos = cursorPositionRef.current;
    const textBeforeCursor = sharedText.slice(0, cursorPos);
    const mentionStartFromCursor = textBeforeCursor.lastIndexOf("@");
    const mentionStart = mentionStartFromCursor >= 0 ? mentionStartFromCursor : sharedText.lastIndexOf("@");
    if (mentionStart < 0) {
      return;
    }

    setExplicitMentionPubkeys((previous) =>
      previous.includes(normalizedPubkey) ? previous : [...previous, normalizedPubkey]
    );

    let mentionEnd = mentionStart + 1;
    while (mentionEnd < sharedText.length && !/\s/.test(sharedText[mentionEnd])) {
      mentionEnd += 1;
    }

    const newText = (sharedText.slice(0, mentionStart) + sharedText.slice(mentionEnd))
      .replace(/[ \t]{2,}/g, " ");
    setSharedText(newText);
    dispatchSearchChange(newText);
    scheduleTrackedTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(mentionStart, mentionStart);
      cursorPositionRef.current = mentionStart;
    }, 0);

    setShowMentionSuggestions(false);
    setActiveMentionIndex(0);
    setMentionFilter("");
  };

  const addHashtagTagOnly = (tagName: string) => {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!normalizedTag) {
      return;
    }

    setExplicitTagNames((previous) =>
      previous.includes(normalizedTag) ? previous : [...previous, normalizedTag]
    );

    const cursorPos = cursorPositionRef.current;
    const textBeforeCursor = sharedText.slice(0, cursorPos);
    const hashtagStartFromCursor = textBeforeCursor.lastIndexOf("#");
    const hashtagStart = hashtagStartFromCursor >= 0 ? hashtagStartFromCursor : sharedText.lastIndexOf("#");
    if (hashtagStart < 0) {
      return;
    }

    let hashtagEnd = hashtagStart + 1;
    while (hashtagEnd < sharedText.length && !/\s/.test(sharedText[hashtagEnd])) {
      hashtagEnd += 1;
    }

    const newText = (sharedText.slice(0, hashtagStart) + sharedText.slice(hashtagEnd))
      .replace(/[ \t]{2,}/g, " ");
    setSharedText(newText);
    dispatchSearchChange(newText);
    scheduleTrackedTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(hashtagStart, hashtagStart);
      cursorPositionRef.current = hashtagStart;
    }, 0);
    setShowHashtagSuggestions(false);
    setActiveHashtagIndex(0);
    setHashtagFilter("");
  };

  return (
    <div
      ref={bottomBarRef}
      onFocusCapture={() => setIsBottomBarFocused(true)}
      onBlurCapture={() => {
        scheduleTrackedAnimationFrame(() => {
          const root = bottomBarRef.current;
          const active = document.activeElement;
          setIsBottomBarFocused(Boolean(root && active instanceof Element && root.contains(active)));
        });
      }}
      className="relative z-[110] border-t border-border bg-background safe-area-bottom"
      data-onboarding="mobile-combined-box"
    >
      {/* Selector Panel */}
      {activeSelector && (
        <div
          className={cn(
            "motion-selector-panel relative z-[112] border-b border-border p-3",
            activeSelector === "date" ? "overflow-y-hidden" : "overflow-y-auto max-h-48"
          )}
        >
          {activeSelector === "relay" && (
            <div className="flex flex-wrap gap-2">
              {relays.map((relay) => {
                const RelayIcon = resolveRelayIcon(relay.url);
                return (
                  <button
                    key={relay.id}
                    onClick={() => {
                      void dispatchFeedInteraction({ type: "sidebar.relay.toggle", relayId: relay.id });
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors touch-target-sm active:scale-95",
                      relay.isActive
                        ? "bg-primary/10 border-primary text-primary motion-filter-pop"
                        : "border-border"
                    )}
                  >
                    <RelayIcon className="w-4 h-4" />
                    {relay.name}
                    {relay.isActive && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
          {activeSelector === "channel" && (
            <div className="flex flex-wrap gap-2">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm border transition-colors touch-target-sm active:scale-95",
                    channel.filterState === "included" && "bg-success/10 border-success text-success motion-filter-pop",
                    channel.filterState === "excluded" && "bg-destructive/10 border-destructive text-destructive motion-filter-pop-alt",
                    channel.filterState === "neutral" && "border-border"
                  )}
                >
                  #{channel.name}
                  {channel.filterState === "included" && <Check className="w-3.5 h-3.5" />}
                  {channel.filterState === "excluded" && <X className="w-3.5 h-3.5" />}
                  {channel.filterState === "neutral" && <Minus className="w-3.5 h-3.5 opacity-50" />}
                </button>
              ))}
            </div>
          )}
          {activeSelector === "person" && (
            <div className="flex flex-wrap gap-2">
              {visiblePeople.map((person) => {
                const personDisplayName = getPersonDisplayName(person);
                const personLabel = getCompactPersonLabel(person);
                return (
                  <button
                    key={person.id}
                    onClick={() => {
                      void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: person.id });
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors touch-target-sm active:scale-95",
                      person.isSelected
                        ? "bg-primary/10 border-primary text-primary motion-filter-pop"
                        : "border-border"
                    )}
                  >
                    <UserAvatar
                      id={person.id}
                      displayName={personDisplayName}
                      className="w-6 h-6"
                    />
                    <span className="truncate max-w-[8rem]" title={personDisplayName}>
                      {personLabel}
                    </span>
                    {person.isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
          {activeSelector === "date" && (
            <div
              ref={dateScrollerRef}
              className="-mx-3 px-3 w-full overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="w-max min-w-full flex gap-3">
                {inlineDateMonths.map((month) => {
                  const monthKey = getMonthKey(month);
                  return (
                    <div
                      key={monthKey}
                      ref={(node) => {
                        dateMonthRefs.current[monthKey] = node;
                      }}
                      className="shrink-0 w-[calc(100vw-2rem)] max-w-[20rem]"
                    >
                      <CalendarComponent
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        month={month}
                        fixedWeeks
                        className="pointer-events-auto !p-0 [&_tbody_tr:nth-child(n+6)]:hidden"
                        classNames={{
                          nav: "hidden",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls Row */}
      <div className="px-3 pt-2">
        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-2 pt-1">
          {uploadEnabled && canCreateContent && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted transition-colors shrink-0 touch-target-sm"
              aria-label={t("composer.attachments.add")}
              title={t("composer.attachments.add")}
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}
          {showInlineTaskSubmitBlock && showTaskSubmitBlockBanner ? (
            <div
              role="alert"
              className="inline-flex max-w-full items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-left"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">
                  {t("composer.blockedDetail.title")}
                </div>
                <div className="text-xs font-medium leading-tight text-foreground">
                  {taskSubmitBlockedReason}
                </div>
              </div>
            </div>
          ) : canCreateContent ? (
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground shrink-0">
              <div className="flex items-center gap-1">
                <PrioritySelect
                  priority={priority}
                  onPriorityChange={setPriority}
                  leadingIcon={<Flag className="w-3.5 h-3.5" />}
                  className={cn(
                    "h-8 inline-flex items-center gap-1.5 pl-2 pr-2 rounded-md border bg-transparent text-xs leading-none shadow-none transition-colors cursor-pointer focus:outline-none max-[420px]:max-w-[5.5rem]",
                    typeof priority === "number"
                      ? "border-border text-foreground hover:bg-muted/60"
                      : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                />
                <button
                  onClick={() => toggleSelector("date")}
                  className={cn(
                    "h-8 flex items-center gap-1.5 px-2 rounded-md border transition-colors text-xs leading-none",
                    activeSelector === "date"
                      ? "border-primary bg-primary/10 text-primary"
                      : dueDate
                        ? "border-border text-foreground hover:bg-muted/60"
                        : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {dueDate ? format(dueDate, "MMM d") : t("composer.labels.date")}
                </button>
                <button
                  onClick={handleLocationToggle}
                  disabled={isCapturingLocation}
                  className={cn(
                    "h-8 flex items-center gap-1.5 px-2 rounded-md border transition-colors text-xs leading-none",
                    locationGeohash
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    isCapturingLocation && "opacity-60 cursor-wait animate-pulse"
                  )}
                  aria-label={t("composer.actions.location")}
                  aria-busy={isCapturingLocation}
                  title={t("composer.actions.location")}
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
              {dueDate && (
                <div className="flex items-center gap-1">
                  <TaskDateTypeSelect
                    aria-label={t("composer.labels.dateType")}
                    value={dateType}
                    onChange={setDateType}
                    className="h-8 w-[5.2rem] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="h-8 flex items-center gap-0.5 pl-2 pr-1 rounded-md border border-border bg-muted/30 text-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="w-[4.1rem] bg-transparent text-xs text-foreground focus:outline-none"
                    />
                    {dueTime && (
                      <button
                        type="button"
                        onClick={() => setDueTime("")}
                        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t("composer.hints.clearTime", { defaultValue: "Clear time" })}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setDueDate(undefined);
                      setDueTime("");
                    }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                    aria-label={t("composer.hints.clearDueDate")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Filter/Selector Buttons */}
          <div className="flex items-center gap-0.5 ml-auto shrink-0">
            <button
              onClick={() => toggleSelector("relay")}
              className={cn(
                "relative p-2.5 rounded-lg transition-colors touch-target-sm active:scale-95",
                activeSelector === "relay" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Radio className="w-4 h-4" />
              {activeRelaysCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activeRelaysCount}
                </span>
              )}
            </button>
            <button
              onClick={() => toggleSelector("channel")}
              className={cn(
                "relative p-2.5 rounded-lg transition-colors touch-target-sm active:scale-95",
                activeSelector === "channel" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Hash className="w-4 h-4" />
              {activeChannelsCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activeChannelsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => toggleSelector("person")}
              aria-label={t("filters:filters.people.title")}
              className={cn(
                "relative p-2.5 rounded-lg transition-colors touch-target-sm active:scale-95",
                activeSelector === "person" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-4 h-4" />
              {activePeopleCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activePeopleCount}
                </span>
              )}
            </button>
          </div>

        </div>
        </div>
      </div>

      {attachments.length > 0 && (
        <div
          ref={attachmentsRef}
          className={cn(
            "px-3 pb-2 space-y-1.5 rounded-xl",
            highlightedTarget === "attachments" && "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background"
          )}
        >
          {attachments.map((attachment) => (
            <div key={attachment.id} className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{attachment.fileName || attachment.name || attachment.url}</span>
                <div className="flex items-center gap-1">
                  {attachment.status === "uploading" && (
                    <span className="text-muted-foreground">{t("composer.attachments.uploading")}</span>
                  )}
                  {attachment.status === "failed" && (
                    <>
                      <button
                        type="button"
                        onClick={() => retryAttachmentUpload(attachment.id)}
                        className="rounded px-1 py-0.5 hover:bg-muted"
                      >
                        {t("composer.attachments.retry")}
                      </button>
                      <span className="text-destructive">{t("composer.attachments.failed")}</span>
                    </>
                  )}
                  {attachment.status === "uploaded" && (
                    <span className="text-emerald-600">{t("composer.attachments.ready")}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="rounded p-0.5 hover:bg-muted"
                    aria-label={t("composer.attachments.remove")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {attachment.status === "failed" && attachment.error && (
                <p className="mt-1 text-[11px] text-destructive">{attachment.error}</p>
              )}
              {attachment.status === "uploaded" && attachment.mimeType?.startsWith("image/") && (
                <input
                  type="text"
                  value={attachment.alt || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAttachments((previous) =>
                      previous.map((item) =>
                        item.id === attachment.id
                          ? {
                              ...item,
                              alt: value,
                            }
                          : item
                      )
                    );
                  }}
                  className="mt-1 h-7 w-full rounded border border-border/50 bg-background px-2 text-xs"
                  placeholder={t("composer.attachments.altPlaceholder")}
                  aria-label={t("composer.attachments.altLabel")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-stretch gap-2 px-3 pb-3 pt-2">
        <div className="flex-1">
          <div className="flex min-h-[2.75rem] items-end gap-2 text-sm">
            <div className="flex-1 relative">
              {hasComposeText ? (
                <button
                  onClick={handleCancel}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted z-10"
                  aria-label={t("composer.hints.clearCompose")}
                  title={t("composer.hints.clearCompose")}
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              )}
              <textarea
                data-onboarding="compose-input"
                ref={textareaRef}
                value={sharedText}
                onFocus={(event) => {
                  setIsComposeFocused(true);
                  const nextCursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                  cursorPositionRef.current = nextCursor;
                  updateAutocompleteFromCursor(event.currentTarget.value, nextCursor, true);
                }}
                onBlur={() => {
                  setIsComposeFocused(false);
                  updateAutocompleteFromCursor(sharedText, cursorPositionRef.current, false);
                }}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextCursor = e.target.selectionStart ?? value.length;
                  cursorPositionRef.current = nextCursor;
                  updateAutocompleteFromCursor(value, nextCursor, true);
                  syncChannelFiltersFromContent(value, sharedText);
                  setSharedText(value);
                  dispatchSearchChange(value);
                }}
                onSelect={(event) => {
                  const nextCursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                  cursorPositionRef.current = nextCursor;
                  updateAutocompleteFromCursor(event.currentTarget.value, nextCursor, isComposeFocused);
                }}
                onKeyDown={(e) => {
                  if (showHashtagSuggestions) {
                    if (filteredChannels.length > 0 && e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveHashtagIndex((prev) => (prev + 1) % filteredChannels.length);
                      return;
                    }
                    if (filteredChannels.length > 0 && e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveHashtagIndex((prev) => (prev - 1 + filteredChannels.length) % filteredChannels.length);
                      return;
                    }
                    if (filteredChannels.length > 0 && isAutocompleteAcceptKey(e)) {
                      e.preventDefault();
                      const selected = filteredChannels[Math.max(activeHashtagIndex, 0)] || filteredChannels[0];
                      if (selected) {
                        insertHashtag(selected.name);
                      }
                      return;
                    }
                    if (isMetadataOnlyAutocompleteKey(e)) {
                      const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPositionRef.current;
                      const textBeforeCursor = sharedText.slice(0, effectiveCursor);
                      const typedHashtag = getHashtagQueryAtCursor(textBeforeCursor);
                      if (typedHashtag !== null) {
                        const selected = filteredChannels[Math.max(activeHashtagIndex, 0)] || filteredChannels[0];
                        const metadataTag = selected?.name || typedHashtag;
                        if (metadataTag) {
                          e.preventDefault();
                          addHashtagTagOnly(metadataTag);
                          return;
                        }
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShowHashtagSuggestions(false);
                      setActiveHashtagIndex(0);
                      return;
                    }
                  }
                  if (showMentionSuggestions && filteredPeople.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveMentionIndex((prev) => (prev + 1) % filteredPeople.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveMentionIndex((prev) => (prev - 1 + filteredPeople.length) % filteredPeople.length);
                      return;
                    }
                    if (isAutocompleteAcceptKey(e)) {
                      e.preventDefault();
                      const selected = filteredPeople[Math.max(activeMentionIndex, 0)] || filteredPeople[0];
                      if (selected) {
                        insertMention(getPreferredMentionIdentifier(selected));
                      }
                      return;
                    }
                    if (isMetadataOnlyAutocompleteKey(e)) {
                      const textBeforeCursor = sharedText.slice(0, cursorPositionRef.current);
                      if (hasMentionQueryAtCursor(textBeforeCursor) || /@[^\s@]*$/.test(sharedText)) {
                        e.preventDefault();
                        const selected = filteredPeople[Math.max(activeMentionIndex, 0)] || filteredPeople[0];
                        if (selected) {
                          addMentionTagOnly(selected);
                        }
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShowMentionSuggestions(false);
                      setActiveMentionIndex(0);
                      return;
                    }
                  }
                  if (isPrimarySubmitKey(e)) {
                    e.preventDefault();
                    handleSubmit();
                    return;
                  }
                  if (isAlternateSubmitKey(e)) {
                    e.preventDefault();
                    handleSubmit(canOfferComment ? "comment" : "task");
                    return;
                  }
                  if (e.key === "Escape") {
                    handleCancel();
                  }
                }}
                placeholder={composerPlaceholder}
                className={cn(
                  "block min-h-[2.75rem] w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm leading-[1.35] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50",
                  highlightedTarget === "input" && "ring-2 ring-amber-400 border-amber-400/70"
                )}
                rows={1}
              />
              {showHashtagSuggestions && filteredChannels.length > 0 && (
                <div
                  data-testid="mobile-autocomplete-panel"
                  className="motion-selector-panel absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-full py-1 max-h-72 overflow-y-auto overscroll-contain"
                >
                  {filteredChannels.map((channel, index) => (
                    <button
                      key={channel.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isMetadataOnlyAutocompleteClick(e)) {
                          addHashtagTagOnly(channel.name);
                          return;
                        }
                        insertHashtag(channel.name);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left",
                        activeHashtagIndex === index ? "bg-muted motion-magnet-active" : "hover:bg-muted"
                      )}
                    >
                      <Hash className="w-4 h-4 text-primary" />
                      <span className="text-sm truncate">{channel.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {showMentionSuggestions && filteredPeople.length > 0 && (
                <div
                  data-testid="mobile-autocomplete-panel"
                  className="motion-selector-panel absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-full py-1 max-h-72 overflow-y-auto overscroll-contain"
                >
                  {filteredPeople.map((person, index) => {
                    const mentionIdentifier = getPreferredMentionIdentifier(person);
                    const mentionDisplay = formatMentionIdentifierForDisplay(mentionIdentifier);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          if (isMetadataOnlyAutocompleteClick(e)) {
                            addMentionTagOnly(person);
                            return;
                          }
                          insertMention(mentionIdentifier);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left",
                          activeMentionIndex === index ? "bg-muted motion-magnet-active" : "hover:bg-muted"
                        )}
                      >
                        <UserAvatar
                          id={person.id}
                          displayName={person.displayName || person.name}
                          className="w-4 h-4"
                        />
                        <span className="text-sm min-w-0 flex-1 truncate">@{person.name || person.displayName}</span>
                        <span
                          className="text-xs text-muted-foreground max-w-[9rem] truncate"
                          title={`@${mentionIdentifier}`}
                        >
                          (@{mentionDisplay})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-end gap-1.5 self-end">
              <div className="relative">
                <button
                  onClick={handlePrimarySend}
                  disabled={Boolean(taskSubmitBlock?.isHardDisabled) || isPrimarySendEmptyDisabled}
                  className={cn(
                    "h-11 w-11 inline-flex items-center justify-center rounded-lg border transition-colors",
                    canCreateContent
                      ? isPrimarySendEmptyDisabled
                        ? "border-primary/40 bg-primary/45 text-primary-foreground/85 disabled:opacity-100"
                        : taskSubmitBlock && !taskSubmitBlock.isHardDisabled
                          ? "border-primary/25 bg-primary/25 text-primary/75 disabled:opacity-100 hover:bg-primary/30"
                          : "border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-100"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                  aria-label={canCreateContent ? (canOfferComment ? `${t("composer.actions.createTask")} / ${t("composer.actions.addComment")}` : t("composer.actions.createTask")) : t("composer.hints.signInToCreate")}
                  title={primarySendTitle}
                >
                  <span className={cn(isSendLaunching && "motion-send-launch")}>
                    {!canCreateContent ? <LogIn className="w-5 h-5" /> : canOfferComment ? <Send className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
                  </span>
                </button>

                {showSendOptions && canOpenSendOptions && (
                  <div className="absolute bottom-full right-0 mb-1.5 flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg z-[116]">
                    <button
                      onClick={() => {
                        if (taskSubmitBlock && !taskSubmitBlock.isHardDisabled) {
                          setShowSendOptions(false);
                          handleBlockedTaskAttempt();
                          return;
                        }
                        setShowSendOptions(false);
                        void handleSubmit("task");
                      }}
                      disabled={Boolean(taskSubmitBlock?.isHardDisabled) || isPrimarySendEmptyDisabled}
                      className={cn(
                        "h-9 w-9 inline-flex items-center justify-center rounded-md border disabled:cursor-not-allowed",
                        isPrimarySendEmptyDisabled
                          ? "border-primary/40 bg-primary/45 text-primary-foreground/85 disabled:opacity-100"
                          : taskSubmitBlock && !taskSubmitBlock.isHardDisabled
                            ? "border-primary/25 bg-primary/25 text-primary/75 disabled:opacity-100 hover:bg-primary/30"
                            : "border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-100"
                      )}
                      aria-label={t("composer.actions.createTask")}
                      title={taskSubmitBlock?.reason || t("composer.actions.createTask")}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setShowSendOptions(false);
                        void handleSubmit("comment");
                      }}
                      disabled={!canSendComment}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      aria-label={t("composer.actions.addComment")}
                      title={t("composer.actions.addComment")}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    {currentView === "feed" && (
                      <>
                        <button
                          onClick={() => {
                            setShowSendOptions(false);
                            void handleSubmit("offer");
                          }}
                          disabled={!canSendListing}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          aria-label={t("composer.actions.postOffer")}
                          title={t("composer.actions.postOffer")}
                        >
                          <Package className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setShowSendOptions(false);
                            void handleSubmit("request");
                          }}
                          disabled={!canSendListing}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          aria-label={t("composer.actions.postRequest")}
                          title={t("composer.actions.postRequest")}
                        >
                          <HandHelping className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {uploadEnabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              queueSelectedFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
