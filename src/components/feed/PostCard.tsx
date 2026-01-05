import { MoreHorizontal, Calendar, Clock, Reply, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Post, Person } from "@/types";
import { formatDistanceToNow, format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { linkifyContent } from "@/lib/linkify";

interface PostCardProps {
  post: Post;
  currentUser?: Person;
  isComposing?: boolean;
  onReference?: (postId: string) => void;
  onToggleComplete?: (postId: string) => void;
  onViewThread?: (postId: string) => void;
  referencedPost?: Post;
  onScrollToPost?: (postId: string) => void;
}

export function PostCard({ 
  post, 
  currentUser, 
  isComposing, 
  onReference, 
  onToggleComplete,
  onViewThread,
  referencedPost,
  onScrollToPost
}: PostCardProps) {
  const timeAgo = formatDistanceToNow(post.timestamp, { addSuffix: true });

  // Check if current user can mark task complete
  const canCompleteTask = () => {
    if (post.postType !== "task") return false;
    if (!currentUser) return false;
    
    // Extract mentioned people from content
    const mentionedPeople = post.content.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
    
    // If no one is tagged, anyone can complete
    if (mentionedPeople.length === 0) return true;
    
    // Only tagged users can complete
    return mentionedPeople.includes(currentUser.name);
  };

  const handleClick = () => {
    if (isComposing && onReference) {
      onReference(post.id);
    } else if (onViewThread) {
      onViewThread(post.id);
    }
  };

  return (
    <article 
      className={cn(
        "p-4 border-b border-border transition-colors animate-fade-in",
        isComposing ? "cursor-pointer hover:bg-primary/5 hover:ring-2 ring-primary/20" : "hover:bg-card/50",
        post.isCompleted && "opacity-60"
      )}
      onClick={handleClick}
    >
      {/* Referenced Post Preview */}
      {referencedPost && (
        <div 
          className="mb-3 pl-4 border-l-2 border-muted cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors rounded-r"
          onClick={(e) => {
            e.stopPropagation();
            onScrollToPost?.(referencedPost.id);
          }}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Reply className="w-3 h-3" />
            <span>Replying to @{referencedPost.author.name}</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{referencedPost.content}</p>
        </div>
      )}

      <div className="flex gap-3">
        {/* Task Checkbox */}
        {post.postType === "task" && (
          <div className="flex-shrink-0 pt-1">
            <Checkbox
              checked={post.isCompleted}
              disabled={!canCompleteTask()}
              onCheckedChange={() => onToggleComplete?.(post.id)}
              onClick={(e) => e.stopPropagation()}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        )}

        {/* Avatar */}
        <div className="flex-shrink-0">
          <Avatar className="w-10 h-10">
            {post.author.avatar ? (
              <AvatarImage src={post.author.avatar} alt={post.author.displayName} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-foreground font-medium">
              {post.author.displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "font-medium text-foreground hover:underline cursor-pointer",
              post.isCompleted && "line-through"
            )}>
              {post.author.displayName}
            </span>
            <span className="text-muted-foreground text-sm">@{post.author.name}</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-muted-foreground text-sm hover:underline cursor-pointer">
              {timeAgo}
            </span>
            <button 
              className="ml-auto p-1 rounded-full hover:bg-muted transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Due Date for Tasks/Events */}
          {(post.postType === "task" || post.postType === "event") && post.dueDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Calendar className="w-3 h-3" />
              <span>{format(post.dueDate, "MMM d, yyyy")}</span>
              {post.dueTime && (
                <>
                  <Clock className="w-3 h-3 ml-2" />
                  <span>{post.dueTime}</span>
                </>
              )}
            </div>
          )}

          {/* Post Content */}
          <p className={cn(
            "text-foreground leading-relaxed mb-2",
            post.isCompleted && "line-through text-muted-foreground"
          )}>
            {linkifyContent(post.content)}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-1">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors"
              >
                #{tag}
              </span>
            ))}
            <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              via {post.relays.join(", ")}
            </span>
          </div>

          {/* Completed indicator */}
          {post.isCompleted && post.completedBy && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
              <CheckSquare className="w-3 h-3" />
              <span>Completed by @{post.completedBy}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
