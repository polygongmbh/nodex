import { useState, useRef, useCallback } from "react";
import { Send, Hash, Image, AtSign, Radio, ChevronDown, MessageSquare, CheckSquare, Calendar, Gift, HelpCircle, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Tag, Person } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PostType = "message" | "task" | "event" | "offer" | "request" | "blog";

const postTypes: { id: PostType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "message", label: "Message", icon: MessageSquare },
  { id: "task", label: "Task", icon: CheckSquare },
  { id: "event", label: "Event", icon: Calendar },
  { id: "offer", label: "Offer", icon: Gift },
  { id: "request", label: "Request", icon: HelpCircle },
  { id: "blog", label: "Blog Post", icon: FileText },
];

interface PostComposerProps {
  onSubmit?: (content: string, tags: string[], relay: string, postType: string) => void;
  relays: Relay[];
  tags: Tag[];
  people: Person[];
}

export function PostComposer({ onSubmit, relays, tags, people }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedRelay, setSelectedRelay] = useState<string>(relays.find(r => r.isActive)?.id || relays[0]?.id || "");
  const [postType, setPostType] = useState<PostType>("message");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!content.trim()) return;
    
    // Extract tags from content
    const extractedTags = content.match(/#(\w+)/g)?.map((t) => t.slice(1)) || [];
    
    // Require at least one hashtag
    if (extractedTags.length === 0) {
      return;
    }
    
    onSubmit?.(content, extractedTags, selectedRelay, postType);
    setContent("");
    setAttachments([]);
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
    
    // Focus back to textarea
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
    
    // Focus back to textarea
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
    
    // Set cursor position and show suggestions after state update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setShowHashtagSuggestions(true);
      }
    }, 10);
  };

  const openMentionPicker = () => {
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const newContent = content.slice(0, cursorPos) + "@" + content.slice(cursorPos);
    setContent(newContent);
    const newCursorPos = cursorPos + 1;
    setCursorPosition(newCursorPos);
    setMentionFilter("");
    setShowHashtagSuggestions(false);
    
    // Set cursor position and show suggestions after state update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setShowMentionSuggestions(true);
      }
    }, 10);
  };

  const currentPostType = postTypes.find(p => p.id === postType) || postTypes[0];
  const PostTypeIcon = currentPostType.icon;

  return (
    <div
      className={cn(
        "border-b border-border p-4 transition-all",
        isFocused && "bg-card/30"
      )}
    >
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
            onFocus={() => setIsFocused(true)}
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

              {/* Relay Selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors flex items-center gap-1"
                    title="Select relay"
                  >
                    <Radio className="w-5 h-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <div className="text-xs text-muted-foreground px-2 py-1.5">Post to relay</div>
                  {relays.map((relay) => (
                    <button
                      key={relay.id}
                      onClick={() => setSelectedRelay(relay.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-left",
                        selectedRelay === relay.id && "bg-primary/10 text-primary"
                      )}
                    >
                      <Radio className="w-4 h-4" />
                      <span className="text-sm">{relay.name}</span>
                      {selectedRelay === relay.id && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Mention Button */}
              <button 
                onMouseDown={(e) => {
                  e.preventDefault();
                  openMentionPicker();
                }}
                className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors" 
                title="Mention someone"
              >
                <AtSign className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Selected Relay Badge */}
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {relays.find(r => r.id === selectedRelay)?.name || "Select relay"}
              </span>

              {/* Post Button with Type Selector */}
              <div className="flex items-center">
                <button
                  onClick={handleSubmit}
                  disabled={!content.trim() || !hasHashtag}
                  title={!hasHashtag ? "Add at least one #hashtag" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-l-full font-medium text-sm transition-all",
                    content.trim() && hasHashtag
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <PostTypeIcon className="w-4 h-4" />
                  {currentPostType.label}
                </button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "px-2 py-2 rounded-r-full font-medium text-sm transition-all border-l border-primary-foreground/20",
                        content.trim()
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="end">
                    <div className="text-xs text-muted-foreground px-2 py-1.5">Post type</div>
                    {postTypes.map((type) => {
                      const TypeIcon = type.icon;
                      return (
                        <button
                          key={type.id}
                          onClick={() => setPostType(type.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-left",
                            postType === type.id && "bg-primary/10 text-primary"
                          )}
                        >
                          <TypeIcon className="w-4 h-4" />
                          <span className="text-sm">{type.label}</span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
