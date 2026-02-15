import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BeamAvatar } from "./beam-avatar";

describe("BeamAvatar", () => {
  it("renders deterministic output for same seed", () => {
    const { container: first } = render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    const firstSvg = first.querySelector("svg");
    const firstPaths = Array.from(first.querySelectorAll("path")).map((node) => node.getAttribute("transform"));
    const firstBackground = first.querySelector("rect")?.getAttribute("fill");

    const { container: second } = render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    const secondSvg = second.querySelector("svg");
    const secondPaths = Array.from(second.querySelectorAll("path")).map((node) => node.getAttribute("transform"));
    const secondBackground = second.querySelector("rect")?.getAttribute("fill");

    expect(firstSvg?.getAttribute("viewBox")).toBe(secondSvg?.getAttribute("viewBox"));
    expect(firstBackground).toBe(secondBackground);
    expect(firstPaths).toEqual(secondPaths);
  });

  it("renders svg with role img", () => {
    render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    expect(screen.getByRole("img", { name: /generated avatar/i })).toBeInTheDocument();
  });
});
