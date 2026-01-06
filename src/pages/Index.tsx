import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { mockRelays, mockTags, mockPeople, mockTasks } from "@/data/mockData";
import { Relay, Tag, Person, Task, TaskType } from "@/types";
import { toast } from "sonner";

const Index = () => {
  const [relays, setRelays] = useState<Relay[]>(
    mockRelays.map((r) => ({ ...r, isActive: false }))
  );
  const [tags, setTags] = useState<Tag[]>(
    mockTags.map((t) => ({ ...t, filterState: "neutral" as const }))
  );
  const [people, setPeople] = useState<Person[]>(
    mockPeople.map((p) => ({ ...p, isSelected: false }))
  );
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleToggleComplete = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              isCompleted: !task.isCompleted,
              completedBy: !task.isCompleted ? currentUser?.name : undefined,
            }
          : task
      )
    );
    const task = tasks.find(t => t.id === taskId);
    toast.success(task?.isCompleted ? "Task reopened" : "Task completed");
  };

  const handleNewTask = (content: string, extractedTags: string[], relayIds: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string) => {
    const newTask: Task = {
      id: Date.now().toString(),
      author: people.find((p) => p.id === "me") || people[0],
      content,
      tags: extractedTags,
      relays: relayIds.length > 0 ? relayIds : [relays[0]?.id].filter(Boolean),
      taskType: taskType as TaskType,
      timestamp: new Date(),
      likes: 0,
      replies: 0,
      reposts: 0,
      dueDate,
      dueTime,
      parentId,
    };
    setTasks((prev) => [newTask, ...prev]);
    toast.success(taskType === "comment" ? "Comment added!" : "Task created!");
  };

  // Filter tasks based on active filters (relay filtering only for now)
  const filteredTasks = tasks.filter((task) => {
    const activeRelayIds = relays.filter((r) => r.isActive).map((r) => r.id);
    if (activeRelayIds.length > 0 && !task.relays.some(tr => activeRelayIds.includes(tr))) {
      return false;
    }

    // Exclude excluded tags
    const excludedTags = tags.filter((t) => t.filterState === "excluded").map((t) => t.name);
    if (task.tags.some((t) => excludedTags.includes(t))) {
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
        onToggleAllRelays={handleToggleAllRelays}
        onToggleAllTags={handleToggleAllTags}
        onToggleAllPeople={handleToggleAllPeople}
      />
      <TaskTree
        tasks={filteredTasks}
        allTasks={tasks}
        relays={relays}
        tags={tags}
        people={people}
        currentUser={currentUser}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewTask={handleNewTask}
        onToggleComplete={handleToggleComplete}
      />
    </div>
  );
};

export default Index;
