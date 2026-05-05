import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";

const PUBKEY = "a".repeat(64);

describe("UserAvatar", () => {
  it("uses beam fallback when no cached profile picture is available", () => {
    render(<UserAvatar pubkey={PUBKEY} />);

    const beam = screen.getByTestId(`user-avatar-beam-${PUBKEY}`);
    expect(beam).toBeInTheDocument();
    expect(beam).toHaveAttribute("data-generator", "boring-marble");
  });
});
