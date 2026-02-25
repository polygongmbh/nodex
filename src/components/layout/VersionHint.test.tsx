import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VersionHint } from "./VersionHint";

describe("VersionHint", () => {
  it("opens changelog dialog when version is clicked", () => {
    render(<VersionHint />);

    fireEvent.click(screen.getByRole("button", { name: /open changelog/i }));

    expect(screen.getByText("Nodex Changelog")).toBeInTheDocument();
    expect(screen.getByText(/Version history and release highlights/i)).toBeInTheDocument();
  });
});
