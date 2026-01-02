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
  return (
    <main className="flex-1 border-r border-border max-w-2xl">
      <PostComposer onSubmit={onNewPost} relays={relays} tags={tags} people={people} />
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
