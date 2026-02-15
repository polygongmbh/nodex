import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BeamAvatar } from "./beam-avatar";

describe("BeamAvatar", () => {
  it("renders deterministic output for same seed", () => {
    const { container: first } = render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    const firstMarkup = first.innerHTML;

    const { container: second } = render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    const secondMarkup = second.innerHTML;

    expect(firstMarkup).toBe(secondMarkup);
  });

  it("renders svg with role img", () => {
    render(<BeamAvatar seed="pubkey-123" data-testid="beam" />);
    expect(screen.getByRole("img", { name: /generated avatar/i })).toBeInTheDocument();
  });
});
