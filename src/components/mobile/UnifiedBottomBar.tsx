import { useState, useRef, useEffect } from "react";
import { Search, X, Hash, Radio, Users, Check, Minus, Calendar, Clock, MessageSquare, CheckSquare, Send, Zap, Building2, Gamepad2, Cpu, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskCreateResult, TaskDateType, ComposeRestoreRequest } from "@/types";
import { ViewType } from "@/components/tasks/ViewSwitcher";
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

interface UnifiedBottomBarProps {
  // Search props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Compose props
  onSubmit: (
    content: string,
    channels: string[],
    relays: string[],
    taskType: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    explicitMentionPubkeys?: string[],
    priority?: number
  ) => Promise<TaskCreateResult> | TaskCreateResult;
  currentView: ViewType;
  focusedTaskId?: string | null;
  selectedCalendarDate?: Date | null;
  // Filter data (dual-purpose)
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  // Filter handlers
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  // Default content for composing
  defaultContent?: string;
  isSignedIn: boolean;
  onSignInClick: () => void;
  forceComposeMode?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

type SelectorType = "relay" | "channel" | "person" | "date" | null;

const relayIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  users: Users,
  "gamepad-2": Gamepad2,
  cpu: Cpu,
  radio: Radio,
  "play-circle": PlayCircle,
};

const getMonthKey = (month: Date) => format(startOfMonth(month), "yyyy-MM");

