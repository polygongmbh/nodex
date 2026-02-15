import { useState, useRef, useEffect } from "react";
import { Hash, Calendar, Clock, X, MessageSquare, CheckSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";

interface TaskComposerProps {
  onSubmit: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string) => void;
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
}

interface ComposeDraftState {
  content?: string;
  taskType?: TaskType;
  dueDate?: string;
  dueTime?: string;
  selectedRelays?: string[];
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
}: TaskComposerProps) {
  const { user } = useNDK();
  const includedChannels = channels.filter((c) => c.filterState === "included").map((c) => c.name);
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
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(
    () => !adaptiveSize || initialContent.trim().length > 0
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const autoManagedChannelsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!adaptiveSize) {
      textareaRef.current?.focus();
    }
  }, [adaptiveSize]);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

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
          selectedRelays,
        } satisfies ComposeDraftState)
      );
    } catch {
      // Ignore persistence errors.
    }
  }, [content, taskType, dueDate, dueTime, selectedRelays, draftStorageKey]);

  // Keep selected publish targets aligned with currently active relay filters.
  useEffect(() => {
    const activeRelays = relays.filter((r) => r.isActive).map((r) => r.id);
    setSelectedRelays(activeRelays.length > 0 ? activeRelays : [relays[0]?.id].filter(Boolean));
  }, [relays]);

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

  const handleSubmit = async () => {
    if (!content.trim()) return;
    
    const extractedTags = content.match(/#(\w+)/g)?.map(t => t.slice(1)) || [];
    if (extractedTags.length === 0) {
      toast.error("Add at least one #channel before posting");
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
    try {
      await Promise.resolve(onSubmit(content, extractedTags, selectedRelays, taskType, dueDate, dueTime || undefined));
    } finally {
      setIsPublishing(false);
    }
    const selectedChannelsContent = includedChannels.length > 0
      ? `${includedChannels.map((channelName) => `#${channelName}`).join(" ")} `
      : "";
    setContent(selectedChannelsContent);
    prevIncludedChannelsRef.current = [...includedChannels];
    autoManagedChannelsRef.current = new Set(includedChannels);
    setDueDate(undefined);
    setDueTime("");
    if (adaptiveSize && selectedChannelsContent.trim().length === 0) {
      setIsExpanded(false);
    }
    if (draftStorageKey) {
      localStorage.removeItem(draftStorageKey);
    }
  };

  const filteredChannels = channels.filter(channel => channel.name.toLowerCase().includes(hashtagFilter));
  const hasAtLeastOneTag = (content.match(/#(\w+)/g)?.length || 0) > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showHashtagSuggestions && filteredChannels.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % filteredChannels.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + filteredChannels.length) % filteredChannels.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredChannels[Math.max(activeSuggestionIndex, 0)] || filteredChannels[0];
        if (selected) {
          insertHashtag(selected.name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowHashtagSuggestions(false);
        setActiveSuggestionIndex(0);
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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

    if (hashtagMatch) {
      setHashtagFilter(hashtagMatch[1].toLowerCase());
      setShowHashtagSuggestions(true);
      setActiveSuggestionIndex(0);
    } else {
      setShowHashtagSuggestions(false);
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
    setActiveSuggestionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const showExpandedControls = !adaptiveSize || isExpanded || content.trim().length > 0;

  return (
    <div className={cn("space-y-3", compact && "space-y-2", adaptiveSize && !showExpandedControls && "space-y-1")}>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (adaptiveSize && !isExpanded) {
              setIsExpanded(true);
            }
          }}
          placeholder={taskType === "task" ? "What needs to be done? Use #tags..." : "Add a comment..."}
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
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-48 py-1">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
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
                <span className="text-sm">{channel.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Due date for tasks */}
      {showExpandedControls && taskType === "task" && (
        <div className="flex items-center gap-2 p-2 bg-muted/40 border border-border/40 rounded-xl">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-sm text-muted-foreground hover:text-foreground">
                {dueDate ? format(dueDate, "MMM d, yyyy") : "Set due date (optional)"}
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
              <Clock className="w-4 h-4 text-muted-foreground ml-2" />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="text-sm bg-transparent text-foreground focus:outline-none"
              />
              <button
                onClick={() => {
                  setDueDate(undefined);
                  setDueTime("");
                }}
                className="ml-auto p-1 hover:bg-muted rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Sign in prompt for posting */}
      {showExpandedControls && !user && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-xl">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground flex-1">
            Sign in to post or update tasks
          </span>
          {onSignInClick && (
            <button
              onClick={onSignInClick}
              className="text-sm text-primary hover:underline"
            >
              Sign in
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
          >
            <Hash className="w-4 h-4 text-primary" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="task-composer-kind">Kind</label>
          <select
            id="task-composer-kind"
            aria-label="Kind"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskType)}
            className="px-3 py-2 text-sm rounded-xl border border-border/50 bg-muted/40 hover:bg-muted/60 transition-colors"
          >
            <option value="task">Task</option>
            <option value="comment">Comment</option>
          </select>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || !hasAtLeastOneTag || isPublishing || !user}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            {isPublishing && (
              <span className="w-3 h-3 border border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            )}
            {!user ? "Sign in to post" : (taskType === "task" ? "Create Task" : "Add Comment")}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
