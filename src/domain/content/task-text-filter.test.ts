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

  it("matches via resolved people metadata when task author only has pubkey", () => {
    const task = makeTask({
      author: makePerson({
        id: "f".repeat(64),
        name: "",
        displayName: "",
      }),
      content: "Content without author hints",
    });
    const people = [
      makePerson({
        id: "f".repeat(64),
        name: "alice",
        displayName: "Alice Example",
      }),
    ];

    expect(taskMatchesTextQuery(task, "alice", people)).toBe(true);
    expect(taskMatchesTextQuery(task, "alice example", people)).toBe(true);
  });

  it("matches via resolved mention display names and usernames", () => {
    const person = makePerson({
      id: "f".repeat(64),
      name: "alice",
      displayName: "Alice Example",
      nip05: "alice@example.com",
    });
    const task = makeTask({
      content: "Content without visible person label",
      mentions: ["alice@example.com"],
    });

    expect(taskMatchesTextQuery(task, "alice", [person])).toBe(true);
    expect(taskMatchesTextQuery(task, "alice example", [person])).toBe(true);
  });
});
