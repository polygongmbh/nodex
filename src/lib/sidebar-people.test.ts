import { describe, expect, it } from "vitest";
import { deriveSidebarPeople } from "./sidebar-people";
import { makePerson, makeTask } from "@/test/fixtures";

describe("deriveSidebarPeople", () => {
  it("keeps only people with at least three posts and sorts by latest post first", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const alice = makePerson({ id: "alice-pk", name: "alice", displayName: "Alice", isSelected: true });
    const bob = makePerson({ id: "bob-pk", name: "bob", displayName: "Bob", isSelected: false });
    const carol = makePerson({ id: "carol-pk", name: "carol", displayName: "Carol", isSelected: false });

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

    expect(sidebarPeople.map((person) => person.id)).toEqual(["alice-pk", "bob-pk"]);
    expect(sidebarPeople[0].isSelected).toBe(true);
  });

  it("sets online only for people with a post in the last three minutes", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const recent = makePerson({ id: "recent-pk", name: "recent", displayName: "Recent" });
    const stale = makePerson({ id: "stale-pk", name: "stale", displayName: "Stale" });

    const tasks = [
      makeTask({ id: "r1", author: recent, timestamp: new Date("2026-02-17T11:57:30.000Z") }),
      makeTask({ id: "r2", author: recent, timestamp: new Date("2026-02-17T11:57:20.000Z") }),
      makeTask({ id: "r3", author: recent, timestamp: new Date("2026-02-17T11:57:10.000Z") }),
      makeTask({ id: "s1", author: stale, timestamp: new Date("2026-02-17T11:56:59.000Z") }),
      makeTask({ id: "s2", author: stale, timestamp: new Date("2026-02-17T11:50:00.000Z") }),
      makeTask({ id: "s3", author: stale, timestamp: new Date("2026-02-17T11:45:00.000Z") }),
    ];

    const sidebarPeople = deriveSidebarPeople([recent, stale], tasks, new Map(), now);
    expect(sidebarPeople.find((person) => person.id === "recent-pk")?.isOnline).toBe(true);
    expect(sidebarPeople.find((person) => person.id === "stale-pk")?.isOnline).toBe(false);
    expect(sidebarPeople.find((person) => person.id === "stale-pk")?.onlineStatus).toBe("recent");
  });

  it("uses NIP-38 activity timestamps for online status", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");
    const alice = makePerson({ id: "alice-pk", name: "alice", displayName: "Alice" });
    const tasks = [
      makeTask({ id: "a1", author: alice, timestamp: new Date("2026-02-17T10:30:00.000Z") }),
      makeTask({ id: "a2", author: alice, timestamp: new Date("2026-02-17T10:20:00.000Z") }),
      makeTask({ id: "a3", author: alice, timestamp: new Date("2026-02-17T10:10:00.000Z") }),
    ];
    const presence = new Map([["alice-pk", new Date("2026-02-17T11:58:30.000Z").getTime()]]);

    const sidebarPeople = deriveSidebarPeople([alice], tasks, presence, now);

    expect(sidebarPeople[0].isOnline).toBe(true);
    expect(sidebarPeople[0].onlineStatus).toBe("online");
  });
});
