import { describe, it, expect } from "vitest";
import type { Person } from "@/types/person";
import { resolveCurrentUser } from "./current-user";

const people: Person[] = [
  {
    id: "pubkey-me",
    name: "me",
    displayName: "You",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
  {
    id: "pubkey-alice",
    name: "alice",
    displayName: "Alice",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

describe("resolveCurrentUser", () => {
  it("prefers authenticated pubkey match", () => {
    const current = resolveCurrentUser(people, { pubkey: "pubkey-alice" });
    expect(current?.name).toBe("alice");
  });

  it("falls back to local 'me' profile", () => {
    const current = resolveCurrentUser(people, { pubkey: "unknown" });
    expect(current?.name).toBe("me");
  });
});
