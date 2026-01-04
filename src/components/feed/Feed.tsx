import { useState } from "react";
import { Search } from "lucide-react";
import { Post, Relay, Tag, Person, PostType } from "@/types";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";
import { ThreadView } from "./ThreadView";

interface FeedProps {
  posts: Post[];
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  activePostTypes: PostType[];
  allPosts: Post[];
  currentUser?: Person;
  onNewPost?: (content: string, tags: string[], relays: string[], postType: string, dueDate?: Date, dueTime?: string, replyTo?: string) => void;
  onToggleComplete?: (postId: string) => void;
}

export function Feed({ posts, relays, tags, people, activePostTypes, allPosts, currentUser, onNewPost, onToggleComplete }: FeedProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [referencedPostId, setReferencedPostId] = useState<string | undefined>();
  const [threadPostId, setThreadPostId] = useState<string | undefined>();

  const filteredPosts = posts.filter((post) =>
    searchQuery.trim() === "" || post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const referencedPost = referencedPostId ? allPosts.find(p => p.id === referencedPostId) : undefined;
  const threadPost = threadPostId ? allPosts.find(p => p.id === threadPostId) : undefined;
  const threadReplies = threadPostId ? allPosts.filter(p => p.replyTo === threadPostId) : [];

  const handleReference = (postId: string) => {
    setReferencedPostId(postId);
  };

  const handleViewThread = (postId: string) => {
    if (!isComposing) {
      setThreadPostId(postId);
    }
  };

  return (
    <main className="flex-1 border-r border-border max-w-2xl flex flex-col h-screen">
      <PostComposer 
        onSubmit={onNewPost} 
        relays={relays} 
        tags={tags} 
        people={people} 
        activePostTypes={activePostTypes}
        referencedPost={referencedPost}
        onClearReference={() => setReferencedPostId(undefined)}
        isComposing={isComposing}
        onComposingChange={setIsComposing}
      />
      
      {/* Composing hint */}
      {isComposing && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 text-xs text-primary">
          Click on a post to reference it in your reply. Press Escape to cancel.
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filteredPosts.map((post) => {
          const postReferencedPost = post.replyTo ? allPosts.find(p => p.id === post.replyTo) : undefined;
          return (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              isComposing={isComposing}
              onReference={handleReference}
              onToggleComplete={onToggleComplete}
              onViewThread={handleViewThread}
              referencedPost={postReferencedPost}
            />
          );
        })}
        {filteredPosts.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No posts found{searchQuery && ` matching "${searchQuery}"`}
          </div>
        )}
      </div>

      {/* Pinned Search Bar */}
      <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts..."
            className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Thread View Modal */}
      {threadPost && (
        <ThreadView
          post={threadPost}
          replies={threadReplies}
          currentUser={currentUser}
          allPosts={allPosts}
          onClose={() => setThreadPostId(undefined)}
          onToggleComplete={onToggleComplete}
        />
      )}
    </main>
  );
}