export function UnifiedBottomBar({
  searchQuery,
  onSearchChange,
  onSubmit,
  currentView,
  focusedTaskId = null,
  selectedCalendarDate = null,
  relays,
  channels,
  people,
  onRelayToggle,
  onChannelToggle,
  onPersonToggle,
  defaultContent = "",
  isSignedIn,
  onSignInClick,
  composeRestoreRequest = null,
}: UnifiedBottomBarProps) {
  const { t } = useTranslation();
  const hasModifierKey = (event: Pick<React.KeyboardEvent | React.MouseEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "getModifierState">): boolean =>
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.getModifierState("Alt") ||
    event.getModifierState("Control") ||
    event.getModifierState("Meta") ||
    event.getModifierState("Shift");
  const truncateMobilePubkey = (value: string): string => {
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };

  const includedChannels = channels.filter((c) => c.filterState === "included").map((c) => c.name);
  const [sharedText, setSharedText] = useState(() => searchQuery || defaultContent);
  const [activeSelector, setActiveSelector] = useState<SelectorType>(null);
  const [isBottomBarFocused, setIsBottomBarFocused] = useState(false);
  const [isBottomBarInteracting, setIsBottomBarInteracting] = useState(false);
  const [isComposeFocused, setIsComposeFocused] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState("");
  const [dateType, setDateType] = useState<TaskDateType>("due");
  const [priority, setPriority] = useState<number | undefined>(undefined);
  const [explicitTagNames, setExplicitTagNames] = useState<string[]>([]);
  const [explicitMentionPubkeys, setExplicitMentionPubkeys] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const canOfferComment = currentView === "feed" || currentView === "tree";
  const lastAppliedRestoreRequestIdRef = useRef<number | null>(null);

  const syncChannelFiltersFromContent = (nextContent: string, previousContent: string) => {
    const endedWithSpace = /\s$/.test(nextContent);
    const removedText = nextContent.length < previousContent.length;
    if (!endedWithSpace && !removedText) return;

    const extractCommittedTags = (content: string) =>
      new Set((content.match(/#(\w+)(?=\s)/g) || []).map((token) => token.slice(1).toLowerCase()));

    const previousCommittedTags = extractCommittedTags(previousContent);
    const nextCommittedTags = extractCommittedTags(nextContent);
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
          onChannelToggle(channel.id);
        } else if (channel.filterState === "excluded") {
          onChannelToggle(channel.id);
          onChannelToggle(channel.id);
        }
        continue;
      }

      if (channel.filterState === "included") {
        onChannelToggle(channel.id);
        onChannelToggle(channel.id);
      } else if (channel.filterState === "excluded") {
        onChannelToggle(channel.id);
      }
    }
  };

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
    onSearchChange(restoreState.content || "");
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
    setActiveSelector(null);
    setShowSendOptions(false);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      cursorPositionRef.current = end;
    });
  }, [composeRestoreRequest, onSearchChange]);

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
    requestAnimationFrame(() => {
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
        requestAnimationFrame(() => {
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

  const handleSubmit = async (submitType: "task" | "comment" = "task") => {
    if (!sharedText.trim()) return;
    if (!hasMeaningfulComposerText(sharedText)) return;
    const extractedChannels = sharedText.match(/#(\w+)/g)?.map((token) => token.slice(1).toLowerCase()) || [];
    const submitChannels = Array.from(new Set([...extractedChannels, ...explicitTagNames]));
    if (submitChannels.length === 0) {
      notifyNeedTag(t);
      return;
    }
    const activeRelayIds = relays.filter(r => r.isActive).map(r => r.id);
    const relayIds = activeRelayIds.length > 0 ? activeRelayIds : [relays[0]?.id].filter(Boolean);
    if (submitType === "task" && !focusedTaskId && relayIds.length !== 1) {
      toast.error(t("toasts.errors.selectRelayOrParent"));
      return;
    }
    let result: TaskCreateResult;
    try {
      result = await Promise.resolve(onSubmit(
        sharedText,
        submitChannels,
        relayIds,
        submitType,
        dueDate,
        dueTime || undefined,
        dateType,
        explicitMentionPubkeys,
        priority
      ));
    } catch (error) {
      console.error("Mobile task submit failed", error);
      notifyTaskCreationFailed(t);
      return;
    }
    if (!result.ok) {
      return;
    }
    const hashtagOnlyContent = Array.from(
      new Set([
        ...(sharedText.match(/#(\w+)/g) || []).map((tag) => tag.toLowerCase()),
        ...explicitTagNames.map((tag) => `#${tag.toLowerCase()}`),
      ])
    ).join(" ");
    setSharedText(hashtagOnlyContent);
    onSearchChange(hashtagOnlyContent);
    prevIncludedChannelsRef.current = [...includedChannels];
    autoManagedChannelsRef.current = new Set(includedChannels);
    setDueDate(undefined);
    setDueTime("");
    setDateType("due");
    setPriority(undefined);
    setExplicitTagNames([]);
    setExplicitMentionPubkeys([]);
    setActiveSelector(null);
  };

  const handleCancel = () => {
    setSharedText("");
    onSearchChange("");
    setActiveSelector(null);
    setShowSendOptions(false);
    setShowMentionSuggestions(false);
    setMentionFilter("");
    setActiveMentionIndex(0);
  };

  const toggleSelector = (type: SelectorType) => {
    setActiveSelector(activeSelector === type ? null : type);
  };

  // Count active filters
  const activeRelaysCount = relays.filter(r => r.isActive).length;
  const activeChannelsCount = channels.filter(c => c.filterState !== "neutral").length;
  const activePeopleCount = people.filter(p => p.isSelected).length;
  const activeRelayIds = relays.filter((relay) => relay.isActive).map((relay) => relay.id);
  const hasInvalidRootTaskRelaySelection = !focusedTaskId && activeRelayIds.length !== 1;
  const hasComposeText = sharedText.trim().length > 0;
  const hasMeaningfulComposeText = hasMeaningfulComposerText(sharedText);
  const hasAtLeastOneTag = ((sharedText.match(/#(\w+)/g)?.length || 0) + explicitTagNames.length) > 0;
  const taskSubmitBlockedReason = !isSignedIn
    ? t("composer.blocked.signin")
    : !hasMeaningfulComposeText
      ? t("composer.blocked.write")
      : !hasAtLeastOneTag
        ? t("composer.blocked.tag")
        : hasInvalidRootTaskRelaySelection
          ? t("composer.blocked.relay")
          : null;
  const filteredPeople = people.filter((person) => {
    return personMatchesMentionQuery(person, mentionFilter);
  }).slice(0, 8);

  useEffect(() => {
    if (taskSubmitBlockedReason && activeSelector === "date") {
      setActiveSelector(null);
    }
  }, [activeSelector, taskSubmitBlockedReason]);

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
    onSearchChange(newText);
    setShowMentionSuggestions(false);
    setActiveMentionIndex(0);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const pos = mentionStart + mentionToken.length + 2;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      cursorPositionRef.current = pos;
    }, 0);
  };

  const canSendTask = hasMeaningfulComposeText && !hasInvalidRootTaskRelaySelection;
  const canSendComment = hasMeaningfulComposeText && hasAtLeastOneTag;
  const canOpenSendOptions = isSignedIn && canOfferComment && hasComposeText;
  const canSubmitFromPrimary = canOfferComment ? (canSendTask || canSendComment) : canSendTask;
  const hasTaskSubmitBlock = taskSubmitBlockedReason !== null;
  const showInlineTaskSubmitBlock = hasTaskSubmitBlock && (
    isComposeFocused || (hasComposeText && (isBottomBarFocused || isBottomBarInteracting))
  );

  const handlePrimarySend = () => {
    if (!isSignedIn) {
      onSignInClick();
      return;
    }
    if (canOfferComment) {
      setShowSendOptions((previous) => !previous);
      return;
    }
    void handleSubmit("task");
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
    onSearchChange(newText);
    setTimeout(() => {
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
    onSearchChange(newText);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(hashtagStart, hashtagStart);
      cursorPositionRef.current = hashtagStart;
    }, 0);
  };

  return (
    <div
      ref={bottomBarRef}
      onFocusCapture={() => setIsBottomBarFocused(true)}
      onBlurCapture={() => {
        requestAnimationFrame(() => {
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
                const RelayIcon = relayIconMap[relay.icon] || Building2;
                return (
                  <button
                    key={relay.id}
                    onClick={() => onRelayToggle(relay.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors",
                      relay.isActive
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border"
                    )}
                  >
                    <RelayIcon className="w-4 h-4" />
                    {relay.name}
                    {relay.isActive && <Check className="w-3 h-3" />}
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
                  onClick={() => onChannelToggle(channel.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors",
                    channel.filterState === "included" && "bg-success/10 border-success text-success",
                    channel.filterState === "excluded" && "bg-destructive/10 border-destructive text-destructive",
                    channel.filterState === "neutral" && "border-border"
                  )}
                >
                  #{channel.name}
                  {channel.filterState === "included" && <Check className="w-3 h-3" />}
                  {channel.filterState === "excluded" && <X className="w-3 h-3" />}
                  {channel.filterState === "neutral" && <Minus className="w-3 h-3 opacity-50" />}
                </button>
              ))}
            </div>
          )}
          {activeSelector === "person" && (
            <div className="flex flex-wrap gap-2">
              {people.map((person) => {
                const personLabel =
                  person.name === person.id ? truncateMobilePubkey(person.name) : person.name;
                return (
                  <button
                    key={person.id}
                    onClick={() => onPersonToggle(person.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors",
                      person.isSelected
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border"
                    )}
                  >
                    <UserAvatar
                      id={person.id}
                      displayName={person.displayName || person.name}
                      avatarUrl={person.avatar}
                      className="w-5 h-5"
                    />
                    <span className="truncate max-w-[8rem]" title={person.name}>
                      {personLabel}
                    </span>
                    {person.isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}
          {activeSelector === "date" && (
            <div
              ref={dateScrollerRef}
              className="-mx-3 px-3 w-full overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
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
                      className="snap-start shrink-0 w-[calc(100vw-2rem)] max-w-[20rem]"
                    >
                      <CalendarComponent
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        month={month}
                        className="pointer-events-auto !p-0"
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
          {showInlineTaskSubmitBlock ? (
            <div className="h-8 inline-flex items-center justify-center rounded-md border border-border/70 bg-muted/40 px-2 text-xs leading-none text-muted-foreground">
              {taskSubmitBlockedReason}
            </div>
          ) : !hasTaskSubmitBlock ? (
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground shrink-0">
              <div className="flex items-center gap-1">
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
                  className="h-8 min-w-[4.5rem] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">{t("composer.labels.priorityShort")}</option>
                  <option value="20">P20</option>
                  <option value="40">P40</option>
                  <option value="60">P60</option>
                  <option value="80">P80</option>
                  <option value="100">P100</option>
                </select>
                <button
                  onClick={() => toggleSelector("date")}
                  className={cn(
                    "h-8 flex items-center gap-1.5 px-2 rounded-md border transition-colors text-xs leading-none",
                    activeSelector === "date"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/60"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {dueDate ? format(dueDate, "MMM d") : t("composer.labels.date")}
                </button>
              </div>
              {dueDate && (
                <div className="flex items-center gap-1">
                  <select
                    aria-label={t("composer.labels.dateType")}
                    value={dateType}
                    onChange={(event) => setDateType(event.target.value as TaskDateType)}
                    className="h-8 w-[5.2rem] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    <option value="due">{t("composer.dates.due")}</option>
                    <option value="scheduled">{t("composer.dates.scheduled")}</option>
                    <option value="start">{t("composer.dates.start")}</option>
                    <option value="end">{t("composer.dates.end")}</option>
                    <option value="milestone">{t("composer.dates.milestone")}</option>
                  </select>
                  <div className="h-8 flex items-center gap-1.5 px-2 rounded-md border border-border bg-muted/30">
                    <Clock className="w-3.5 h-3.5" />
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="text-xs bg-transparent focus:outline-none w-[4.1rem]"
                    />
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
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <button
              onClick={() => toggleSelector("relay")}
              className={cn(
                "relative p-2 rounded-md transition-colors",
                activeSelector === "relay" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Radio className="w-4 h-4" />
              {activeRelaysCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activeRelaysCount}
                </span>
              )}
            </button>
            <button
              onClick={() => toggleSelector("channel")}
              className={cn(
                "relative p-2 rounded-md transition-colors",
                activeSelector === "channel" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Hash className="w-4 h-4" />
              {activeChannelsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activeChannelsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => toggleSelector("person")}
              className={cn(
                "relative p-2 rounded-md transition-colors",
                activeSelector === "person" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-4 h-4" />
              {activePeopleCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[0.625rem] rounded-full flex items-center justify-center">
                  {activePeopleCount}
                </span>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="flex items-stretch gap-2 p-3">
        <div className="flex-1">
          <div className="flex h-[3.3rem] items-stretch gap-2 text-sm">
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
                onFocus={() => setIsComposeFocused(true)}
                onBlur={() => setIsComposeFocused(false)}
                onChange={(e) => {
                  const value = e.target.value;
                  cursorPositionRef.current = e.target.selectionStart;
                  const textBeforeCursor = value.slice(0, e.target.selectionStart);
                  const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);
                  if (mentionMatch) {
                    setMentionFilter((mentionMatch[1] || "").toLowerCase());
                    setShowMentionSuggestions(true);
                    setActiveMentionIndex(0);
                  } else {
                    setShowMentionSuggestions(false);
                    setActiveMentionIndex(0);
                  }
                  syncChannelFiltersFromContent(value, sharedText);
                  setSharedText(value);
                  onSearchChange(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.altKey) {
                    const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPositionRef.current;
                    const textBeforeCursor = sharedText.slice(0, effectiveCursor);
                    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
                    if (hashtagMatch || /#\w*$/.test(textBeforeCursor)) {
                      const tagName = (hashtagMatch?.[1] || "").trim().toLowerCase();
                      if (tagName) {
                        e.preventDefault();
                        addHashtagTagOnly(tagName);
                        return;
                      }
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
                    if (e.key === "Enter" || e.key === "Tab") {
                      if (e.key === "Enter" && hasModifierKey(e)) {
                        const textBeforeCursor = sharedText.slice(0, cursorPositionRef.current);
                        if (/@[^\s@]*$/.test(textBeforeCursor) || /@[^\s@]*$/.test(sharedText)) {
                          e.preventDefault();
                          const selected = filteredPeople[Math.max(activeMentionIndex, 0)] || filteredPeople[0];
                          if (selected) {
                            addMentionTagOnly(selected);
                          }
                          return;
                        }
                      }
                      e.preventDefault();
                      const selected = filteredPeople[Math.max(activeMentionIndex, 0)] || filteredPeople[0];
                      if (selected) {
                        insertMention(getPreferredMentionIdentifier(selected));
                      }
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShowMentionSuggestions(false);
                      setActiveMentionIndex(0);
                      return;
                    }
                  }
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmit();
                    return;
                  }
                  if (e.key === "Enter" && e.altKey) {
                    e.preventDefault();
                    handleSubmit(canOfferComment ? "comment" : "task");
                    return;
                  }
                  if (e.key === "Escape") {
                    handleCancel();
                  }
                }}
                placeholder={t("composer.placeholders.mobileTask")}
                className="h-full w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm leading-[1.35] resize-none overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus:outline-none focus:ring-2 focus:ring-primary/50"
                rows={1}
              />
              {showMentionSuggestions && filteredPeople.length > 0 && (
                <div className="motion-selector-panel absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-full py-1 max-h-72 overflow-y-auto overscroll-contain">
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
                          if (hasModifierKey(e)) {
                            addMentionTagOnly(person);
                            return;
                          }
                          insertMention(mentionIdentifier);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left",
                          activeMentionIndex === index ? "bg-muted" : "hover:bg-muted"
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
            <div className="flex h-full items-stretch gap-1.5">
              <div className="relative">
                <button
                  onClick={handlePrimarySend}
                  disabled={isSignedIn ? !canSubmitFromPrimary : false}
                  className={cn(
                    "h-full w-11 inline-flex items-center justify-center rounded-lg border transition-colors",
                    isSignedIn
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                  aria-label={isSignedIn ? (canOfferComment ? `${t("composer.actions.sendTask")} / ${t("composer.actions.sendComment")}` : t("composer.actions.sendTask")) : t("composer.hints.signInToCreate")}
                  title={
                    !isSignedIn
                      ? t("composer.hints.signInToCreate")
                      : canOfferComment
                        ? `${t("composer.actions.sendTask")} / ${t("composer.actions.sendComment")}`
                        : hasInvalidRootTaskRelaySelection
                          ? t("toasts.errors.selectRelayOrParent")
                          : t("composer.hints.createFromText")
                  }
                >
                  {!isSignedIn ? <Zap className="w-5 h-5" /> : canOfferComment ? <Send className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
                </button>

                {showSendOptions && canOpenSendOptions && (
                  <div className="absolute bottom-full right-0 mb-1.5 flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg z-[116]">
                    <button
                      onClick={() => {
                        setShowSendOptions(false);
                        void handleSubmit("task");
                      }}
                      disabled={hasTaskSubmitBlock}
                      className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      aria-label={t("composer.actions.sendTask")}
                      title={hasInvalidRootTaskRelaySelection ? t("toasts.errors.selectRelayOrParent") : t("composer.actions.sendTask")}
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
                      aria-label={t("composer.actions.sendComment")}
                      title={t("composer.actions.sendComment")}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
