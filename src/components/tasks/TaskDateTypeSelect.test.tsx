import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TASK_DATE_TYPES } from "@/lib/task-dates";
import { TaskDateTypeSelect } from "./TaskDateTypeSelect";

describe("TaskDateTypeSelect", () => {
  it("renders one option for each supported task date type", () => {
    render(<TaskDateTypeSelect aria-label="Date type" value="due" onChange={() => undefined} />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(TASK_DATE_TYPES.length);
    expect(options.map((option) => option.getAttribute("value"))).toEqual(TASK_DATE_TYPES);
  });

  it("emits the selected task date type value", () => {
    const onChange = vi.fn();
    render(<TaskDateTypeSelect aria-label="Date type" value="due" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Date type" }), {
      target: { value: "milestone" },
    });

    expect(onChange).toHaveBeenCalledWith("milestone");
  });
});
