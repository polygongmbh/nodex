import { X, ArrowLeft } from "lucide-react";
import { Post, Person } from "@/types";
import { PostCard } from "./PostCard";

interface ThreadViewProps {
  post: Post;
  replies: Post[];
  currentUser?: Person;
  allPosts: Post[];
  onClose: () => void;
  onToggleComplete?: (postId: string) => void;
}

export function ThreadView({ post, replies, currentUser, allPosts, onClose, onToggleComplete }: ThreadViewProps) {
  // Find the referenced post if this is a reply
  const referencedPost = post.replyTo ? allPosts.find(p => p.id === post.replyTo) : undefined;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-lg">Thread</h2>
          <button 
            onClick={onClose}
            className="ml-auto p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thread Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Original Post */}
          <PostCard 
            post={post} 
            currentUser={currentUser}
            referencedPost={referencedPost}
            onToggleComplete={onToggleComplete}
          />

          {/* Replies */}
          {replies.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-sm text-muted-foreground bg-muted/30">
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </div>
              {replies.map((reply) => {
                const replyReferencedPost = reply.replyTo ? allPosts.find(p => p.id === reply.replyTo) : undefined;
                return (
                  <PostCard
                    key={reply.id}
                    post={reply}
                    currentUser={currentUser}
                    referencedPost={replyReferencedPost}
                    onToggleComplete={onToggleComplete}
                  />
                );
              })}
            </div>
          )}

          {replies.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No replies yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
