import { useState, useRef, useCallback } from "react";
import { Send, Hash, Image, AtSign, Radio, ChevronDown, MessageSquare, CheckSquare, Calendar, Gift, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Tag } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PostType = "message" | "task" | "event" | "offer" | "request";

const postTypes: { id: PostType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "message", label: "Message", icon: MessageSquare },
  { id: "task", label: "Task", icon: CheckSquare },
  { id: "event", label: "Event", icon: Calendar },
  { id: "offer", label: "Offer", icon: Gift },
  { id: "request", label: "Request", icon: HelpCircle },
];

interface PostComposerProps {
  onSubmit?: (content: string, tags: string[], relay: string, postType: string) => void;
  relays: Relay[];
  tags: Tag[];
}

export function PostComposer({ onSubmit, relays, tags }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedRelay, setSelectedRelay] = useState<string>(relays.find(r => r.isActive)?.id || relays[0]?.id || "");
  const [postType, setPostType] = useState<PostType>("message");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!content.trim()) return;
    
    // Extract tags from content
    const extractedTags = content.match(/#(\w+)/g)?.map((t) => t.slice(1)) || [];
    onSubmit?.(content, extractedTags, selectedRelay, postType);
    setContent("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      setShowHashtagSuggestions(false);
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
    
    if (hashtagMatch) {
      setHashtagFilter(hashtagMatch[1].toLowerCase());
      setShowHashtagSuggestions(true);
    } else {
      setShowHashtagSuggestions(false);
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

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(hashtagFilter)
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
    setCursorPosition(cursorPos + 1);
    setHashtagFilter("");
    setShowHashtagSuggestions(true);
    textareaRef.current?.focus();
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
              // Delay hiding suggestions so click can register
              setTimeout(() => setShowHashtagSuggestions(false), 200);
            }}
            onKeyDown={handleKeyDown}
            placeholder="What's happening? Use #tags to categorize..."
            className="w-full bg-transparent resize-none text-foreground placeholder:text-muted-foreground focus:outline-none text-lg leading-relaxed min-h-[60px]"
            rows={2}
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
                onClick={openHashtagPicker}
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
              <button className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors" title="Mention someone">
                <AtSign className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Selected Relay Badge */}
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {relays.find(r => r.id === selectedRelay)?.name || "Select relay"}
              </span>

              <span className="text-xs text-muted-foreground">
                {content.length > 0 && `${content.length}/280`}
              </span>

              {/* Post Button with Type Selector */}
              <div className="flex items-center">
                <button
                  onClick={handleSubmit}
                  disabled={!content.trim()}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-l-full font-medium text-sm transition-all",
                    content.trim()
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
