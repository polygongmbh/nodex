import { Heart, MessageCircle, Repeat2, Share, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Post } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface PostCardProps {
  post: Post;
  onLike?: () => void;
  onReply?: () => void;
  onRepost?: () => void;
}

export function PostCard({ post, onLike, onReply, onRepost }: PostCardProps) {
  const timeAgo = formatDistanceToNow(post.timestamp, { addSuffix: true });

  return (
    <article className="p-4 border-b border-border hover:bg-card/50 transition-colors animate-fade-in">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-foreground font-medium">
            {post.author.displayName.charAt(0)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-foreground hover:underline cursor-pointer">
              {post.author.displayName}
            </span>
            <span className="text-muted-foreground text-sm">@{post.author.name}</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-muted-foreground text-sm hover:underline cursor-pointer">
              {timeAgo}
            </span>
            <button className="ml-auto p-1 rounded-full hover:bg-muted transition-colors">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Post Content */}
          <p className="text-foreground leading-relaxed mb-2">{post.content}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
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

          {/* Actions */}
          <div className="flex items-center gap-6 -ml-2">
            <button
              onClick={onReply}
              className="flex items-center gap-1.5 p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors group"
            >
              <MessageCircle className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              <span className="text-xs text-muted-foreground group-hover:text-primary">
                {post.replies}
              </span>
            </button>

            <button
              onClick={onRepost}
              className={cn(
                "flex items-center gap-1.5 p-2 rounded-full transition-colors group",
                post.isReposted
                  ? "text-success"
                  : "hover:bg-success/10 hover:text-success"
              )}
            >
              <Repeat2
                className={cn(
                  "w-4 h-4",
                  post.isReposted
                    ? "text-success"
                    : "text-muted-foreground group-hover:text-success"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  post.isReposted
                    ? "text-success"
                    : "text-muted-foreground group-hover:text-success"
                )}
              >
                {post.reposts}
              </span>
            </button>

            <button
              onClick={onLike}
              className={cn(
                "flex items-center gap-1.5 p-2 rounded-full transition-colors group",
                post.isLiked ? "text-destructive" : "hover:bg-destructive/10 hover:text-destructive"
              )}
            >
              <Heart
                className={cn(
                  "w-4 h-4",
                  post.isLiked
                    ? "text-destructive fill-destructive"
                    : "text-muted-foreground group-hover:text-destructive"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  post.isLiked
                    ? "text-destructive"
                    : "text-muted-foreground group-hover:text-destructive"
                )}
              >
                {post.likes}
              </span>
            </button>

            <button className="p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors group">
              <Share className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
