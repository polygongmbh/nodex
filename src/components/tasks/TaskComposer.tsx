import { useState, useRef, useEffect } from "react";
import { Hash, Calendar, Clock, X, MessageSquare, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Channel, Person, TaskType } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

interface TaskComposerProps {
  onSubmit: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string) => void;
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
}

export function TaskComposer({ onSubmit, relays, channels, people, onCancel, compact = false, defaultDueDate, defaultContent = "" }: TaskComposerProps) {
  const [content, setContent] = useState(defaultContent);
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [selectedRelays, setSelectedRelays] = useState<string[]>(() => {
    const activeRelays = relays.filter(r => r.isActive).map(r => r.id);
    return activeRelays.length > 0 ? activeRelays : [relays[0]?.id].filter(Boolean);
  });
  const [dueDate, setDueDate] = useState<Date | undefined>(defaultDueDate);
  const [dueTime, setDueTime] = useState("");
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!content.trim()) return;
    const extractedTags = content.match(/#(\w+)/g)?.map(t => t.slice(1)) || [];
    onSubmit(content, extractedTags, selectedRelays, taskType, dueDate, dueTime || undefined);
    setContent("");
    setDueDate(undefined);
    setDueTime("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);
    setCursorPosition(cursorPos);

    const textBeforeCursor = newContent.slice(0, cursorPos);
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);

    if (hashtagMatch) {
      setHashtagFilter(hashtagMatch[1].toLowerCase());
      setShowHashtagSuggestions(true);
    } else {
      setShowHashtagSuggestions(false);
    }
  };

  const insertHashtag = (tagName: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const hashtagStart = textBeforeCursor.lastIndexOf("#");
    const newContent = textBeforeCursor.slice(0, hashtagStart) + `#${tagName} ` + textAfterCursor;
    setContent(newContent);
    setShowHashtagSuggestions(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const filteredChannels = channels.filter(channel => channel.name.toLowerCase().includes(hashtagFilter));

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Type selector */}
      {!compact && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTaskType("task")}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors",
              taskType === "task" ? "bg-primary/20 text-primary" : "hover:bg-muted"
            )}
          >
            <CheckSquare className="w-4 h-4" />
            Task
          </button>
          <button
            onClick={() => setTaskType("comment")}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors",
              taskType === "comment" ? "bg-primary/20 text-primary" : "hover:bg-muted"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Comment
          </button>
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder={taskType === "task" ? "What needs to be done? Use #tags..." : "Add a comment..."}
          className={cn(
            "w-full bg-muted/30 border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50",
            compact ? "min-h-[60px]" : "min-h-[80px]"
          )}
          rows={compact ? 2 : 3}
        />

        {/* Channel suggestions */}
        {showHashtagSuggestions && filteredChannels.length > 0 && (
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-48 py-1">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertHashtag(channel.name);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
              >
                <Hash className="w-4 h-4 text-primary" />
                <span className="text-sm">{channel.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Due date for tasks */}
      {taskType === "task" && (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
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

      {/* Actions */}
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
            className="p-2 rounded-full hover:bg-muted"
          >
            <Hash className="w-4 h-4 text-primary" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {taskType === "task" ? "Create Task" : "Add Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
