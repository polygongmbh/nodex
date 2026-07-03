import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposeEventDialog, type ComposeEventDraft } from "./ComposeEventDialog";

const START = new Date("2026-07-04T00:00:00.000Z");

// Drive date selection with a single button instead of the real DayPicker.
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (value: unknown) => void }) => (
    <button type="button" onClick={() => onSelect?.({ from: START, to: undefined })}>
      Select calendar date
    </button>
  ),
}));

describe("ComposeEventDialog", () => {
  it("keeps confirm disabled until a start date is picked, then emits the draft", () => {
    const onConfirm = vi.fn();
    render(<ComposeEventDialog open initialDraft={null} onConfirm={onConfirm} onCancel={vi.fn()} />);

    const confirm = screen.getByTestId("compose-event-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByText("Select calendar date"));
    expect(confirm).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText("Event title"), { target: { value: "Launch" } });
    fireEvent.change(screen.getByPlaceholderText("Location"), { target: { value: "HQ" } });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const draft = onConfirm.mock.calls[0][0] as ComposeEventDraft;
    expect(draft.start).toEqual(START);
    expect(draft.title).toBe("Launch");
    expect(draft.location).toBe("HQ");
    // No time entered ⇒ all-day event.
    expect(draft.time).toBeUndefined();
    expect(draft.endTime).toBeUndefined();
  });

  it("emits start and end times for a timed event", () => {
    const onConfirm = vi.fn();
    render(<ComposeEventDialog open initialDraft={null} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Select calendar date"));

    const [startHours, endHours] = screen.getAllByTestId("task-time-input-hours");
    fireEvent.change(startHours, { target: { value: "14" } });
    fireEvent.change(endHours, { target: { value: "16" } });
    fireEvent.click(screen.getByTestId("compose-event-confirm"));

    const draft = onConfirm.mock.calls[0][0] as ComposeEventDraft;
    expect(draft.time).toBe("14:00");
    expect(draft.endTime).toBe("16:00");
  });

  it("calls onCancel from the cancel button", () => {
    const onCancel = vi.fn();
    render(<ComposeEventDialog open initialDraft={null} onConfirm={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
