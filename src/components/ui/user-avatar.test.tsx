import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";
import { seedNostrProfile } from "@/infrastructure/nostr/use-nostr-profiles";

const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);
const PUBKEY_C = "c".repeat(64);

describe("UserAvatar", () => {
  it("uses beam fallback when no cached profile picture is available", () => {
    render(
      <UserAvatar
        id={PUBKEY_A}
        displayName="Alice"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.getByTestId("user-beam")).toBeInTheDocument();
    expect(screen.getByTestId("user-beam")).toHaveAttribute("data-generator", "boring-marble");
  });

  it("renders the cached profile picture when seeded", () => {
    seedNostrProfile({
      pubkey: PUBKEY_B,
      displayName: "Alice",
      picture: "https://example.com/avatar.png",
    });

    render(
      <UserAvatar
        id={PUBKEY_B}
        displayName="Alice"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.queryByTestId("user-beam")).not.toBeInTheDocument();
    // Avatar image renders as soon as it loads; until then the fallback initial is shown.
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders avataaars-like cached pictures without special casing", () => {
    seedNostrProfile({
      pubkey: PUBKEY_C,
      displayName: "Alice",
      picture: "/avataaars/seed-Alice.svg",
    });

    render(
      <UserAvatar
        id={PUBKEY_C}
        displayName="Alice"
        className="w-8 h-8"
        beamTestId="user-beam"
      />
    );

    expect(screen.queryByTestId("user-beam")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
