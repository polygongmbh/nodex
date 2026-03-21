import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VersionHint } from "./VersionHint";

describe("VersionHint", () => {
  it("opens changelog dialog when version is clicked", () => {
    render(<VersionHint />);

    fireEvent.click(screen.getByText(/^v\d+\.\d+\.\d+$/i));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
