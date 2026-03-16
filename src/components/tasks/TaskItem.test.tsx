import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { TaskItem } from "./TaskItem";
import type { Task } from "@/types";
import { makePerson, makeTask } from "@/test/fixtures";

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

const baseTask: Task = makeTask({
  id: "t1",
  author: makePerson({ id: "me", name: "me", displayName: "Me" }),
  content: "Ship feature #frontend",
  tags: ["frontend"],
  status: "todo",
});

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

  it("allows directly marking a task as closed", () => {
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

    fireEvent.click(screen.getByText("Closed"));

    expect(onStatusChange).toHaveBeenCalledWith("t1", "closed");
  });

  it("does not cycle done tasks on click when status menu is available", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={{ ...baseTask, status: "done" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("does not cycle closed tasks on click when status menu is available", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={{ ...baseTask, status: "closed" }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    fireEvent.click(screen.getByLabelText("Set status"));

    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("shows a status hover hint on the task checkbox", () => {
    render(
      <TaskItem
        task={baseTask}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
      />
    );

    expect(screen.getByLabelText("Set status")).toHaveAttribute(
      "title",
      expect.stringContaining("select status")
    );
  });

  it("blocks status changes when task is assigned to another user", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={{
          ...baseTask,
          author: makePerson({ id: "other-pubkey", name: "bob" }),
          content: "Follow up with @alice",
        }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute("title", expect.stringContaining("assigned to"));
    fireEvent.click(statusButton);
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onToggleComplete).not.toHaveBeenCalled();
  });

  it("allows status changes when an unassigned task belongs to another user", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();

    render(
      <TaskItem
        task={{
          ...baseTask,
          author: makePerson({ id: "other-pubkey", name: "alice" }),
        }}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).not.toBeDisabled();
    fireEvent.click(statusButton);
    expect(onToggleComplete).toHaveBeenCalledWith("t1");
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("uses people context to show enriched identity details in blocked reason", () => {
    const onStatusChange = vi.fn();
    const onToggleComplete = vi.fn();
    const sparseAuthor = makePerson({
      id: "ad9cb1b0f13f54e84214e7dc809bcf6968a4e255c57c6a588eb976b4e8141318",
      name: "ad9cb1b0",
      displayName: "ad9cb1b0...1318",
    });
    const knownPerson = makePerson({
      id: sparseAuthor.id,
      name: "ryan",
      displayName: "Ryan",
      nip05: "ryan@example.com",
    });

    render(
      <TaskItem
        task={{
          ...baseTask,
          author: sparseAuthor,
          mentions: [sparseAuthor.id],
        }}
        people={[knownPerson]}
        filteredChildren={[]}
        allTasks={[baseTask]}
        currentUser={baseTask.author}
        onStatusChange={onStatusChange}
        onToggleComplete={onToggleComplete}
      />
    );

    const statusButton = screen.getByLabelText("Set status");
    expect(statusButton).toBeDisabled();
    expect(statusButton).toHaveAttribute(
      "title",
      expect.stringContaining("assigned to Ryan (@ryan, ryan@example.com")
    );
    expect(statusButton).toHaveAttribute("title", expect.stringContaining(sparseAuthor.id));
  });

  it("calls author quick action for comment avatar/name clicks", () => {
    const onAuthorClick = vi.fn();
    const commentTask: Task = {
      ...baseTask,
      id: "c1",
      taskType: "comment",
      content: "Looks good",
      author: makePerson({
        id: "alice-pubkey",
        name: "alice",
        displayName: "Alice",
      }),
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

  it("shows a precise hover timestamp for comment created time", () => {
    const commentTask: Task = {
      ...baseTask,
      id: "c2",
      taskType: "comment",
      content: "Precise time test",
      timestamp: new Date("2026-03-01T23:57:11.000Z"),
    };

    render(
      <TaskItem
        task={commentTask}
        filteredChildren={[]}
        allTasks={[commentTask]}
        currentUser={baseTask.author}
      />
    );

    expect(screen.getByTitle(/comment created at/i)).toHaveAttribute(
      "title",
      expect.stringMatching(/comment created at .*\d{2}:\d{2}:\d{2}/i)
    );
  });
});
