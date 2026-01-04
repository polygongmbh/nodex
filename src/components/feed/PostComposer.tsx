import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Hash, Image, Radio, ChevronDown, MessageSquare, CheckSquare, Calendar, Gift, HelpCircle, X, FileText, Check, Clock, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Tag, Person, PostType, Post } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

const postTypes: { id: PostType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "message", label: "Message", icon: MessageSquare },
  { id: "task", label: "Task", icon: CheckSquare },
  { id: "event", label: "Event", icon: Calendar },
  { id: "offer", label: "Offer", icon: Gift },
  { id: "request", label: "Request", icon: HelpCircle },
  { id: "blog", label: "Blog Post", icon: FileText },
];

interface PostComposerProps {
  onSubmit?: (content: string, tags: string[], relays: string[], postType: string, dueDate?: Date, dueTime?: string, replyTo?: string) => void;
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  activePostTypes: PostType[];
  referencedPost?: Post;
  onClearReference?: () => void;
  isComposing: boolean;
  onComposingChange: (composing: boolean) => void;
}

export function PostComposer({ 
  onSubmit, 
  relays, 
  tags, 
  people, 
  activePostTypes,
  referencedPost,
  onClearReference,
  isComposing,
  onComposingChange
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [postType, setPostType] = useState<PostType>("message");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track previous selections to detect changes (excluding bulk operations)
  const prevIncludedTagsRef = useRef<string[]>([]);
  const prevSelectedPeopleRef = useRef<string[]>([]);
  const prevTagCountRef = useRef<number>(0);
  const prevPeopleCountRef = useRef<number>(0);

  // Sync defaults from sidebar selections
  useEffect(() => {
    const activeRelayIds = relays.filter(r => r.isActive).map(r => r.id);
    setSelectedRelays(activeRelayIds.length > 0 ? activeRelayIds : [relays[0]?.id].filter(Boolean));
  }, [relays]);

  useEffect(() => {
    if (activePostTypes.length === 1) {
      setPostType(activePostTypes[0]);
    }
  }, [activePostTypes]);

  // Sync tags with content - add/remove hashtags when sidebar tags change (individual toggles only)
  useEffect(() => {
    const currentIncludedTags = tags.filter(t => t.filterState === "included").map(t => t.name);
    const prevIncludedTags = prevIncludedTagsRef.current;
    const totalTags = tags.length;
    const prevTotalTags = prevTagCountRef.current;

    // Detect bulk toggle: if the change affects all or most tags at once, skip
    const addedTags = currentIncludedTags.filter(t => !prevIncludedTags.includes(t));
    const removedTags = prevIncludedTags.filter(t => !currentIncludedTags.includes(t));
    
    const isBulkOperation = (addedTags.length > 1 && addedTags.length === totalTags) || 
                           (removedTags.length > 1 && removedTags.length === prevIncludedTags.length);

    if (!isBulkOperation) {
      let newContent = content;

      // Remove tags that were deselected
      removedTags.forEach(tag => {
        const regex = new RegExp(`#${tag}\\s?`, 'g');
        newContent = newContent.replace(regex, '');
      });

      // Add tags that were newly selected
      addedTags.forEach(tag => {
        if (!newContent.match(new RegExp(`#${tag}(?:\\s|$)`))) {
          newContent = newContent.trimEnd() + (newContent.trim() ? ' ' : '') + `#${tag} `;
        }
      });

      if (newContent !== content) {
        setContent(newContent);
      }
    }

    prevIncludedTagsRef.current = currentIncludedTags;
    prevTagCountRef.current = totalTags;
  }, [tags]);

  // Sync people with content - add/remove mentions when sidebar people change (individual toggles only)
  useEffect(() => {
    const currentSelectedPeople = people.filter(p => p.isSelected && p.id !== "me").map(p => p.name);
    const prevSelectedPeople = prevSelectedPeopleRef.current;
    const totalPeople = people.filter(p => p.id !== "me").length;

    // Find newly added people
    const addedPeople = currentSelectedPeople.filter(p => !prevSelectedPeople.includes(p));
    // Find removed people
    const removedPeople = prevSelectedPeople.filter(p => !currentSelectedPeople.includes(p));

    // Detect bulk toggle
    const isBulkOperation = (addedPeople.length > 1 && addedPeople.length === totalPeople) || 
                           (removedPeople.length > 1 && removedPeople.length === prevSelectedPeople.length);

    if (!isBulkOperation) {
      let newContent = content;

      // Remove mentions that were deselected
      removedPeople.forEach(person => {
        const regex = new RegExp(`@${person}\\s?`, 'g');
        newContent = newContent.replace(regex, '');
      });

      // Add mentions that were newly selected
      addedPeople.forEach(person => {
        if (!newContent.match(new RegExp(`@${person}(?:\\s|$)`))) {
          newContent = newContent.trimEnd() + (newContent.trim() ? ' ' : '') + `@${person} `;
        }
      });

      if (newContent !== content) {
        setContent(newContent);
      }
    }

    prevSelectedPeopleRef.current = currentSelectedPeople;
    prevPeopleCountRef.current = totalPeople;
  }, [people]);

  const handleFocus = () => {
    setIsFocused(true);
    onComposingChange(true);
  };

  const handleSubmit = () => {
    if (!content.trim() || selectedRelays.length === 0) return;
    
    // Extract tags from content
    const extractedTags = content.match(/#(\w+)/g)?.map((t) => t.slice(1)) || [];
    
    // Require at least one hashtag
    if (extractedTags.length === 0) {
      return;
    }
    
    onSubmit?.(content, extractedTags, selectedRelays, postType, dueDate, dueTime || undefined, referencedPost?.id);
    setContent("");
    setAttachments([]);
    setDueDate(undefined);
    setDueTime("");
    onClearReference?.();
    onComposingChange(false);
  };

  // Check if post has at least one hashtag
  const hasHashtag = (content.match(/#(\w+)/g) || []).length > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      setShowHashtagSuggestions(false);
      setShowMentionSuggestions(false);
      onComposingChange(false);
      onClearReference?.();
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);
    setCursorPosition(cursorPos);

    // Check if we're typing a hashtag
    const textBeforeCursor = newContent.slice(0, cursorPos);
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (hashtagMatch) {
      setHashtagFilter(hashtagMatch[1].toLowerCase());
      setShowHashtagSuggestions(true);
      setShowMentionSuggestions(false);
    } else if (mentionMatch) {
      setMentionFilter(mentionMatch[1].toLowerCase());
      setShowMentionSuggestions(true);
      setShowHashtagSuggestions(false);
    } else {
      setShowHashtagSuggestions(false);
      setShowMentionSuggestions(false);
    }
  };

  const insertHashtag = useCallback((tagName: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const hashtagStart = textBeforeCursor.lastIndexOf("#");
    
    const newContent = textBeforeCursor.slice(0, hashtagStart) + `#${tagName} ` + textAfterCursor;
    setContent(newContent);
    setShowHashtagSuggestions(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, cursorPosition]);

  const insertMention = useCallback((personName: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const mentionStart = textBeforeCursor.lastIndexOf("@");
    
    const newContent = textBeforeCursor.slice(0, mentionStart) + `@${personName} ` + textAfterCursor;
    setContent(newContent);
    setShowMentionSuggestions(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [content, cursorPosition]);

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(hashtagFilter)
  );

  const filteredPeople = people.filter(person => 
    person.name.toLowerCase().includes(mentionFilter) ||
    person.displayName.toLowerCase().includes(mentionFilter)
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const openHashtagPicker = () => {
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const newContent = content.slice(0, cursorPos) + "#" + content.slice(cursorPos);
    setContent(newContent);
    const newCursorPos = cursorPos + 1;
    setCursorPosition(newCursorPos);
    setHashtagFilter("");
    setShowMentionSuggestions(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setShowHashtagSuggestions(true);
      }
    }, 10);
  };

  const toggleRelay = (relayId: string) => {
    setSelectedRelays(prev => 
      prev.includes(relayId) 
        ? prev.filter(id => id !== relayId)
        : [...prev, relayId]
    );
  };

  const currentPostType = postTypes.find(p => p.id === postType) || postTypes[0];
  const PostTypeIcon = currentPostType.icon;

  const selectedRelayNames = relays
    .filter(r => selectedRelays.includes(r.id))
    .map(r => r.name);

  const showDatePicker = postType === "task" || postType === "event";

  return (
    <div
      className={cn(
        "border-b border-border p-4 transition-all",
        isFocused && "bg-card/30"
      )}
    >
      {/* Referenced Post Preview */}
      {referencedPost && (
        <div className="mb-3 pl-4 border-l-2 border-primary bg-primary/5 rounded-r-lg py-2 pr-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Reply className="w-3 h-3" />
              <span>Replying to @{referencedPost.author.name}</span>
            </div>
            <button 
              onClick={onClearReference}
              className="p-1 rounded-full hover:bg-muted"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{referencedPost.content}</p>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-semibold">
            Y
          </div>
        </div>

        {/* Composer */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onFocus={handleFocus}
            onBlur={() => {
              setIsFocused(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={postType === "blog" ? "Write your blog post... Supports **bold**, *italic*, and [links](url)" : "What's happening? Use #tags to categorize..."}
            className={cn(
              "w-full bg-transparent resize-none text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed",
              postType === "blog" ? "text-base min-h-[120px]" : "text-lg min-h-[60px]"
            )}
            rows={postType === "blog" ? 6 : 2}
          />

          {/* Hashtag Suggestions */}
          {showHashtagSuggestions && filteredTags.length > 0 && (
            <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-48 py-1">
              {filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertHashtag(tag.name);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
                >
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="text-sm">{tag.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Mention Suggestions */}
          {showMentionSuggestions && filteredPeople.length > 0 && (
            <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-56 py-1">
              {filteredPeople.map((person) => (
                <button
                  key={person.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(person.name);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/60 to-accent/60 flex items-center justify-center text-xs text-primary-foreground font-medium">
                    {person.displayName.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{person.displayName}</span>
                    <span className="text-xs text-muted-foreground">@{person.name}</span>
                  </div>
                  {person.isOnline && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Blog post hint */}
          {postType === "blog" && (
            <div className="text-xs text-muted-foreground mt-1">
              Markdown supported: **bold**, *italic*, `code`, [link](url), # heading
            </div>
          )}

          {/* Date/Time Picker for Tasks and Events */}
          {showDatePicker && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-muted/30 rounded-lg">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-sm text-muted-foreground hover:text-foreground">
                    {dueDate ? format(dueDate, "MMM d, yyyy") : "Set date"}
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
                    placeholder="Set time"
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

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachments.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="px-3 py-1.5 bg-muted rounded-lg text-sm flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    <span className="truncate max-w-[100px]">{file.name}</span>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1">
              {/* Hashtag Button */}
              <button 
                onMouseDown={(e) => {
                  e.preventDefault();
                  openHashtagPicker();
                }}
                className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
                title="Add hashtag"
              >
                <Hash className="w-5 h-5" />
              </button>

              {/* Attachment Button */}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
                title="Add attachment"
              >
                <Image className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Relay Selector (Multi-select) */}
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors flex items-center gap-1"
                    title="Select relays"
                  >
                    <Radio className="w-5 h-5" />
                    {selectedRelays.length > 1 && (
                      <span className="text-xs bg-primary/20 px-1.5 rounded-full">{selectedRelays.length}</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="start">
                  <div className="text-xs text-muted-foreground px-2 py-1.5">Post to relays (multi-select)</div>
                  {relays.map((relay) => (
                    <button
                      key={relay.id}
                      onClick={() => toggleRelay(relay.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-left",
                        selectedRelays.includes(relay.id) && "bg-primary/10"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center",
                        selectedRelays.includes(relay.id) 
                          ? "bg-primary border-primary" 
                          : "border-muted-foreground"
                      )}>
                        {selectedRelays.includes(relay.id) && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>
                      <Radio className="w-4 h-4" />
                      <span className="text-sm">{relay.name}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Post Type Selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm">
                    <PostTypeIcon className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">{currentPostType.label}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="start">
                  {postTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setPostType(type.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-left",
                          postType === type.id && "bg-primary/10"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{type.label}</span>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              {/* Relay indicator */}
              <span className="text-xs text-muted-foreground">
                → {selectedRelayNames.length > 0 ? selectedRelayNames.join(", ") : "No relay selected"}
              </span>

              <button
                onClick={handleSubmit}
                disabled={!content.trim() || !hasHashtag || selectedRelays.length === 0}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all",
                  content.trim() && hasHashtag && selectedRelays.length > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Send className="w-4 h-4" />
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
