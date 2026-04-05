import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
import {
  canPubkeyUpdateTask,
  canUserChangeTaskStatus,
  canUserUpdateTask,
  extractAssignedMentionsFromContent,
  getTaskStatusChangeBlockedReason,
} from "./task-permissions";

function makeTestPerson(overrides: Partial<Person> = {}): Person {
  const id = overrides.id ?? "person-id";
  const name = overrides.name ?? id;

  return {
    id,
    name,
    displayName: overrides.displayName ?? name ?? id,
    avatar: "",
    isOnline: true,
    isSelected: false,
    ...overrides,
  };
}

const user = makeTestPerson({
  id: "user-1",
  name: "alice",
  nip05: "alice@example.com",
});

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

describe("canUserUpdateTask", () => {
  it("allows task updates for unassigned tasks", () => {
    expect(canUserUpdateTask(baseTask, user)).toBe(true);
  });

  it("allows task updates for unassigned tasks owned by another user", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, author: otherAuthor }, user)).toBe(true);
  });

  it("blocks task updates for assigned tasks when user is neither assignee nor creator", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, author: otherAuthor, mentions: ["carol"] }, user)).toBe(false);
  });

  it("allows task creator to update assigned tasks", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, author: otherAuthor, mentions: ["carol"] }, otherAuthor)).toBe(true);
  });

  it("prefers assignee pubkeys over mention aliases", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(
      canUserUpdateTask(
        {
          ...baseTask,
          author: otherAuthor,
          mentions: ["alice"],
          assigneePubkeys: ["other-pubkey"],
        },
        user
      )
    ).toBe(false);
  });

  it("allows assignee by username", () => {
    expect(canUserUpdateTask({ ...baseTask, mentions: ["alice"] }, user)).toBe(true);
  });

  it("uses content mentions when explicit mentions are not present", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "carol", nip05: "carol@example.com" });
    expect(canUserUpdateTask({ ...baseTask, author: otherAuthor, content: "Sync with @bob" }, user)).toBe(
      false
    );
  });

  it("allows assignee by nip05 identifier", () => {
    expect(canUserUpdateTask({ ...baseTask, mentions: ["alice@example.com"] }, user)).toBe(true);
  });

  it("allows assignee by explicit assignee pubkey", () => {
    expect(
      canUserUpdateTask(
        {
          ...baseTask,
          assigneePubkeys: ["user-1"],
        },
        user
      )
    ).toBe(true);
  });

  it("keeps status change permissions aligned with the shared task update rule", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    const task = { ...baseTask, author: otherAuthor };
    expect(canUserChangeTaskStatus(task, user)).toBe(true);
    expect(canUserChangeTaskStatus({ ...task, mentions: ["carol"] }, user)).toBe(false);
  });

  it("allows assigned-task edits for any signed-in user in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, author: otherAuthor, mentions: ["carol"] }, user)).toBe(true);
  });

  it("allows status changes for any signed-in user in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserChangeTaskStatus({ ...baseTask, author: otherAuthor, mentions: ["carol"] }, user)).toBe(true);
  });
});

describe("canPubkeyUpdateTask", () => {
  it("allows any updater pubkey for unassigned tasks", () => {
    expect(canPubkeyUpdateTask(baseTask, "different-pubkey")).toBe(true);
  });

  it("allows creator pubkey to update assigned tasks", () => {
    const assignedTask = { ...baseTask, assigneePubkeys: ["assignee-pubkey"] };
    expect(canPubkeyUpdateTask(assignedTask, user.id)).toBe(true);
  });

  it("allows explicit assignee pubkey to update assigned tasks", () => {
    const assignedTask = { ...baseTask, assigneePubkeys: ["assignee-pubkey"] };
    expect(canPubkeyUpdateTask(assignedTask, "assignee-pubkey")).toBe(true);
  });

  it("blocks unrelated pubkeys from updating assigned tasks", () => {
    const assignedTask = { ...baseTask, assigneePubkeys: ["assignee-pubkey"] };
    expect(canPubkeyUpdateTask(assignedTask, "other-pubkey")).toBe(false);
  });

  it("allows any non-empty pubkey in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const assignedTask = { ...baseTask, assigneePubkeys: ["assignee-pubkey"] };
    expect(canPubkeyUpdateTask(assignedTask, "other-pubkey")).toBe(true);
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
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    const reason = getTaskStatusChangeBlockedReason(
      { ...baseTask, mentions: ["bob"], author: otherAuthor },
      user
    );
    expect(reason).toContain("assigned to");
    expect(reason).toContain("bob@example.com");
    expect(reason).toContain("other-user");
  });

  it("does not trim pubkeys in assignee-focused message", () => {
    const pubkey = "f".repeat(64);
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(getTaskStatusChangeBlockedReason({ ...baseTask, author: otherAuthor, mentions: [pubkey] }, user)).toContain(pubkey);
  });

  it("returns undefined for signed-in users on unassigned tasks regardless of creator", () => {
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    const reason = getTaskStatusChangeBlockedReason({ ...baseTask, author: otherAuthor }, user);
    expect(reason).toBeUndefined();
  });

  it("enriches owner identity from known people context", () => {
    const sparseAuthor = makeTestPerson({ id: "pubkey-123", name: "pubkey123", displayName: "pubkey-123", nip05: undefined });
    const knownPerson = makeTestPerson({ id: sparseAuthor.id, name: "ryan", displayName: "Ryan", nip05: "ryan@example.com" });
    const reason = getTaskStatusChangeBlockedReason(
      { ...baseTask, author: sparseAuthor, mentions: [sparseAuthor.id] },
      user,
      false,
      [knownPerson]
    );
    expect(reason).toContain("Ryan");
    expect(reason).toContain("ryan@example.com");
    expect(reason).toContain("pubkey-123");
  });

  it("returns interaction-blocked message when edits are globally blocked", () => {
    expect(getTaskStatusChangeBlockedReason(baseTask, user, true)).toBe("Editing is currently unavailable.");
  });

  it("does not return assignee-only denial copy in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const otherAuthor = makeTestPerson({ id: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(
      getTaskStatusChangeBlockedReason(
        { ...baseTask, author: otherAuthor, mentions: ["carol"] },
        user
      )
    ).toBeUndefined();
  });
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
