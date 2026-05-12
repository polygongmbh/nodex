import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDueDateEditorForm } from "./TaskMetadataEditors";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date?: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date("2026-05-10T00:00:00.000Z"))}>
      Select calendar date
    </button>
  ),
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

function chooseComboboxOptionByIndex(name: string | RegExp, optionIndex: number) {
  const trigger = screen.getByRole("combobox", { name });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  const option = within(screen.getByRole("listbox")).getAllByRole("option")[optionIndex];
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe("TaskDueDateEditorForm", () => {
  it("stages date type changes and dispatches them on confirm", () => {
    const dueDate = new Date("2026-05-01T00:00:00.000Z");

    render(
      <TaskDueDateEditorForm
        taskId="task-due-date"
        dueDate={dueDate}
        dueTime="10:30"
        dateType="due"
      />
    );

    chooseComboboxOptionByIndex(/type/i, 1);

    expect(dispatchFeedInteraction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.updateDueDate",
      taskId: "task-due-date",
      dueDate,
      dueTime: "10:30",
      dateType: "scheduled",
    });
  });

  it("invokes onClose after confirm but not after clear", () => {
    const onClose = vi.fn();

    render(
      <TaskDueDateEditorForm
        taskId="task-due-date"
        dueDate={new Date("2026-05-01T00:00:00.000Z")}
        dateType="due"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("contains pointer and click events inside the editor surface", () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();

    render(
      <div onPointerDown={onPointerDown} onClick={onClick}>
        <TaskDueDateEditorForm
          taskId="task-due-date"
          dueDate={new Date("2026-05-01T00:00:00.000Z")}
          dateType="due"
        />
      </div>
    );

    const clearButton = screen.getByRole("button", { name: /clear/i });

    fireEvent.pointerDown(clearButton);
    fireEvent.click(clearButton);

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
