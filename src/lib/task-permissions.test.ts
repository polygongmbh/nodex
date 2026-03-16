import { describe, it, expect } from "vitest";
import type { Person, Task } from "@/types";
import {
  canUserChangeTaskStatus,
  extractAssignedMentionsFromContent,
  getTaskStatusChangeBlockedReason,
} from "./task-permissions";

const user: Person = {
  id: "user-1",
  name: "alice",
  displayName: "Alice",
  nip05: "alice@example.com",
  avatar: "",
  isOnline: true,
  isSelected: false,
};

const baseTask: Task = {
  id: "t1",
  author: user,
  content: "Task",
  tags: ["x"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
};

describe("canUserChangeTaskStatus", () => {
  it("allows status changes for unassigned tasks", () => {
    expect(canUserChangeTaskStatus(baseTask, user)).toBe(true);
  });

  it("blocks status changes for unassigned tasks owned by another user", () => {
    const otherAuthor: Person = {
      ...user,
      id: "other-user",
      name: "bob",
      displayName: "Bob",
      nip05: "bob@example.com",
    };
    expect(canUserChangeTaskStatus({ ...baseTask, author: otherAuthor }, user)).toBe(false);
  });

  it("blocks status changes for assigned tasks when user is not assignee", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, mentions: ["bob"] }, user)).toBe(false);
  });

  it("prefers assignee pubkeys over mention aliases", () => {
    expect(
      canUserChangeTaskStatus(
        {
          ...baseTask,
          mentions: ["alice"],
          assigneePubkeys: ["other-pubkey"],
        },
        user
      )
    ).toBe(false);
  });

  it("allows assignee by username", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, mentions: ["alice"] }, user)).toBe(true);
  });

  it("uses content mentions when explicit mentions are not present", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, content: "Sync with @bob" }, user)).toBe(
      false
    );
  });

  it("allows assignee by nip05 identifier", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, mentions: ["alice@example.com"] }, user)).toBe(true);
  });

  it("allows assignee by explicit assignee pubkey", () => {
    expect(
      canUserChangeTaskStatus(
        {
          ...baseTask,
          assigneePubkeys: ["user-1"],
        },
        user
      )
    ).toBe(true);
  });
});

describe("extractAssignedMentionsFromContent", () => {
  it("extracts normalized unique @mentions", () => {
    expect(extractAssignedMentionsFromContent("pair with @Alice and @bob and @alice")).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("extracts nip05 mentions", () => {
    expect(extractAssignedMentionsFromContent("pair with @alice@example.com")).toEqual([
      "alice@example.com",
    ]);
  });
});

describe("getTaskStatusChangeBlockedReason", () => {
  it("returns assignee-focused message when task is assigned to another user", () => {
    const otherAuthor: Person = {
      ...user,
      id: "other-user",
      name: "bob",
      displayName: "Bob",
      nip05: "bob@example.com",
    };
    expect(
      getTaskStatusChangeBlockedReason(
        { ...baseTask, mentions: ["bob"], author: otherAuthor },
        user
      )
    ).toContain("assigned to Bob (@bob, bob@example.com, other-user)");
  });

  it("does not trim pubkeys in assignee-focused message", () => {
    const pubkey = "f".repeat(64);
    expect(getTaskStatusChangeBlockedReason({ ...baseTask, mentions: [pubkey] }, user)).toContain(pubkey);
  });

  it("returns owner-focused message when unassigned task belongs to another user", () => {
    const otherAuthor: Person = {
      ...user,
      id: "other-user",
      name: "bob",
      displayName: "Bob",
      nip05: "bob@example.com",
    };
    const reason = getTaskStatusChangeBlockedReason({ ...baseTask, author: otherAuthor }, user);
    expect(reason).toContain("belongs to");
    expect(reason).toContain("Bob (@bob, bob@example.com, other-user)");
  });

  it("enriches owner identity from known people context", () => {
    const sparseAuthor: Person = {
      ...user,
      id: "pubkey-123",
      name: "pubkey123",
      displayName: "pubkey-123",
      nip05: undefined,
    };
    const knownPerson: Person = {
      ...sparseAuthor,
      displayName: "Ryan",
      name: "ryan",
      nip05: "ryan@example.com",
    };
    const reason = getTaskStatusChangeBlockedReason(
      { ...baseTask, author: sparseAuthor },
      user,
      false,
      [knownPerson]
    );
    expect(reason).toContain("Ryan (@ryan, ryan@example.com, pubkey-123)");
  });

  it("returns interaction-blocked message when edits are globally blocked", () => {
    expect(getTaskStatusChangeBlockedReason(baseTask, user, true)).toBe("Editing is currently unavailable.");
  });
});
