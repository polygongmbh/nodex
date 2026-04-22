import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TASK_DATE_TYPES, getTaskDateTypeLabel } from "@/lib/task-dates";
import { TaskDateTypeSelect } from "./TaskDateTypeSelect";

describe("TaskDateTypeSelect", () => {
  it("renders the current date type label on the trigger", () => {
    render(<TaskDateTypeSelect aria-label="Date type" value="due" onChange={() => undefined} />);

    const trigger = screen.getByRole("combobox", { name: "Date type" });
    expect(trigger).toHaveTextContent(getTaskDateTypeLabel("due"));
  });

  it("opens a listbox with one option per supported task date type", () => {
    render(<TaskDateTypeSelect aria-label="Date type" value="due" onChange={() => undefined} />);

    const trigger = screen.getByRole("combobox", { name: "Date type" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(TASK_DATE_TYPES.length);
    expect(options.map((option) => option.textContent)).toEqual(
      TASK_DATE_TYPES.map((dateType) => getTaskDateTypeLabel(dateType))
    );
  });

  it("emits the selected task date type value when an option is chosen", () => {
    const onChange = vi.fn();
    render(<TaskDateTypeSelect aria-label="Date type" value="due" onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Date type" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    const milestoneOption = screen.getByRole("option", { name: getTaskDateTypeLabel("milestone") });
    fireEvent.pointerUp(milestoneOption);
    fireEvent.click(milestoneOption);

    expect(onChange).toHaveBeenCalledWith("milestone");
  });
});
