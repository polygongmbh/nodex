import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTaskNavigation } from "./use-task-navigation";

function Harness({ onSelectTask }: { onSelectTask: (taskId: string) => void }) {
  const { focusedTaskId } = useTaskNavigation({
    taskIds: ["task-1", "task-2"],
    onSelectTask,
  });

  return (
    <div>
      <select aria-label="Priority">
        <option value="">-</option>
        <option value="20">P20</option>
      </select>
      <span data-testid="focused-task">{focusedTaskId || "none"}</span>
    </div>
  );
}

describe("useTaskNavigation", () => {
  it("ignores keyboard navigation keys while a select control is focused", () => {
    const onSelectTask = vi.fn();

    render(<Harness onSelectTask={onSelectTask} />);

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("focused-task")).toHaveTextContent("task-1");

    const prioritySelect = screen.getByRole("combobox", { name: "Priority" });
    prioritySelect.focus();

    fireEvent.keyDown(prioritySelect, { key: "ArrowDown" });
    fireEvent.keyDown(prioritySelect, { key: "Enter" });

    expect(screen.getByTestId("focused-task")).toHaveTextContent("task-1");
    expect(onSelectTask).not.toHaveBeenCalled();
  });
});
