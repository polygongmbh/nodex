import { describe, expect, it } from "vitest";
import { taskMatchesTextQuery } from "./task-text-filter";
import { makePerson, makeTask } from "@/test/fixtures";

describe("taskMatchesTextQuery", () => {
  it("matches against hashtags and mention chips", () => {
    const task = makeTask({
      content: "Finish draft",
      tags: ["backend"],
      mentions: ["alice@example.com"],
    });

    expect(taskMatchesTextQuery(task, "backend")).toBe(true);
    expect(taskMatchesTextQuery(task, "#backend")).toBe(true);
    expect(taskMatchesTextQuery(task, "alice@example.com")).toBe(true);
  });

  it("matches against posting user username/display name", () => {
    const author = makePerson({
      name: "alice",
      displayName: "Alice Doe",
    });
    const task = makeTask({
      content: "No author name in text",
      author,
      tags: ["general"],
    });

    expect(taskMatchesTextQuery(task, "alice")).toBe(true);
    expect(taskMatchesTextQuery(task, "alice doe")).toBe(true);
    expect(taskMatchesTextQuery(task, "unrelated value")).toBe(false);
  });
});
