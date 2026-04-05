import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_EDIT_MODE,
  resolveTaskEditMode,
} from "./task-permissions-policy";

describe("resolveTaskEditMode", () => {
  it("defaults to assignee_or_creator when unset", () => {
    expect(resolveTaskEditMode({})).toBe(DEFAULT_TASK_EDIT_MODE);
  });

  it("accepts the everyone mode", () => {
    expect(resolveTaskEditMode({ VITE_TASK_EDIT_MODE: "everyone" })).toBe("everyone");
  });

  it("normalizes casing and whitespace", () => {
    expect(resolveTaskEditMode({ VITE_TASK_EDIT_MODE: " Everyone " })).toBe("everyone");
  });

  it("falls back safely for unsupported values", () => {
    expect(resolveTaskEditMode({ VITE_TASK_EDIT_MODE: "admins_only" })).toBe(DEFAULT_TASK_EDIT_MODE);
  });
});
