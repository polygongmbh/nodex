import { useState, useRef, useEffect } from "react";
import { Search, Plus, Send, X, Hash, Radio, Users, Check, Minus, Calendar, Clock, CheckSquare, MessageSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";

type BarMode = "search" | "compose";

interface UnifiedBottomBarProps {
  // Search props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Compose props
  onSubmit: (content: string, channels: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string) => void;
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
}

type SelectorType = "relay" | "channel" | "person" | null;

export function UnifiedBottomBar({
  searchQuery,
  onSearchChange,
  onSubmit,
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
  const [mode, setMode] = useState<BarMode>("search");
  const [content, setContent] = useState(defaultContent);
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [activeSelector, setActiveSelector] = useState<SelectorType>(null);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const autoManagedChannelsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (mode === "compose" && textareaRef.current) {
      textareaRef.current.focus();
    } else if (mode === "search" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  useEffect(() => {
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasTag = (text: string, channelName: string) =>
      new RegExp(`(^|\\s)#${escapeRegex(channelName)}(?=\\s|$)`, "i").test(text);
    const appendTag = (text: string, channelName: string) =>
      text + (text && !text.endsWith(" ") ? " " : "") + `#${channelName} `;
    const removeTag = (text: string, channelName: string) => {
      const pattern = new RegExp(`(^|\\s)#${escapeRegex(channelName)}(?=\\s|$)`, "gi");
      return text.replace(pattern, "$1").replace(/[ \t]{2,}/g, " ").replace(/^\s+/, "");
    };

    const previous = new Set(prevIncludedChannelsRef.current);
    const next = new Set(includedChannels);
    const added = includedChannels.filter((name) => !previous.has(name));
    const removed = prevIncludedChannelsRef.current.filter((name) => !next.has(name));

    if (added.length === 0 && removed.length === 0) {
      return;
    }

    setContent((previousContent) => {
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

  const handleSubmit = () => {
    if (!content.trim()) return;
    const extractedChannels = content.match(/#(\w+)/g)?.map(t => t.slice(1)) || [];
    if (extractedChannels.length === 0) {
      toast.error("Add at least one #channel before posting");
      return;
    }
    const activeRelayIds = relays.filter(r => r.isActive).map(r => r.id);
    const relayIds = activeRelayIds.length > 0 ? activeRelayIds : [relays[0]?.id].filter(Boolean);
    onSubmit(content, extractedChannels, relayIds, taskType, dueDate, dueTime || undefined);
    const selectedChannelsContent = includedChannels.length > 0
      ? `${includedChannels.map((channelName) => `#${channelName}`).join(" ")} `
      : "";
    setContent(selectedChannelsContent);
    prevIncludedChannelsRef.current = [...includedChannels];
    autoManagedChannelsRef.current = new Set(includedChannels);
    setDueDate(undefined);
    setDueTime("");
    setMode("search");
    setActiveSelector(null);
  };

  const handleCancel = () => {
    setContent("");
    setMode("search");
    setActiveSelector(null);
  };

  const toggleSelector = (type: SelectorType) => {
    setActiveSelector(activeSelector === type ? null : type);
  };

  // Count active filters
  const activeRelaysCount = relays.filter(r => r.isActive).length;
  const activeChannelsCount = channels.filter(c => c.filterState !== "neutral").length;
  const activePeopleCount = people.filter(p => p.isSelected).length;
  const hasAtLeastOneTag = (content.match(/#(\w+)/g)?.length || 0) > 0;

  return (
    <div className="border-t border-border bg-background safe-area-bottom">
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

      {/* Mode Toggle & Selectors Row */}
      <div className="flex items-center gap-2 px-3 pt-2">
        {/* Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          <button
            onClick={() => setMode("search")}
            className={cn(
              "p-2 rounded-md transition-colors",
              mode === "search" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode("compose")}
            className={cn(
              "p-2 rounded-md transition-colors",
              mode === "compose" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Task Type (only in compose mode) */}
        {mode === "compose" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTaskType("task")}
              className={cn(
                "p-2 rounded-md transition-colors",
                taskType === "task" ? "bg-primary/20 text-primary" : "text-muted-foreground"
              )}
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTaskType("comment")}
              className={cn(
                "p-2 rounded-md transition-colors",
                taskType === "comment" ? "bg-primary/20 text-primary" : "text-muted-foreground"
              )}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        )}

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
        {mode === "search" ? (
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-4 py-3 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
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
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                  if (e.key === "Escape") {
                    handleCancel();
                  }
                }}
                placeholder={taskType === "task" ? "New task... #tags" : "Add comment..."}
                className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[44px] max-h-32"
                rows={1}
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCancel}
                  className="p-3 rounded-lg hover:bg-muted"
                >
                  <X className="w-5 h-5" />
                </button>
                {isSignedIn ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!content.trim() || !hasAtLeastOneTag}
                    className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={onSignInClick}
                    className="p-3 rounded-lg border border-border text-foreground hover:bg-muted"
                  >
                    <Zap className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
