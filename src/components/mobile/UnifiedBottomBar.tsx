import { useState, useRef, useEffect } from "react";
import { Search, Send, X, Hash, Radio, Users, Check, Minus, Calendar, Clock, CheckSquare, MessageSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType } from "@/types";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";

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
  const includedChannels = channels.filter((c) => c.filterState === "included").map((c) => c.name);
  const [sharedText, setSharedText] = useState(() => searchQuery || defaultContent);
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [activeSelector, setActiveSelector] = useState<SelectorType>(null);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSearchQueryRef = useRef(searchQuery);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const autoManagedChannelsRef = useRef<Set<string>>(new Set());
  const canOfferComment = currentView === "feed" || (currentView === "tree" && Boolean(focusedTaskId));

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

  return (
    <div className="border-t border-border bg-background safe-area-bottom" data-onboarding="mobile-combined-box">
      {/* Selector Panel */}
      {activeSelector && (
        <div className="border-b border-border p-3 max-h-48 overflow-y-auto">
          {activeSelector === "relay" && (
            <div className="flex flex-wrap gap-2">
              {relays.map((relay) => (
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
                  <span className="text-base">{relay.icon}</span>
                  {relay.name}
                  {relay.isActive && <Check className="w-3 h-3" />}
                </button>
              ))}
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
              {people.map((person) => (
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
                  {person.name}
                  {person.isSelected && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls Row */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          <button
            onClick={() => setTaskType("task")}
            aria-label="Task"
            className={cn(
              "p-2 rounded-md transition-colors",
              taskType === "task" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <CheckSquare className="w-4 h-4" />
          </button>
          {canOfferComment && (
            <button
              onClick={() => setTaskType("comment")}
              aria-label="Comment"
              className={cn(
                "p-2 rounded-md transition-colors",
                taskType === "comment" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter/Selector Buttons */}
        <div className="flex items-center gap-1 ml-auto">
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

      {/* Input Area */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1 space-y-2">
          {/* Due date for tasks */}
          {taskType === "task" && (
            <div className="flex items-center gap-2 text-sm">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <Calendar className="w-4 h-4" />
                    {dueDate ? format(dueDate, "MMM d") : "Due date"}
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
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="text-sm bg-transparent focus:outline-none w-20"
                    />
                  </div>
                  <button onClick={() => { setDueDate(undefined); setDueTime(""); }} className="p-1 hover:bg-muted rounded">
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <textarea
                data-onboarding="compose-input"
                ref={textareaRef}
                value={sharedText}
                onChange={(e) => {
                  const value = e.target.value;
                  setSharedText(value);
                  onSearchChange(value);
                }}
                onKeyDown={(e) => {
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
