import { afterEach, describe, expect, it, vi } from "vitest";
import type { Post, TaskPost } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Person } from "@/types/person";
import {
  canPubkeyUpdateTask,
  canUserChangeTaskStatus,
  canUserUpdateTask,
  getTaskStatusChangeBlockedReason,
} from "./task-permissions";
import { hexPubkeyToNpub } from "@/lib/nostr/user-facing-pubkey";

function makeTestPerson(overrides: Partial<Person> = {}): Person {
  const pubkey = overrides.pubkey ?? "person-id";
  const name = overrides.name ?? pubkey;

  return {
    pubkey,
    name,
    displayName: overrides.displayName ?? name ?? pubkey,
    avatar: "",
    ...overrides,
  };
}

const user = makeTestPerson({
  pubkey: "user-1",
  name: "alice",
  nip05: "alice@example.com",
});

const baseTask: TaskPost = {
  id: "t1",
  kind: NostrEventKind.Task,
  pubkey: user.pubkey,
  content: "Task",
  tags: ["x"],
  relays: ["demo"],

  timestamp: new Date(),
  stateUpdates: [],
  dates: [],
  assigneePubkeys: [],
};

describe("canUserUpdateTask", () => {
  it("allows task updates for unassigned tasks", () => {
    expect(canUserUpdateTask(baseTask, user)).toBe(true);
  });

  it("allows task updates for unassigned tasks owned by another user", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, pubkey: otherAuthor.pubkey }, user)).toBe(true);
  });

  it("blocks task updates for assigned tasks when user is neither assignee nor creator", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, pubkey: otherAuthor.pubkey, mentions: ["carol"] }, user)).toBe(false);
  });

  it("allows task creator to update assigned tasks", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, pubkey: otherAuthor.pubkey, mentions: ["carol"] }, otherAuthor)).toBe(true);
  });

  it("allows task creators to update assigned tasks when author and current user use hex and npub variants", () => {
    const creatorHex = "f".repeat(64);
    const creatorNpub = hexPubkeyToNpub(creatorHex);
    expect(creatorNpub).toBeTruthy();

    const taskAuthor = makeTestPerson({ pubkey: creatorHex, name: "creator", displayName: "Creator" });
    const currentUser = makeTestPerson({ pubkey: creatorNpub ?? creatorHex, name: "creator", displayName: "Creator" });

    expect(
      canUserUpdateTask(
        { ...baseTask, pubkey: taskAuthor.pubkey, assigneePubkeys: ["a".repeat(64)] },
        currentUser
      )
    ).toBe(true);
  });

  it("prefers assignee pubkeys over mention aliases", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(
      canUserUpdateTask(
        {
          ...baseTask,
          pubkey: otherAuthor.pubkey,
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
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "carol", nip05: "carol@example.com" });
    expect(canUserUpdateTask({ ...baseTask, pubkey: otherAuthor.pubkey, content: "Sync with @bob" }, user)).toBe(
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
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    const task = { ...baseTask, pubkey: otherAuthor.pubkey };
    expect(canUserChangeTaskStatus(task, user)).toBe(true);
    expect(canUserChangeTaskStatus({ ...task, mentions: ["carol"] }, user)).toBe(false);
  });

  it("allows assigned-task edits for any signed-in user in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserUpdateTask({ ...baseTask, pubkey: otherAuthor.pubkey, mentions: ["carol"] }, user)).toBe(true);
  });

  it("allows status changes for any signed-in user in everyone mode", () => {
    vi.stubEnv("VITE_TASK_EDIT_MODE", "everyone");
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(canUserChangeTaskStatus({ ...baseTask, pubkey: otherAuthor.pubkey, mentions: ["carol"] }, user)).toBe(true);
  });
});

describe("canPubkeyUpdateTask", () => {
  it("allows any updater pubkey for unassigned tasks", () => {
    expect(canPubkeyUpdateTask(baseTask, "different-pubkey")).toBe(true);
  });

  it("allows creator pubkey to update assigned tasks", () => {
    const assignedTask = { ...baseTask, assigneePubkeys: ["assignee-pubkey"] };
    expect(canPubkeyUpdateTask(assignedTask, user.pubkey)).toBe(true);
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

describe("getTaskStatusChangeBlockedReason", () => {
  it("returns assignee-focused message when task is assigned to another user", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    const reason = getTaskStatusChangeBlockedReason(
      { ...baseTask, mentions: ["bob"], pubkey: otherAuthor.pubkey },
      user,
      false,
      [otherAuthor]
    );
    expect(reason).toContain("assigned to");
    expect(reason).toContain("bob@example.com");
    expect(reason).toContain("other-user");
  });

  it("uses the shared compact pubkey formatter in assignee-focused messages", () => {
    const pubkey = "f".repeat(64);
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    const reason = getTaskStatusChangeBlockedReason({ ...baseTask, pubkey: otherAuthor.pubkey, mentions: [pubkey] }, user);
    expect(reason).toContain("npub1");
    expect(reason).toContain("…");
  });

  it("returns undefined for signed-in users on unassigned tasks regardless of creator", () => {
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    const reason = getTaskStatusChangeBlockedReason({ ...baseTask, pubkey: otherAuthor.pubkey }, user);
    expect(reason).toBeUndefined();
  });

  it("enriches owner identity from known people context", () => {
    const sparseAuthorPubkey = "pubkey-123";
    const knownPerson = makeTestPerson({ pubkey: sparseAuthorPubkey, name: "ryan", displayName: "Ryan", nip05: "ryan@example.com" });
    const reason = getTaskStatusChangeBlockedReason(
      { ...baseTask, pubkey: sparseAuthorPubkey, mentions: [sparseAuthorPubkey] },
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
    const otherAuthor = makeTestPerson({ pubkey: "other-user", name: "bob", nip05: "bob@example.com" });
    expect(
      getTaskStatusChangeBlockedReason(
        { ...baseTask, pubkey: otherAuthor.pubkey, mentions: ["carol"] },
        user
      )
    ).toBeUndefined();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
