import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitledPostFields } from "./TitledPostFields";

describe("TitledPostFields", () => {
  function renderFields(overrides: Partial<React.ComponentProps<typeof TitledPostFields>> = {}) {
    const onTitleChange = vi.fn();
    const onLocationChange = vi.fn();
    const onSummaryChange = vi.fn();
    const utils = render(
      <TitledPostFields
        title=""
        location=""
        summary=""
        onTitleChange={onTitleChange}
        onLocationChange={onLocationChange}
        onSummaryChange={onSummaryChange}
        titleLabel="Title"
        locationLabel="Location"
        summaryLabel="Summary"
        {...overrides}
      />
    );
    return { onTitleChange, onLocationChange, onSummaryChange, ...utils };
  }

  it("fires the right callbacks per input", () => {
    const { onTitleChange, onLocationChange, onSummaryChange } = renderFields();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "S" } });
    expect(onTitleChange).toHaveBeenCalledWith("T");
    expect(onLocationChange).toHaveBeenCalledWith("L");
    expect(onSummaryChange).toHaveBeenCalledWith("S");
  });

  it("renders the provided values", () => {
    renderFields({ title: "Alpha", location: "Beta", summary: "Gamma" });
    expect(screen.getByLabelText("Title")).toHaveValue("Alpha");
    expect(screen.getByLabelText("Location")).toHaveValue("Beta");
    expect(screen.getByLabelText("Summary")).toHaveValue("Gamma");
  });
});
