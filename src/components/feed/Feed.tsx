import { useState } from "react";
import { Search } from "lucide-react";
import { Post, Relay, Tag, Person } from "@/types";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";

interface FeedProps {
  posts: Post[];
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  onLike?: (postId: string) => void;
  onReply?: (postId: string) => void;
  onRepost?: (postId: string) => void;
  onNewPost?: (content: string, tags: string[], relay: string, postType: string) => void;
}

export function Feed({ posts, relays, tags, people, onLike, onReply, onRepost, onNewPost }: FeedProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPosts = posts.filter((post) =>
    searchQuery.trim() === "" || post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="flex-1 border-r border-border max-w-2xl flex flex-col h-screen">
      <PostComposer onSubmit={onNewPost} relays={relays} tags={tags} people={people} />
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filteredPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={() => onLike?.(post.id)}
            onReply={() => onReply?.(post.id)}
            onRepost={() => onRepost?.(post.id)}
          />
        ))}
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
    </main>
  );
}
