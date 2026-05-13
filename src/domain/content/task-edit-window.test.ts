import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { canAuthorMutate, resolveEditWindowMinutes } from "./task-edit-window";

function makeTask(overrides: { author?: { pubkey: string }; timestamp?: Date } = {}): Pick<Task, "author" | "timestamp"> {
  return {
    author: {
      pubkey: overrides.author?.pubkey ?? "owner-pub",
      name: "owner",
      displayName: "owner",
      avatar: "",
    },
    timestamp: overrides.timestamp ?? new Date("2026-05-13T12:00:00Z"),
  };
}

describe("resolveEditWindowMinutes", () => {
  it("defaults to one week when env var is missing", () => {
    expect(resolveEditWindowMinutes({})).toBe(7 * 24 * 60);
  });

  it("defaults when value is blank", () => {
    expect(resolveEditWindowMinutes({ VITE_EDIT_WINDOW_MINUTES: "" })).toBe(7 * 24 * 60);
  });

  it("parses positive integers", () => {
    expect(resolveEditWindowMinutes({ VITE_EDIT_WINDOW_MINUTES: "30" })).toBe(30);
  });

  it("accepts zero as a valid disabled value", () => {
    expect(resolveEditWindowMinutes({ VITE_EDIT_WINDOW_MINUTES: "0" })).toBe(0);
  });

  it("falls back to default when value is non-numeric", () => {
    expect(resolveEditWindowMinutes({ VITE_EDIT_WINDOW_MINUTES: "nope" })).toBe(7 * 24 * 60);
  });

  it("falls back to default when value is negative", () => {
    expect(resolveEditWindowMinutes({ VITE_EDIT_WINDOW_MINUTES: "-5" })).toBe(7 * 24 * 60);
  });
});

describe("canAuthorMutate", () => {
  const now = new Date("2026-05-13T12:30:00Z");

  it("allows when owner, recent, and no children", () => {
    expect(
      canAuthorMutate({
        task: makeTask({ author: { pubkey: "owner-pub" }, timestamp: new Date("2026-05-13T12:20:00Z") }),
        currentUserPubkey: "owner-pub",
        hasChildren: false,
        now,
        editWindowMinutes: 60,
      })
    ).toEqual({ canDelete: true, canRecompose: true });
  });

  it("denies when window is zero", () => {
    const result = canAuthorMutate({
      task: makeTask(),
      currentUserPubkey: "owner-pub",
      hasChildren: false,
      now,
      editWindowMinutes: 0,
    });
    expect(result.canDelete).toBe(false);
    expect(result.canRecompose).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("denies a non-owner", () => {
    const result = canAuthorMutate({
      task: makeTask({ author: { pubkey: "owner-pub" } }),
      currentUserPubkey: "someone-else",
      hasChildren: false,
      now,
      editWindowMinutes: 60,
    });
    expect(result.reason).toBe("not-owner");
  });

  it("denies an unauthenticated user", () => {
    const result = canAuthorMutate({
      task: makeTask(),
      hasChildren: false,
      now,
      editWindowMinutes: 60,
    });
    expect(result.reason).toBe("not-owner");
  });

  it("treats pubkey casing as equivalent", () => {
    const result = canAuthorMutate({
      task: makeTask({ author: { pubkey: "ABC123" }, timestamp: now }),
      currentUserPubkey: "abc123",
      hasChildren: false,
      now,
      editWindowMinutes: 60,
    });
    expect(result.canDelete).toBe(true);
  });

  it("denies when the task has children", () => {
    const result = canAuthorMutate({
      task: makeTask({ author: { pubkey: "owner-pub" }, timestamp: now }),
      currentUserPubkey: "owner-pub",
      hasChildren: true,
      now,
      editWindowMinutes: 60,
    });
    expect(result.reason).toBe("has-children");
  });

  it("denies when the task is older than the window", () => {
    const result = canAuthorMutate({
      task: makeTask({ author: { pubkey: "owner-pub" }, timestamp: new Date("2026-05-13T10:00:00Z") }),
      currentUserPubkey: "owner-pub",
      hasChildren: false,
      now,
      editWindowMinutes: 60,
    });
    expect(result.reason).toBe("out-of-window");
  });

});
