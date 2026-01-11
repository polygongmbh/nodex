import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { KanbanView } from "@/components/tasks/KanbanView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { ListView } from "@/components/tasks/ListView";
import { ViewSwitcher, ViewType } from "@/components/tasks/ViewSwitcher";
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
  const [currentView, setCurrentView] = useState<ViewType>("tree");

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
      prev.map((task) => {
        if (task.id !== taskId) return task;
        
        const currentStatus = task.status || "todo";
        let nextStatus: "todo" | "in-progress" | "done";
        let completedBy: string | undefined = task.completedBy;
        
        if (currentStatus === "todo") {
          nextStatus = "in-progress";
        } else if (currentStatus === "in-progress") {
          nextStatus = "done";
          completedBy = currentUser?.name;
        } else {
          nextStatus = "todo";
          completedBy = undefined;
        }
        
        return { ...task, status: nextStatus, completedBy };
      })
    );
    
    const task = tasks.find(t => t.id === taskId);
    const currentStatus = task?.status || "todo";
    if (currentStatus === "todo") {
      toast.success("Task in progress");
    } else if (currentStatus === "in-progress") {
      toast.success("Task completed");
    } else {
      toast.success("Task reopened");
    }
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

  const viewProps = {
    tasks: filteredTasks,
    allTasks: tasks,
    relays,
    tags,
    people,
    currentUser,
    searchQuery,
    onSearchChange: setSearchQuery,
    onNewTask: handleNewTask,
    onToggleComplete: handleToggleComplete,
  };

  const renderView = () => {
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} />;
      case "feed":
        return <FeedView {...viewProps} />;
      case "kanban":
        return <KanbanView {...viewProps} />;
      case "calendar":
        return <CalendarView {...viewProps} />;
      case "list":
        return <ListView {...viewProps} />;
      default:
        return <TaskTree {...viewProps} />;
    }
  };

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
      <div className="flex-1 flex flex-col">
        {/* View Switcher Header */}
        <div className="border-b border-border p-3 bg-background/95 backdrop-blur-sm flex justify-center">
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
        </div>
        {/* Current View */}
        {renderView()}
      </div>
    </div>
  );
};

export default Index;
