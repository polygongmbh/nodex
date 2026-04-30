import { describe, it, expect } from "vitest";
import type { SelectablePerson } from "@/types/person";
import { resolveCurrentUser } from "./current-user";

const people: SelectablePerson[] = [
  {
    pubkey: "pubkey-me",
    name: "me",
    displayName: "You",
    avatar: "",
    isSelected: false,
  },
  {
    pubkey: "pubkey-alice",
    name: "alice",
    displayName: "Alice",
    avatar: "",
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
