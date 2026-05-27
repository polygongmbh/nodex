import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitledPostFields } from "./TitledPostFields";
import type { TitledPostFields as TitledPostFieldsType } from "@/types";

describe("TitledPostFields", () => {
  function renderFields(overrides: Partial<React.ComponentProps<typeof TitledPostFields>> = {}) {
    const onChange = vi.fn();
    const onTitleTouched = vi.fn();
    const utils = render(
      <TitledPostFields
        value={{}}
        onChange={onChange}
        onTitleTouched={onTitleTouched}
        titleLabel="Title"
        locationLabel="Location"
        summaryLabel="Summary"
        {...overrides}
      />
    );
    return { onChange, onTitleTouched, ...utils };
  }

  it("fires onChange with the patched field per input", () => {
    const { onChange, onTitleTouched } = renderFields();
    fireEvent.change(screen.getByTestId("titled-post-title"), { target: { value: "T" } });
    fireEvent.change(screen.getByTestId("titled-post-location"), { target: { value: "L" } });
    fireEvent.change(screen.getByTestId("titled-post-summary"), { target: { value: "S" } });
    expect(onChange).toHaveBeenNthCalledWith(1, { title: "T" });
    expect(onChange).toHaveBeenNthCalledWith(2, { location: "L" });
    expect(onChange).toHaveBeenNthCalledWith(3, { summary: "S" });
    expect(onTitleTouched).toHaveBeenCalledTimes(1);
  });

  it("renders the provided values", () => {
    const value: TitledPostFieldsType = { title: "Alpha", location: "Beta", summary: "Gamma" };
    renderFields({ value });
    expect(screen.getByTestId("titled-post-title")).toHaveValue("Alpha");
    expect(screen.getByTestId("titled-post-location")).toHaveValue("Beta");
    expect(screen.getByTestId("titled-post-summary")).toHaveValue("Gamma");
  });
});
