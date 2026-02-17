import { useState, useRef, useEffect } from "react";
import { Search, Send, X, Hash, Radio, Users, Check, Minus, Calendar, Clock, CheckSquare, MessageSquare, Zap, Building2, Gamepad2, Cpu, PlayCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType } from "@/types";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";
import { getPreferredMentionIdentifier, personMatchesMentionQuery } from "@/lib/mentions";

interface UnifiedBottomBarProps {
  // Search props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Compose props
  onSubmit: (content: string, channels: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string) => void;
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
}

type SelectorType = "relay" | "channel" | "person" | null;

const relayIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  users: Users,
  "gamepad-2": Gamepad2,
  cpu: Cpu,
  radio: Radio,
  "play-circle": PlayCircle,
};

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
}: UnifiedBottomBarProps) {
  const truncateMobilePubkey = (value: string): string => {
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };

  const includedChannels = channels.filter((c) => c.filterState === "included").map((c) => c.name);
  const [sharedText, setSharedText] = useState(() => searchQuery || defaultContent);
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [activeSelector, setActiveSelector] = useState<SelectorType>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPositionRef = useRef(0);
  const prevSearchQueryRef = useRef(searchQuery);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const autoManagedChannelsRef = useRef<Set<string>>(new Set());
  const canOfferComment = currentView === "feed" || (currentView === "tree" && Boolean(focusedTaskId));

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
    if (currentView === "calendar" && taskType === "task") {
      setDueDate(selectedCalendarDate || new Date());
    }
  }, [currentView, taskType, selectedCalendarDate]);

  useEffect(() => {
    if (!canOfferComment && taskType === "comment") {
      setTaskType("task");
    }
  }, [canOfferComment, taskType]);

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

  const handleSubmit = (submitType?: TaskType) => {
    if (!sharedText.trim()) return;
    const extractedChannels = sharedText.match(/#(\w+)/g)?.map(t => t.slice(1)) || [];
    if (extractedChannels.length === 0) {
      toast.error("Add at least one #channel before posting");
      return;
    }
    const activeRelayIds = relays.filter(r => r.isActive).map(r => r.id);
    const relayIds = activeRelayIds.length > 0 ? activeRelayIds : [relays[0]?.id].filter(Boolean);
    onSubmit(sharedText, extractedChannels, relayIds, submitType ?? taskType, dueDate, dueTime || undefined);
    const hashtagOnlyContent = Array.from(
      new Set((sharedText.match(/#(\w+)/g) || []).map((tag) => tag.toLowerCase()))
    ).join(" ");
    setSharedText(hashtagOnlyContent);
    onSearchChange(hashtagOnlyContent);
    prevIncludedChannelsRef.current = [...includedChannels];
    autoManagedChannelsRef.current = new Set(includedChannels);
    setDueDate(undefined);
    setDueTime("");
    setActiveSelector(null);
  };

  const handleCancel = () => {
    setSharedText("");
    onSearchChange("");
    setActiveSelector(null);
  };

  const toggleSelector = (type: SelectorType) => {
    setActiveSelector(activeSelector === type ? null : type);
  };

  // Count active filters
  const activeRelaysCount = relays.filter(r => r.isActive).length;
  const activeChannelsCount = channels.filter(c => c.filterState !== "neutral").length;
  const activePeopleCount = people.filter(p => p.isSelected).length;
  const hasAtLeastOneTag = (sharedText.match(/#(\w+)/g)?.length || 0) > 0;
  const filteredPeople = people.filter((person) => {
    return personMatchesMentionQuery(person, mentionFilter);
  }).slice(0, 8);

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

  return (
    <div className="border-t border-border bg-background safe-area-bottom" data-onboarding="mobile-combined-box">
      {/* Selector Panel */}
      {activeSelector && (
        <div className="border-b border-border p-3 max-h-48 overflow-y-auto">
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
                    <img src={person.avatar} alt={person.name} className="w-5 h-5 rounded-full" />
                    <span className="truncate max-w-[8rem]" title={person.name}>
                      {personLabel}
                    </span>
                    {person.isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Controls Row */}
      <div className="px-3 pt-2">
        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-2 pt-1">
          {canOfferComment && (
            <div className="flex h-8 items-center gap-1 px-1 bg-muted/50 rounded-md shrink-0">
            <button
              onClick={() => setTaskType("task")}
              aria-label="Task"
              className={cn(
                "h-6 w-6 flex items-center justify-center rounded-sm transition-colors",
                taskType === "task" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTaskType("comment")}
              aria-label="Comment"
              className={cn(
                "h-6 w-6 flex items-center justify-center rounded-sm transition-colors",
                taskType === "comment" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            </div>
          )}

          {taskType === "task" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors">
                  <Calendar className="w-3.5 h-3.5" />
                  {dueDate ? format(dueDate, "MMM d") : "Due"}
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
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-muted/30">
                  <Clock className="w-3.5 h-3.5" />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="text-xs bg-transparent focus:outline-none w-16"
                  />
                </div>
                <button
                  onClick={() => {
                    setDueDate(undefined);
                    setDueTime("");
                  }}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  aria-label="Clear due date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            </div>
          )}

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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {activePeopleCount}
                </span>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <textarea
                data-onboarding="compose-input"
                ref={textareaRef}
                value={sharedText}
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
                    const alternateType: TaskType =
                      taskType === "task"
                        ? (canOfferComment ? "comment" : "task")
                        : "task";
                    handleSubmit(alternateType);
                    return;
                  }
                  if (e.key === "Escape") {
                    handleCancel();
                  }
                }}
                placeholder={taskType === "task" ? "Search or create task... #tags" : "Search or add comment... #tags"}
                className="flex-1 w-full bg-muted/30 border border-border rounded-lg pl-9 pr-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[44px] max-h-32"
                rows={1}
              />
              {showMentionSuggestions && filteredPeople.length > 0 && (
                <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[110] w-full py-1">
                  {filteredPeople.map((person, index) => {
                    const mentionIdentifier = getPreferredMentionIdentifier(person);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(mentionIdentifier);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left",
                          activeMentionIndex === index ? "bg-muted" : "hover:bg-muted"
                        )}
                      >
                        {person.avatar ? (
                          <img src={person.avatar} alt={person.displayName} className="w-4 h-4 rounded-full" />
                        ) : (
                          <User className="w-4 h-4 text-primary" />
                        )}
                        <span className="text-sm">@{person.name || person.displayName}</span>
                        <span className="text-xs text-muted-foreground truncate">(@{mentionIdentifier})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCancel}
                className="p-3 rounded-lg hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
              {isSignedIn ? (
                <button
                  onClick={() => handleSubmit()}
                  disabled={!sharedText.trim() || !hasAtLeastOneTag}
                  className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  aria-label="Create from current text"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={onSignInClick}
                  className="p-3 rounded-lg border border-border text-foreground hover:bg-muted"
                  aria-label="Sign in to create"
                >
                  <Zap className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
