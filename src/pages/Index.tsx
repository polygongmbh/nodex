import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Feed } from "@/components/feed/Feed";
import { RightSidebar } from "@/components/widgets/RightSidebar";
import { mockRelays, mockTags, mockPeople, mockPosts } from "@/data/mockData";
import { Relay, Tag, Person, Post } from "@/types";
import { toast } from "sonner";

const Index = () => {
  const [relays, setRelays] = useState<Relay[]>(mockRelays);
  const [tags, setTags] = useState<Tag[]>(mockTags);
  const [people, setPeople] = useState<Person[]>(mockPeople);
  const [posts, setPosts] = useState<Post[]>(mockPosts);

  const handleRelayToggle = (id: string) => {
    setRelays((prev) =>
      prev.map((relay) =>
        relay.id === id ? { ...relay, isActive: !relay.isActive } : relay
      )
    );
    const relay = relays.find((r) => r.id === id);
    toast.success(`${relay?.name} relay ${relay?.isActive ? "disabled" : "enabled"}`);
  };

  const handleRelayExclusive = (id: string) => {
    setRelays((prev) =>
      prev.map((relay) => ({
        ...relay,
        isActive: relay.id === id,
      }))
    );
    const relay = relays.find((r) => r.id === id);
    toast.success(`Showing only ${relay?.name} relay`);
  };

  const handleTagToggle = (id: string) => {
    setTags((prev) =>
      prev.map((tag) => {
        if (tag.id !== id) return tag;
        const states: Tag["filterState"][] = ["neutral", "included", "excluded"];
        const currentIndex = states.indexOf(tag.filterState);
        const nextState = states[(currentIndex + 1) % states.length];
        return { ...tag, filterState: nextState };
      })
    );
  };

  const handleTagExclusive = (id: string) => {
    setTags((prev) =>
      prev.map((tag) => ({
        ...tag,
        filterState: tag.id === id ? "included" : "neutral",
      }))
    );
    const tag = tags.find((t) => t.id === id);
    toast.success(`Showing only #${tag?.name}`);
  };

  const handlePersonToggle = (id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  };

  const handleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLiked: !post.isLiked,
              likes: post.isLiked ? post.likes - 1 : post.likes + 1,
            }
          : post
      )
    );
  };

  const handleRepost = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isReposted: !post.isReposted,
              reposts: post.isReposted ? post.reposts - 1 : post.reposts + 1,
            }
          : post
      )
    );
  };

  const handleNewPost = (content: string, extractedTags: string[], relay: string, postType: string) => {
    const newPost: Post = {
      id: Date.now().toString(),
      author: people.find((p) => p.id === "me") || people[0],
      content,
      tags: extractedTags,
      relay,
      timestamp: new Date(),
      likes: 0,
      replies: 0,
      reposts: 0,
    };
    setPosts((prev) => [newPost, ...prev]);
    toast.success(`${postType.charAt(0).toUpperCase() + postType.slice(1)} published to ${relays.find(r => r.id === relay)?.name} relay!`);
  };

  // Filter posts based on active filters
  const filteredPosts = posts.filter((post) => {
    // Filter by active relays
    const activeRelayIds = relays.filter((r) => r.isActive).map((r) => r.id);
    if (activeRelayIds.length > 0 && !activeRelayIds.includes(post.relay)) {
      return false;
    }

    // Filter by included tags
    const includedTags = tags.filter((t) => t.filterState === "included").map((t) => t.name);
    if (includedTags.length > 0 && !post.tags.some((t) => includedTags.includes(t))) {
      return false;
    }

    // Filter out excluded tags
    const excludedTags = tags.filter((t) => t.filterState === "excluded").map((t) => t.name);
    if (post.tags.some((t) => excludedTags.includes(t))) {
      return false;
    }

    return true;
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        relays={relays}
        tags={tags}
        people={people}
        onRelayToggle={handleRelayToggle}
        onRelayExclusive={handleRelayExclusive}
        onTagToggle={handleTagToggle}
        onTagExclusive={handleTagExclusive}
        onPersonToggle={handlePersonToggle}
      />
      <div className="flex flex-1">
        <Feed
          posts={filteredPosts}
          relays={relays}
          tags={tags}
          people={people}
          onLike={handleLike}
          onRepost={handleRepost}
          onNewPost={handleNewPost}
        />
        <RightSidebar />
      </div>
    </div>
  );
};

export default Index;
