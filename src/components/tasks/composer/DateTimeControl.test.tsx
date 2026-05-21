import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateTimeControl } from "./DateTimeControl";

describe("DateTimeControl", () => {
  it("renders the placeholder when no date is set and hides time controls", () => {
    render(
      <DateTimeControl
        date={undefined}
        onDateChange={() => {}}
        time=""
        onTimeChange={() => {}}
        placeholder="Pick a date"
        clearLabel="Clear date"
      />
    );
    expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/clear date/i)).not.toBeInTheDocument();
  });

  it("renders time input + clear button when a date is set", () => {
    render(
      <DateTimeControl
        date={new Date("2026-05-22T00:00:00.000Z")}
        onDateChange={() => {}}
        time="14:30"
        onTimeChange={() => {}}
        placeholder="Pick a date"
        clearLabel="Clear date"
        timeLabel="Start time"
      />
    );
    expect(screen.getByLabelText("Start time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear date/i })).toBeInTheDocument();
  });

  it("clears both date and time when clear button is pressed", () => {
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();
    render(
      <DateTimeControl
        date={new Date("2026-05-22T00:00:00.000Z")}
        onDateChange={onDateChange}
        time="14:30"
        onTimeChange={onTimeChange}
        placeholder="Pick a date"
        clearLabel="Clear date"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear date/i }));
    expect(onDateChange).toHaveBeenCalledWith(undefined);
    expect(onTimeChange).toHaveBeenCalledWith("");
  });
});
