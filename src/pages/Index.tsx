import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Feed } from "@/components/feed/Feed";
import { mockRelays, mockTags, mockPeople, mockPosts } from "@/data/mockData";
import { Relay, Tag, Person, Post, PostType } from "@/types";
import { toast } from "sonner";

const ALL_POST_TYPES: PostType[] = ["message", "task", "event", "offer", "request", "blog"];

const Index = () => {
  // Initialize all filters as unselected
  const [relays, setRelays] = useState<Relay[]>(
    mockRelays.map((r) => ({ ...r, isActive: false }))
  );
  const [tags, setTags] = useState<Tag[]>(
    mockTags.map((t) => ({ ...t, filterState: "neutral" as const }))
  );
  const [people, setPeople] = useState<Person[]>(
    mockPeople.map((p) => ({ ...p, isSelected: false }))
  );
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [activePostTypes, setActivePostTypes] = useState<PostType[]>([]);

  const currentUser = people.find(p => p.id === "me");

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

  const handleToggleAllRelays = () => {
    const allActive = relays.every((r) => r.isActive);
    setRelays((prev) => prev.map((relay) => ({ ...relay, isActive: !allActive })));
    toast.success(allActive ? "All relays disabled" : "All relays enabled");
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

  const handleToggleAllTags = () => {
    const allNeutral = tags.every((t) => t.filterState === "neutral");
    setTags((prev) =>
      prev.map((tag) => ({
        ...tag,
        filterState: allNeutral ? "included" : "neutral",
      }))
    );
    toast.success(allNeutral ? "All tags included" : "All tags reset");
  };

  const handlePersonToggle = (id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  };

  const handleToggleAllPeople = () => {
    const allSelected = people.every((p) => p.isSelected);
    setPeople((prev) => prev.map((person) => ({ ...person, isSelected: !allSelected })));
    toast.success(allSelected ? "All people deselected" : "All people selected");
  };

  const handlePostTypeToggle = (type: PostType) => {
    setActivePostTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handlePostTypeExclusive = (type: PostType) => {
    setActivePostTypes([type]);
    toast.success(`Showing only ${type}s`);
  };

  const handleToggleAllPostTypes = () => {
    const allActive = activePostTypes.length === ALL_POST_TYPES.length;
    setActivePostTypes(allActive ? [] : ALL_POST_TYPES);
    toast.success(allActive ? "All post types hidden" : "All post types shown");
  };

  const handleToggleComplete = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isCompleted: !post.isCompleted,
              completedBy: !post.isCompleted ? currentUser?.name : undefined,
            }
          : post
      )
    );
    const post = posts.find(p => p.id === postId);
    toast.success(post?.isCompleted ? "Task reopened" : "Task completed");
  };

  const handleNewPost = (content: string, extractedTags: string[], relayIds: string[], postType: string, dueDate?: Date, dueTime?: string, replyTo?: string) => {
    const newPost: Post = {
      id: Date.now().toString(),
      author: people.find((p) => p.id === "me") || people[0],
      content,
      tags: extractedTags,
      relays: relayIds,
      postType: postType as PostType,
      timestamp: new Date(),
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      replyTo,
    };
    setPosts((prev) => [newPost, ...prev]);
    
    // Increment reply count on parent post
    if (replyTo) {
      setPosts((prev) =>
        prev.map((post) =>
          post.id === replyTo
            ? { ...post, replies: post.replies + 1 }
            : post
        )
      );
    }
    
    toast.success(`${postType.charAt(0).toUpperCase() + postType.slice(1)} published!`);
  };

  // Filter posts based on active filters
  const filteredPosts = posts.filter((post) => {
    // Filter by active relays
    const activeRelayIds = relays.filter((r) => r.isActive).map((r) => r.id);
    if (activeRelayIds.length > 0 && !post.relays.some(pr => activeRelayIds.includes(pr))) {
      return false;
    }

    // Filter by post types
    if (activePostTypes.length > 0 && !activePostTypes.includes(post.postType)) {
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
        activePostTypes={activePostTypes}
        onRelayToggle={handleRelayToggle}
        onRelayExclusive={handleRelayExclusive}
        onTagToggle={handleTagToggle}
        onTagExclusive={handleTagExclusive}
        onPersonToggle={handlePersonToggle}
        onPostTypeToggle={handlePostTypeToggle}
        onPostTypeExclusive={handlePostTypeExclusive}
        onToggleAllRelays={handleToggleAllRelays}
        onToggleAllTags={handleToggleAllTags}
        onToggleAllPeople={handleToggleAllPeople}
        onToggleAllPostTypes={handleToggleAllPostTypes}
      />
      <Feed
        posts={filteredPosts}
        allPosts={posts}
        relays={relays}
        tags={tags}
        people={people}
        activePostTypes={activePostTypes}
        currentUser={currentUser}
        onNewPost={handleNewPost}
        onToggleComplete={handleToggleComplete}
      />
    </div>
  );
};

export default Index;
