import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";
import { setPreferredAvatarGenerator } from "@/lib/avatar-preferences";

describe("UserAvatar", () => {
  it("uses beam fallback when avatar url is missing", () => {
    setPreferredAvatarGenerator("boring");
    render(
      <UserAvatar
        id="pubkey-abc"
        displayName="Alice"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.getByTestId("user-beam")).toBeInTheDocument();
    expect(screen.getByTestId("user-beam")).toHaveAttribute("data-generator", "boring");
  });

  it("renders image when avatar url is provided", () => {
    setPreferredAvatarGenerator("boring");
    render(
      <UserAvatar
        id="pubkey-abc"
        displayName="Alice"
        avatarUrl="https://example.com/avatar.png"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.queryByTestId("user-beam")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("uses beam fallback for legacy dicebear placeholder urls", () => {
    setPreferredAvatarGenerator("boring");
    render(
      <UserAvatar
        id="pubkey-abc"
        displayName="Alice"
        avatarUrl="/avataaars/seed-Alice.svg"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.getByTestId("user-beam")).toBeInTheDocument();
    expect(screen.getByTestId("user-beam")).toHaveAttribute("data-generator", "boring");
  });

  it("uses local dicebear generator when selected", () => {
    setPreferredAvatarGenerator("dicebear-local");
    render(
      <UserAvatar
        id="pubkey-abc"
        displayName="Alice"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.getByTestId("user-beam")).toBeInTheDocument();
    expect(screen.getByTestId("user-beam")).toHaveAttribute("data-generator", "dicebear-local");
  });
});
