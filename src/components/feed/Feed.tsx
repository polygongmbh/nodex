import { Post } from "@/types";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";
import { FeedHeader } from "./FeedHeader";

interface FeedProps {
  posts: Post[];
  onLike?: (postId: string) => void;
  onReply?: (postId: string) => void;
  onRepost?: (postId: string) => void;
  onNewPost?: (content: string, tags: string[]) => void;
}

export function Feed({ posts, onLike, onReply, onRepost, onNewPost }: FeedProps) {
  return (
    <main className="flex-1 border-r border-border max-w-2xl">
      <FeedHeader />
      <PostComposer onSubmit={onNewPost} />
      <div className="divide-y divide-border">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={() => onLike?.(post.id)}
            onReply={() => onReply?.(post.id)}
            onRepost={() => onRepost?.(post.id)}
          />
        ))}
      </div>
    </main>
  );
}
