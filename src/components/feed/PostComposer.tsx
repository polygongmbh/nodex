import { useState } from "react";
import { Send, Hash, Image, Smile, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostComposerProps {
  onSubmit?: (content: string, tags: string[]) => void;
}

export function PostComposer({ onSubmit }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = () => {
    if (!content.trim()) return;
    
    // Extract tags from content
    const tags = content.match(/#(\w+)/g)?.map((t) => t.slice(1)) || [];
    onSubmit?.(content, tags);
    setContent("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

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
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="What's happening? Use #tags to categorize..."
            className="w-full bg-transparent resize-none text-foreground placeholder:text-muted-foreground focus:outline-none text-lg leading-relaxed min-h-[60px]"
            rows={2}
          />

          {/* Actions */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors">
                <Hash className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors">
                <Image className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors">
                <Smile className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors">
                <AtSign className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {content.length > 0 && `${content.length}/280`}
              </span>
              <button
                onClick={handleSubmit}
                disabled={!content.trim()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all",
                  content.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
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
