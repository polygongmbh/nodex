import { describe, expect, it } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import { deriveSidebarPeople } from "./sidebar-people";

describe("deriveSidebarPeople", () => {
  it("keeps only people with at least three posts and sorts by latest post first", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const alice = makePerson({
      pubkey: "alice-pk",
      name: "alice",
      displayName: "Alice",
      isSelected: true,
    });
    const bob = makePerson({
      pubkey: "bob-pk",
      name: "bob",
      displayName: "Bob",
      isSelected: false,
    });
    const carol = makePerson({
      pubkey: "carol-pk",
      name: "carol",
      displayName: "Carol",
      isSelected: false,
    });

    const tasks = [
      makeTask({ id: "a1", author: alice, timestamp: new Date("2026-02-17T11:59:30.000Z") }),
      makeTask({ id: "a2", author: alice, timestamp: new Date("2026-02-17T11:58:10.000Z") }),
      makeTask({ id: "a3", author: alice, timestamp: new Date("2026-02-17T11:57:50.000Z") }),
      makeTask({ id: "b1", author: bob, timestamp: new Date("2026-02-17T11:59:00.000Z") }),
      makeTask({ id: "b2", author: bob, timestamp: new Date("2026-02-17T11:40:00.000Z") }),
      makeTask({ id: "b3", author: bob, timestamp: new Date("2026-02-17T11:20:00.000Z") }),
      makeTask({ id: "c1", author: carol, timestamp: new Date("2026-02-17T11:58:00.000Z") }),
      makeTask({ id: "c2", author: carol, timestamp: new Date("2026-02-17T11:57:00.000Z") }),
    ];

    const sidebarPeople = deriveSidebarPeople([alice, bob, carol], tasks, new Map(), now);

    expect(sidebarPeople.map((person) => person.pubkey)).toEqual(["alice-pk", "bob-pk"]);
    expect(sidebarPeople[0].isSelected).toBe(true);
  });

  // Presence-state derivation lives in presence-status (derivePersonPresenceSnapshot)
  // and is exercised by PersonItem via usePersonPresence; deriveSidebarPeople
  // only uses the active timestamp to influence sort order.

  it("uses person frecency only as a tiebreaker inside the visible relay scope", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const frequent = makePerson({ pubkey: "frequent-pk", name: "frequent", displayName: "Frequent" });
    const manual = makePerson({ pubkey: "manual-pk", name: "manual", displayName: "Manual" });
    const tasks = [
      makeTask({ id: "f1", author: frequent, timestamp: new Date("2026-02-17T11:59:30.000Z") }),
      makeTask({ id: "f2", author: frequent, timestamp: new Date("2026-02-17T11:58:10.000Z") }),
      makeTask({ id: "f3", author: frequent, timestamp: new Date("2026-02-17T11:57:50.000Z") }),
      makeTask({ id: "m1", author: manual, timestamp: new Date("2026-02-17T11:59:30.000Z") }),
      makeTask({ id: "m2", author: manual, timestamp: new Date("2026-02-17T11:55:50.000Z") }),
      makeTask({ id: "m3", author: manual, timestamp: new Date("2026-02-17T11:54:50.000Z") }),
    ];

    const sidebarPeople = deriveSidebarPeople(
      [manual, frequent],
      tasks,
      new Map(),
      now,
      { personalizeScores: new Map([["manual-pk", 2]]) }
    );

    expect(sidebarPeople.map((person) => person.pubkey)).toEqual(["manual-pk", "frequent-pk"]);
  });

  it("does not let person frecency pull hidden-relay people back into the visible list", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const scoped = makePerson({ pubkey: "scoped-pk", name: "scoped", displayName: "Scoped" });
    const hidden = makePerson({ pubkey: "hidden-pk", name: "hidden", displayName: "Hidden" });
    const tasks = [
      makeTask({ id: "s1", author: scoped, timestamp: new Date("2026-02-17T11:59:30.000Z") }),
      makeTask({ id: "s2", author: scoped, timestamp: new Date("2026-02-17T11:58:10.000Z") }),
      makeTask({ id: "s3", author: scoped, timestamp: new Date("2026-02-17T11:57:50.000Z") }),
    ];

    const sidebarPeople = deriveSidebarPeople(
      [hidden, scoped],
      tasks,
      new Map(),
      now,
      { personalizeScores: new Map([["hidden-pk", 2]]) }
    );

    expect(sidebarPeople.map((person) => person.pubkey)).toEqual(["scoped-pk"]);
  });
});
