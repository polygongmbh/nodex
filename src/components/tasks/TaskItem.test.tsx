import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { TaskItem } from "./TaskItem";
import type { Task } from "@/types";

vi.mock("@/hooks/use-nostr-profiles", () => ({
  useNostrProfile: () => ({ profile: null }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

const baseTask: Task = {
  id: "t1",
  author: {
    id: "me",
    name: "me",
    displayName: "Me",
    avatar: "",
    isOnline: false,
    isSelected: false,
  },
  content: "Ship feature #frontend",
  tags: ["frontend"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "todo",
};

describe("TaskItem status actions", () => {
  it("cycles status on plain click even when status menu exists", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(onToggleComplete).toHaveBeenCalledWith("t1");
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("allows directly marking a task as done", () => {
    const onStatusChange = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(screen.getByText("Done"));

    expect(onStatusChange).toHaveBeenCalledWith("t1", "done");
  });

  it("blocks status changes when task is assigned to another user", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={{ ...baseTask, content: "Follow up with @alice" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    fireEvent.click(statusButton);
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onToggleComplete).not.toHaveBeenCalled();
  });

  it("calls author quick action for comment avatar/name clicks", () => {
    const onAuthorClick = vi.fn();
    const commentTask: Task = {
      ...baseTask,
      id: "c1",
      taskType: "comment",
      content: "Looks good",
      author: {
        id: "alice-pubkey",
        name: "alice",
        displayName: "Alice",
        avatar: "",
        isOnline: true,
        isSelected: false,
      },
    };

    render(
      <TaskItem
        task={commentTask}
        filteredChildren={[]}
        allTasks={[commentTask]}
        currentUser={baseTask.author}
        onAuthorClick={onAuthorClick}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /filter and mention alice/i })[0]);

    expect(onAuthorClick).toHaveBeenCalledWith(commentTask.author);
  });
});
