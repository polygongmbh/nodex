import { useState, useRef, useEffect } from "react";
import { Hash, Calendar, Clock, X, Zap, AtSign, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType, TaskDateType, TaskCreateResult, ComposeRestoreRequest } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useNDK } from "@/lib/nostr/ndk-context";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  extractMentionIdentifiersFromContent,
  formatMentionIdentifierForDisplay,
  getMentionAliases,
  getPreferredMentionIdentifier,
  personMatchesMentionQuery,
} from "@/lib/mentions";
import { hasMeaningfulComposerText } from "@/lib/composer-content";
import { notifyNeedTag, notifyTaskCreationFailed } from "@/lib/notifications";

interface TaskComposerProps {
  onSubmit: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number
  ) => Promise<TaskCreateResult> | TaskCreateResult;
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  parentId?: string;
  onSignInClick?: () => void;
  adaptiveSize?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  draftStorageKey?: string;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  allowComment?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

interface ComposeDraftState {
  content?: string;
  taskType?: TaskType;
  dueDate?: string;
  dueTime?: string;
  dateType?: TaskDateType;
  selectedRelays?: string[];
  explicitMentionPubkeys?: string[];
  explicitTagNames?: string[];
  priority?: number;
}

function readComposeDraft(key: string): ComposeDraftState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposeDraftState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function TaskComposer({ 
  onSubmit, 
  relays, 
  channels, 
  people, 
  onCancel, 
  compact = false, 
  defaultDueDate, 
  defaultContent = "",
  parentId,
  onSignInClick,
  adaptiveSize = false,
  onExpandedChange,
  draftStorageKey,
  forceExpanded = false,
  forceExpandSignal,
  mentionRequest = null,
  allowComment = true,
  composeRestoreRequest = null,
}: TaskComposerProps) {
  const { t } = useTranslation();
  const { user } = useNDK();
  const includedChannels = channels
    .filter((c) => c.filterState === "included")
    .map((c) => c.name.trim().toLowerCase())
    .filter(Boolean);
  const selectedPeoplePubkeys = people
    .filter((person) => person.isSelected)
    .map((person) => person.id.trim().toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/i.test(value));
  const initialDraft = draftStorageKey ? readComposeDraft(draftStorageKey) : null;
  const initialContent = initialDraft?.content ?? defaultContent;
  
  const [content, setContent] = useState(initialContent);
  const [taskType, setTaskType] = useState<TaskType>(
    initialDraft?.taskType === "comment" ? "comment" : "task"
  );
  const [selectedRelays, setSelectedRelays] = useState<string[]>(() => {
    if (initialDraft?.selectedRelays && Array.isArray(initialDraft.selectedRelays)) {
      return initialDraft.selectedRelays.filter((id): id is string => typeof id === "string");
    }
    const activeRelays = relays.filter(r => r.isActive).map(r => r.id);
    return activeRelays.length > 0 ? activeRelays : [relays[0]?.id].filter(Boolean);
  });
  const [dueDate, setDueDate] = useState<Date | undefined>(() => {
    if (initialDraft?.dueDate) {
      const parsedDate = new Date(initialDraft.dueDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return defaultDueDate;
  });
  const [dueTime, setDueTime] = useState(initialDraft?.dueTime || "");
  const [dateType, setDateType] = useState<TaskDateType>(initialDraft?.dateType || "due");
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [explicitTagNames, setExplicitTagNames] = useState<string[]>(() => {
    if (!initialDraft?.explicitTagNames || !Array.isArray(initialDraft.explicitTagNames)) {
      return [];
    }
    return initialDraft.explicitTagNames
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  });
  const [explicitMentionPubkeys, setExplicitMentionPubkeys] = useState<string[]>(() => {
    if (!initialDraft?.explicitMentionPubkeys || !Array.isArray(initialDraft.explicitMentionPubkeys)) {
      return [];
    }
    return initialDraft.explicitMentionPubkeys
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/i.test(value));
  });
  const [priority, setPriority] = useState<number | undefined>(() => {
    if (typeof initialDraft?.priority !== "number") return undefined;
    return Number.isFinite(initialDraft.priority) ? initialDraft.priority : undefined;
  });
  const [isExpanded, setIsExpanded] = useState(
    () => !adaptiveSize || initialContent.trim().length > 0
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const prevSelectedPeoplePubkeysRef = useRef<string[]>([]);
  const autoManagedFilterTagNamesRef = useRef<Set<string>>(new Set());
  const autoManagedFilterMentionPubkeysRef = useRef<Set<string>>(new Set());
  const lastForceExpandSignalRef = useRef<number | undefined>(undefined);
  const lastAppliedRestoreRequestIdRef = useRef<number | null>(null);

  const hasMention = (text: string, mention: string) => {
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(text);
  };

  useEffect(() => {
    if (!adaptiveSize) {
      textareaRef.current?.focus();
    }
  }, [adaptiveSize]);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  useEffect(() => {
    if (adaptiveSize && forceExpanded) {
      setIsExpanded(true);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [adaptiveSize, forceExpanded]);

  useEffect(() => {
    if (!adaptiveSize) return;
    if (forceExpandSignal === undefined) return;
    if (lastForceExpandSignalRef.current === forceExpandSignal) return;
    lastForceExpandSignalRef.current = forceExpandSignal;
    setIsExpanded(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [adaptiveSize, forceExpandSignal]);

  useEffect(() => {
    if (!allowComment && taskType === "comment") {
      setTaskType("task");
    }
  }, [allowComment, taskType]);

  useEffect(() => {
    if (!composeRestoreRequest) return;
    if (lastAppliedRestoreRequestIdRef.current === composeRestoreRequest.id) return;
    lastAppliedRestoreRequestIdRef.current = composeRestoreRequest.id;
    const restoreState = composeRestoreRequest.state;
    setContent(restoreState.content || "");
    setTaskType(allowComment && restoreState.taskType === "comment" ? "comment" : "task");
    setDueDate(restoreState.dueDate);
    setDueTime(restoreState.dueTime || "");
    setDateType(restoreState.dateType || "due");
    setPriority(typeof restoreState.priority === "number" ? restoreState.priority : undefined);
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
    if (restoreState.selectedRelays && restoreState.selectedRelays.length > 0) {
      setSelectedRelays(restoreState.selectedRelays);
    }
    if (adaptiveSize) {
      setIsExpanded(true);
    }
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, [adaptiveSize, allowComment, composeRestoreRequest]);

  useEffect(() => {
    if (!draftStorageKey) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          content,
          taskType,
          dueDate: dueDate ? dueDate.toISOString() : undefined,
          dueTime,
          dateType,
          selectedRelays,
          explicitTagNames,
          explicitMentionPubkeys,
          priority,
        } satisfies ComposeDraftState)
      );
    } catch {
      // Ignore persistence errors.
    }
  }, [content, taskType, dueDate, dueTime, dateType, selectedRelays, explicitTagNames, explicitMentionPubkeys, priority, draftStorageKey]);

  useEffect(() => {
    if (!mentionRequest?.mention) return;
    const mention = mentionRequest.mention.startsWith("@")
      ? mentionRequest.mention
      : `@${mentionRequest.mention}`;

    setContent((previousContent) => {
      if (hasMention(previousContent, mention)) {
        return previousContent;
      }
      const separator = previousContent && !previousContent.endsWith(" ") ? " " : "";
      return `${previousContent}${separator}${mention} `;
    });

    if (adaptiveSize) {
      setIsExpanded(true);
    }

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, [mentionRequest, adaptiveSize]);

  // Keep selected publish targets aligned with currently active relay filters.
  useEffect(() => {
    const activeRelays = relays.filter((r) => r.isActive).map((r) => r.id);
    setSelectedRelays(activeRelays.length > 0 ? activeRelays : [relays[0]?.id].filter(Boolean));
  }, [relays]);

  useEffect(() => {
    const previous = new Set(prevIncludedChannelsRef.current);
    const next = new Set(includedChannels);
    const added = includedChannels.filter((name) => !previous.has(name));
    const removed = prevIncludedChannelsRef.current.filter((name) => !next.has(name));

    if (added.length === 0 && removed.length === 0) return;

    setExplicitTagNames((current) => {
      const nextTags = [...current];
      for (const tagName of added) {
        if (!nextTags.includes(tagName)) {
          nextTags.push(tagName);
        }
        autoManagedFilterTagNamesRef.current.add(tagName);
      }
      for (const tagName of removed) {
        if (!autoManagedFilterTagNamesRef.current.has(tagName)) continue;
        const index = nextTags.indexOf(tagName);
        if (index >= 0) nextTags.splice(index, 1);
        autoManagedFilterTagNamesRef.current.delete(tagName);
      }
      return nextTags;
    });

    prevIncludedChannelsRef.current = [...includedChannels];
  }, [includedChannels]);

  useEffect(() => {
    const previous = new Set(prevSelectedPeoplePubkeysRef.current);
    const next = new Set(selectedPeoplePubkeys);
    const added = selectedPeoplePubkeys.filter((pubkey) => !previous.has(pubkey));
    const removed = prevSelectedPeoplePubkeysRef.current.filter((pubkey) => !next.has(pubkey));

    if (added.length === 0 && removed.length === 0) return;

    setExplicitMentionPubkeys((current) => {
      const nextMentions = [...current];
      for (const pubkey of added) {
        if (!nextMentions.includes(pubkey)) {
          nextMentions.push(pubkey);
        }
        autoManagedFilterMentionPubkeysRef.current.add(pubkey);
      }
      for (const pubkey of removed) {
        if (!autoManagedFilterMentionPubkeysRef.current.has(pubkey)) continue;
        const index = nextMentions.indexOf(pubkey);
        if (index >= 0) nextMentions.splice(index, 1);
        autoManagedFilterMentionPubkeysRef.current.delete(pubkey);
      }
      return nextMentions;
    });

    prevSelectedPeoplePubkeysRef.current = [...selectedPeoplePubkeys];
  }, [selectedPeoplePubkeys]);

  const handleSubmit = async (submitType?: TaskType) => {
    if (!content.trim()) return;
    if (!hasMeaningfulComposerText(content)) return;
    
    const extractedTags = content.match(/#(\w+)/g)?.map(t => t.slice(1).toLowerCase()) || [];
    const submitTags = Array.from(new Set([...extractedTags, ...explicitTagNames]));
    if (submitTags.length === 0) {
      notifyNeedTag(t);
      return;
    }
    
    // Require authentication for any posting action (including demo-only local posts).
    if (!user) {
      if (onSignInClick) {
        onSignInClick();
      }
      return;
    }
    
    // Also add locally (and publish in parent handler)
    setIsPublishing(true);
    let result: TaskCreateResult;
    try {
      result = await Promise.resolve(
        onSubmit(
          content,
          submitTags,
          selectedRelays,
          submitType ?? taskType,
          dueDate,
          dueTime || undefined,
          dateType,
          explicitMentionPubkeys,
          priority
        )
      );
    } catch (error) {
      console.error("Task submit failed", error);
      notifyTaskCreationFailed(t);
      setIsPublishing(false);
      return;
    }
    setIsPublishing(false);
    if (!result.ok) {
      return;
    }
    setContent("");
    prevIncludedChannelsRef.current = [...includedChannels];
    prevSelectedPeoplePubkeysRef.current = [...selectedPeoplePubkeys];
    autoManagedFilterTagNamesRef.current = new Set(includedChannels);
    autoManagedFilterMentionPubkeysRef.current = new Set(selectedPeoplePubkeys);
    setDueDate(undefined);
    setDueTime("");
    setDateType("due");
    setExplicitTagNames([...includedChannels]);
    setExplicitMentionPubkeys([...selectedPeoplePubkeys]);
    setPriority(undefined);
    if (adaptiveSize) {
      setIsExpanded(false);
    }
    if (draftStorageKey) {
      localStorage.removeItem(draftStorageKey);
    }
  };

  const normalizedHashtagFilter = hashtagFilter.trim().toLowerCase();
  const filteredChannels = channels
    .filter((channel) => channel.name.toLowerCase().includes(normalizedHashtagFilter))
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName === normalizedHashtagFilter ? 1 : 0;
      const bExact = bName === normalizedHashtagFilter ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aPrefix = aName.startsWith(normalizedHashtagFilter) ? 1 : 0;
      const bPrefix = bName.startsWith(normalizedHashtagFilter) ? 1 : 0;
      if (aPrefix !== bPrefix) return bPrefix - aPrefix;

      if (aName.length !== bName.length) return aName.length - bName.length;

      const aIndex = aName.indexOf(normalizedHashtagFilter);
      const bIndex = bName.indexOf(normalizedHashtagFilter);
      if (aIndex !== bIndex) return aIndex - bIndex;

      return aName.localeCompare(bName);
    });
  const filteredPeople = people.filter((person) => {
    return personMatchesMentionQuery(person, mentionFilter);
  }).slice(0, 8);
  const parsedMentions = extractMentionIdentifiersFromContent(content);
  const parsedMentionSet = new Set(parsedMentions.map((identifier) => identifier.trim().toLowerCase()));
  const explicitMentionItems = explicitMentionPubkeys.map((pubkey) => {
    const person = people.find((candidate) => candidate.id.toLowerCase() === pubkey);
    const identifier = person ? getPreferredMentionIdentifier(person) : pubkey;
    return {
      pubkey,
      identifier,
      normalizedIdentifier: identifier.trim().toLowerCase(),
    };
  });
  const mentionChipMap = new Map<string, { identifier: string; metadataOnly: boolean; explicitPubkey?: string }>();
  for (const identifier of parsedMentions) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier) continue;
    mentionChipMap.set(normalizedIdentifier, {
      identifier,
      metadataOnly: false,
    });
  }
  for (const explicitMention of explicitMentionItems) {
    if (!explicitMention.normalizedIdentifier) continue;
    if (mentionChipMap.has(explicitMention.normalizedIdentifier)) continue;
    mentionChipMap.set(explicitMention.normalizedIdentifier, {
      identifier: explicitMention.identifier,
      metadataOnly: !parsedMentionSet.has(explicitMention.normalizedIdentifier),
      explicitPubkey: explicitMention.pubkey,
    });
  }
  const mentionChipItems = Array.from(mentionChipMap.values()).map((chip) => {
    const normalized = chip.identifier.trim().toLowerCase();
    const matchingPerson = people.find((person) => getMentionAliases(person).includes(normalized));
    const resolvedLabel = (matchingPerson?.name || matchingPerson?.displayName || "").trim();
    return {
      ...chip,
      label: resolvedLabel || formatMentionIdentifierForDisplay(chip.identifier),
    };
  });
  const parsedHashtags = Array.from(new Set((content.match(/#(\w+)/g) || []).map((tag) => tag.slice(1).toLowerCase())));
  const parsedHashtagSet = new Set(parsedHashtags);
  const hashtagChipItems = [
    ...parsedHashtags.map((tag) => ({ tag, metadataOnly: false })),
    ...explicitTagNames
      .filter((tag) => !parsedHashtagSet.has(tag))
      .map((tag) => ({ tag, metadataOnly: true })),
  ];
  const hasAtLeastOneTag = ((content.match(/#(\w+)/g)?.length || 0) + explicitTagNames.length) > 0;
  const hasMeaningfulContent = hasMeaningfulComposerText(content);
  const hasInvalidRootTaskRelaySelection = taskType === "task" && !parentId && selectedRelays.length !== 1;
  const submitBlockedReason = !user
    ? t("composer.blocked.signin")
    : !hasMeaningfulContent
      ? t("composer.blocked.write")
      : !hasAtLeastOneTag
        ? t("composer.blocked.tag")
        : hasInvalidRootTaskRelaySelection
          ? t("composer.blocked.relay")
        : isPublishing
          ? t("composer.blocked.publishing")
          : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showHashtagSuggestions) {
      if (filteredChannels.length > 0 && e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % filteredChannels.length);
        return;
      }
      if (filteredChannels.length > 0 && e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + filteredChannels.length) % filteredChannels.length);
        return;
      }
      if (
        filteredChannels.length > 0 &&
        (
          e.key === "Tab" ||
          (e.key === "Enter" && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey)
        )
      ) {
        e.preventDefault();
        const selected = filteredChannels[Math.max(activeSuggestionIndex, 0)] || filteredChannels[0];
        if (selected) {
          insertHashtag(selected.name);
        }
        return;
      }
      if (e.key === "Enter" && (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey)) {
        const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
        const textBeforeCursor = content.slice(0, effectiveCursor);
        const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
        if (hashtagMatch || /#\w*$/.test(content)) {
          const selected = filteredChannels[Math.max(activeSuggestionIndex, 0)] || filteredChannels[0];
          const typedHashtag = (hashtagMatch?.[1] || "").trim().toLowerCase();
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
        setActiveSuggestionIndex(0);
        return;
      }
    }
    if (showMentionSuggestions && filteredPeople.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % filteredPeople.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + filteredPeople.length) % filteredPeople.length);
        return;
      }
      if (
        e.key === "Tab" ||
        (e.key === "Enter" && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey)
      ) {
        e.preventDefault();
        const selected = filteredPeople[Math.max(activeSuggestionIndex, 0)] || filteredPeople[0];
        if (selected) {
          insertMention(getPreferredMentionIdentifier(selected));
        }
        return;
      }
      if (e.key === "Enter" && (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey)) {
        const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
        const textBeforeCursor = content.slice(0, effectiveCursor);
        if (/@[^\s@]*$/.test(textBeforeCursor) || /@[^\s@]*$/.test(content)) {
          e.preventDefault();
          const selected = filteredPeople[Math.max(activeSuggestionIndex, 0)] || filteredPeople[0];
          if (selected) {
            addMentionTagOnly(selected);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionSuggestions(false);
        setActiveSuggestionIndex(0);
        return;
      }
    }

    if (e.key === "Enter" && e.altKey && !showHashtagSuggestions && !showMentionSuggestions) {
      e.preventDefault();
      const alternateType: TaskType = allowComment
        ? taskType === "task"
          ? "comment"
          : "task"
        : "task";
      handleSubmit(alternateType);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === "Escape") {
      if (adaptiveSize) {
        setIsExpanded(false);
      }
      onCancel();
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setCursorPosition(cursorPos);

    const textBeforeCursor = newContent.slice(0, cursorPos);
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
    const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (hashtagMatch) {
      setHashtagFilter(hashtagMatch[1].toLowerCase());
      setShowHashtagSuggestions(true);
      setShowMentionSuggestions(false);
      setActiveSuggestionIndex(0);
    } else if (mentionMatch) {
      setMentionFilter((mentionMatch[1] || "").toLowerCase());
      setShowMentionSuggestions(true);
      setShowHashtagSuggestions(false);
      setActiveSuggestionIndex(0);
    } else {
      setShowHashtagSuggestions(false);
      setShowMentionSuggestions(false);
      setActiveSuggestionIndex(0);
    }
  };

  const insertHashtag = (tagName: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const hashtagStart = textBeforeCursor.lastIndexOf("#");
    const newContent = textBeforeCursor.slice(0, hashtagStart) + `#${tagName} ` + textAfterCursor;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setActiveSuggestionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertMention = (mentionToken: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const mentionStart = textBeforeCursor.lastIndexOf("@");
    if (mentionStart < 0) return;
    const newContent = textBeforeCursor.slice(0, mentionStart) + `@${mentionToken} ` + textAfterCursor;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setActiveSuggestionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const addHashtagTagOnly = (tagName: string) => {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!normalizedTag) return;

    setExplicitTagNames((previous) =>
      previous.includes(normalizedTag) ? previous : [...previous, normalizedTag]
    );

    const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
    const textBeforeCursor = content.slice(0, effectiveCursor);
    const hashtagStartFromCursor = textBeforeCursor.lastIndexOf("#");
    const hashtagStart = hashtagStartFromCursor >= 0 ? hashtagStartFromCursor : content.lastIndexOf("#");
    if (hashtagStart < 0) {
      return;
    }

    let hashtagEnd = hashtagStart + 1;
    while (hashtagEnd < content.length && !/\s/.test(content[hashtagEnd])) {
      hashtagEnd += 1;
    }

    const nextContent = (content.slice(0, hashtagStart) + content.slice(hashtagEnd))
      .replace(/[ \t]{2,}/g, " ");
    setContent(nextContent);
    setCursorPosition(hashtagStart);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(hashtagStart, hashtagStart);
    }, 0);

    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setHashtagFilter("");
    setActiveSuggestionIndex(0);
  };

  const addMentionTagOnly = (person: Person) => {
    const normalizedPubkey = person.id.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedPubkey)) {
      return;
    }

    const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
    const textBeforeCursor = content.slice(0, effectiveCursor);
    const mentionStartFromCursor = textBeforeCursor.lastIndexOf("@");
    const mentionStart = mentionStartFromCursor >= 0 ? mentionStartFromCursor : content.lastIndexOf("@");
    if (mentionStart < 0) {
      return;
    }

    setExplicitMentionPubkeys((previous) =>
      previous.includes(normalizedPubkey) ? previous : [...previous, normalizedPubkey]
    );

    let mentionEnd = mentionStart + 1;
    while (mentionEnd < content.length && !/\s/.test(content[mentionEnd])) {
      mentionEnd += 1;
    }

    const nextContent = (content.slice(0, mentionStart) + content.slice(mentionEnd))
      .replace(/[ \t]{2,}/g, " ");
    setContent(nextContent);
    setCursorPosition(mentionStart);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(mentionStart, mentionStart);
    }, 0);

    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setMentionFilter("");
    setActiveSuggestionIndex(0);
  };

  const removeExplicitHashtag = (tagName: string) => {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!normalizedTag) return;
    setExplicitTagNames((previous) => previous.filter((tag) => tag !== normalizedTag));
  };

  const removeExplicitMention = (pubkey: string | undefined) => {
    if (!pubkey) return;
    const normalizedPubkey = pubkey.trim().toLowerCase();
    setExplicitMentionPubkeys((previous) => previous.filter((value) => value !== normalizedPubkey));
  };

  const showExpandedControls = !adaptiveSize || isExpanded || content.trim().length > 0;

  useEffect(() => {
    if (showExpandedControls) return;
    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setActiveSuggestionIndex(0);
  }, [showExpandedControls]);

  return (
    <div
      className={cn("space-y-3", compact && "space-y-2", adaptiveSize && !showExpandedControls && "space-y-1")}
      data-onboarding="focused-compose"
    >
      <div className="relative">
        <textarea
          data-onboarding="compose-input"
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (adaptiveSize && !isExpanded) {
              setIsExpanded(true);
            }
          }}
          placeholder={taskType === "task" ? t("composer.placeholders.task") : t("composer.placeholders.comment")}
          aria-label={taskType === "task" ? t("composer.placeholders.task") : t("composer.placeholders.comment")}
          title={t("composer.hints.composeField")}
          className={cn(
            "w-full bg-muted/60 border border-border/50 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm",
            adaptiveSize && !showExpandedControls
              ? "min-h-[42px] py-2"
              : compact
                ? "min-h-[60px]"
                : "min-h-[80px]"
          )}
          rows={adaptiveSize && !showExpandedControls ? 1 : compact ? 2 : 3}
        />

        {/* Channel suggestions */}
        {showHashtagSuggestions && filteredChannels.length > 0 && (
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-56 py-1 max-h-72 overflow-y-auto overscroll-contain">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (e.altKey) {
                    addHashtagTagOnly(channel.name);
                    return;
                  }
                  insertHashtag(channel.name);
                }}
                onMouseEnter={() => {
                  const index = filteredChannels.findIndex((c) => c.id === channel.id);
                  setActiveSuggestionIndex(index >= 0 ? index : 0);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                  filteredChannels[activeSuggestionIndex]?.id === channel.id ? "bg-muted" : "hover:bg-muted"
                )}
              >
                <Hash className="w-4 h-4 text-primary" />
                <span className="text-sm truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        )}
        {showMentionSuggestions && filteredPeople.length > 0 && (
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-[22rem] max-w-[calc(100vw-2rem)] py-1 max-h-72 overflow-y-auto overscroll-contain">
            {filteredPeople.map((person) => {
                  const mentionIdentifier = getPreferredMentionIdentifier(person);
                  const mentionDisplay = formatMentionIdentifierForDisplay(mentionIdentifier);
                  const isActive = filteredPeople[activeSuggestionIndex]?.id === person.id;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (e.altKey) {
                          addMentionTagOnly(person);
                          return;
                        }
                        insertMention(mentionIdentifier);
                      }}
                  onMouseEnter={() => {
                    const index = filteredPeople.findIndex((p) => p.id === person.id);
                    setActiveSuggestionIndex(index >= 0 ? index : 0);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left",
                    isActive ? "bg-muted" : "hover:bg-muted"
                  )}
                  >
                  <UserAvatar
                    id={person.id}
                    displayName={person.displayName || person.name}
                    avatarUrl={person.avatar}
                    className="w-4 h-4"
                  />
                  <span className="text-sm min-w-0 flex-1 truncate">@{person.name || person.displayName}</span>
                  <span
                    className="text-xs text-muted-foreground max-w-[11rem] truncate"
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

      {showExpandedControls && taskType !== "task" && (mentionChipItems.length > 0 || hashtagChipItems.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {mentionChipItems.map((mention) => (
            <button
              key={`mention-${mention.identifier}`}
              type="button"
              data-testid="compose-mention-chip"
              onClick={() => removeExplicitMention(mention.explicitPubkey)}
              className={cn(
                "group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary",
                mention.metadataOnly && "cursor-pointer hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              )}
              disabled={!mention.metadataOnly}
              title={`${t("composer.labels.mentions")}: @${mention.identifier}`}
            >
              {mention.metadataOnly ? (
                <>
                  <AtSign className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <AtSign className="w-3 h-3" />
              )}
              {mention.label}
            </button>
          ))}
          {hashtagChipItems.map((tagChip) => (
            <button
              key={`hashtag-${tagChip.tag}`}
              type="button"
              data-testid="compose-hashtag-chip"
              onClick={() => removeExplicitHashtag(tagChip.tag)}
              className={cn(
                "group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground",
                tagChip.metadataOnly && "cursor-pointer hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
              )}
              disabled={!tagChip.metadataOnly}
            >
              {tagChip.metadataOnly ? (
                <>
                  <Hash className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <Hash className="w-3 h-3" />
              )}
              {tagChip.tag}
            </button>
          ))}
        </div>
      )}

      {/* Due date for tasks */}
      {showExpandedControls && taskType === "task" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-w-[5.5rem] items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label={t("composer.labels.priority")}
              value={priority === undefined ? "" : String(priority)}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setPriority(undefined);
                  return;
                }
                const parsed = Number.parseInt(value, 10);
                setPriority(Number.isFinite(parsed) ? parsed : undefined);
              }}
              className="h-8 w-full cursor-pointer rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
            >
              <option value="">{t("composer.labels.priority")}</option>
              <option value="20">P20</option>
              <option value="40">P40</option>
              <option value="60">P60</option>
              <option value="80">P80</option>
              <option value="100">P100</option>
            </select>
          </div>

          <div className="inline-flex min-w-[20rem] items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label={t("composer.labels.dateType")}
              value={dateType}
              onChange={(event) => setDateType(event.target.value as TaskDateType)}
              className="h-8 w-24 cursor-pointer rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
            >
              <option value="due">{t("composer.dates.due")}</option>
              <option value="scheduled">{t("composer.dates.scheduled")}</option>
              <option value="start">{t("composer.dates.start")}</option>
              <option value="end">{t("composer.dates.end")}</option>
              <option value="milestone">{t("composer.dates.milestone")}</option>
            </select>
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-8 min-w-[6.5rem] rounded-md border border-border/50 px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                  {dueDate
                    ? format(dueDate, "MMM d, yyyy")
                    : t("composer.dates.setOptional", {
                        dateType: t(`composer.dates.${dateType}`),
                      })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {dueDate && (
              <>
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="h-8 w-16 rounded-md border border-border/50 bg-transparent px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={() => {
                    setDueDate(undefined);
                    setDueTime("");
                  }}
                  className="rounded-md p-1.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

          {mentionChipItems.map((mention) => (
            <button
              key={`mention-task-${mention.identifier}`}
              type="button"
              data-testid="compose-mention-chip"
              onClick={() => removeExplicitMention(mention.explicitPubkey)}
              className={cn(
                "group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary",
                mention.metadataOnly && "cursor-pointer hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              )}
              disabled={!mention.metadataOnly}
              title={`${t("composer.labels.mentions")}: @${mention.identifier}`}
            >
              {mention.metadataOnly ? (
                <>
                  <AtSign className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <AtSign className="w-3 h-3" />
              )}
              {mention.label}
            </button>
          ))}
          {hashtagChipItems.map((tagChip) => (
            <button
              key={`hashtag-task-${tagChip.tag}`}
              type="button"
              data-testid="compose-hashtag-chip"
              onClick={() => removeExplicitHashtag(tagChip.tag)}
              className={cn(
                "group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground",
                tagChip.metadataOnly && "cursor-pointer hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
              )}
              disabled={!tagChip.metadataOnly}
            >
              {tagChip.metadataOnly ? (
                <>
                  <Hash className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <Hash className="w-3 h-3" />
              )}
              {tagChip.tag}
            </button>
          ))}
        </div>
      )}

      {/* Sign in prompt for posting */}
      {showExpandedControls && !user && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-xl">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground flex-1">
            {t("composer.blocked.signin")}
          </span>
          {onSignInClick && (
            <button
              onClick={onSignInClick}
              className="text-sm text-primary hover:underline"
            >
              {t("composer.actions.signin")}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {showExpandedControls && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const cursorPos = textareaRef.current?.selectionStart || content.length;
              const newContent = content.slice(0, cursorPos) + "#" + content.slice(cursorPos);
              setContent(newContent);
              setCursorPosition(cursorPos + 1);
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
                  setShowHashtagSuggestions(true);
                }
              }, 10);
            }}
            className="p-2 rounded-xl hover:bg-muted/70 transition-colors"
            aria-label={t("composer.hints.insertHashtag")}
            title={t("composer.hints.insertHashtagOpen")}
          >
            <Hash className="w-4 h-4 text-primary" />
          </button>
          <button
            onClick={() => {
              const cursorPos = textareaRef.current?.selectionStart || content.length;
              const newContent = content.slice(0, cursorPos) + "@" + content.slice(cursorPos);
              setContent(newContent);
              setCursorPosition(cursorPos + 1);
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
                  setShowMentionSuggestions(true);
                  setShowHashtagSuggestions(false);
                  setMentionFilter("");
                  setActiveSuggestionIndex(0);
                }
              }, 10);
            }}
            className="p-2 rounded-xl hover:bg-muted/70 transition-colors"
            aria-label={t("composer.hints.insertMention")}
            title={t("composer.hints.insertMentionOpen")}
          >
            <AtSign className="w-4 h-4 text-primary" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {submitBlockedReason && (
            <span className="text-xs text-muted-foreground">{submitBlockedReason}</span>
          )}
          <div className="inline-flex rounded-xl overflow-hidden border border-border/40 shadow-sm">
            {allowComment && (
              <div
                data-onboarding="compose-kind"
                className="inline-flex items-center gap-1 bg-muted/40 border-r border-border/50 p-1"
              >
                <select
                  aria-label={t("composer.labels.kind")}
                  value={taskType}
                  onChange={(event) => setTaskType(event.target.value as TaskType)}
                  className="sr-only"
                >
                  <option value="task">{t("composer.labels.task")}</option>
                  <option value="comment">{t("composer.labels.comment")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setTaskType("task")}
                  aria-label={t("composer.labels.task")}
                  className={cn(
                    "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                    taskType === "task"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Hash className="w-3.5 h-3.5" />
                  <span>{t("composer.labels.task")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType("comment")}
                  aria-label={t("composer.labels.comment")}
                  className={cn(
                    "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                    taskType === "comment"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AtSign className="w-3.5 h-3.5" />
                  <span>{t("composer.labels.comment")}</span>
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={Boolean(submitBlockedReason)}
              aria-label={taskType === "task" ? t("composer.actions.createTask") : t("composer.actions.addComment")}
              title={taskType === "task" ? t("composer.actions.createTask") : t("composer.actions.addComment")}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPublishing && (
                <span className="w-3 h-3 border border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              )}
              {taskType === "task" ? t("composer.actions.createTask") : t("composer.actions.addComment")}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
