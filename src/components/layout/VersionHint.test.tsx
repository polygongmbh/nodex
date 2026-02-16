import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionHint } from "./VersionHint";

describe("VersionHint", () => {
  it("renders a compact semantic version label with a hover hint", () => {
    render(<VersionHint />);

    const hint = screen.getByText("v1.0.0");
    expect(hint).toHaveAttribute("title", "Nodex version 1.0.0");
  });
});
