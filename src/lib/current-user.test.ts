import { describe, it, expect } from "vitest";
import type { SelectablePerson } from "@/types/person";
import { resolveCurrentUser } from "./current-user";

const people: SelectablePerson[] = [
  {
    pubkey: "pubkey-me",
    name: "me",
    displayName: "You",
    picture: "",
  },
  {
    pubkey: "pubkey-alice",
    name: "alice",
    displayName: "Alice",
    picture: "",
  },
];

describe("resolveCurrentUser", () => {
  it("returns the person matching the authenticated pubkey", () => {
    const current = resolveCurrentUser(people, { pubkey: "pubkey-alice" });
    expect(current?.name).toBe("alice");
  });

  it("returns undefined when no auth user is provided", () => {
    expect(resolveCurrentUser(people, null)).toBeUndefined();
    expect(resolveCurrentUser(people, undefined)).toBeUndefined();
  });

  it("returns undefined when the authenticated pubkey has no matching person", () => {
    expect(resolveCurrentUser(people, { pubkey: "unknown" })).toBeUndefined();
  });
});
