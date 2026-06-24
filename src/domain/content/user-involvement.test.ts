import { describe, expect, it } from "vitest";
import { buildUserInvolvementIndex, makeHomeTimelinePredicate } from "./user-involvement";
import { makeComment, makePerson, makeTask } from "@/test/fixtures";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);
const me = makePerson({ pubkey: ME, name: "alice", displayName: "@alice" });
const other = makePerson({ pubkey: OTHER, name: "bob", displayName: "@bob" });

describe("buildUserInvolvementIndex", () => {
  it("includes authored posts, assigned tasks, and activity beneath them", () => {
    const mine = makeTask({ id: "mine", author: me });
    const assigned = makeTask({ id: "assigned", author: other, assigneePubkeys: [ME.toUpperCase()] });
    const replyToMine = makeComment({ id: "reply", author: other, parentId: "mine" });
    const subtaskOfAssigned = makeTask({ id: "sub", author: other, parentId: "assigned" });
    const foreign = makeTask({ id: "foreign", author: other });

    const involved = buildUserInvolvementIndex(
      [mine, assigned, replyToMine, subtaskOfAssigned, foreign],
      ME
    );

    expect(involved).toEqual(new Set(["mine", "assigned", "reply", "sub"]));
  });

  it("does not pull in siblings of a thread the user merely commented in", () => {
    const foreignRoot = makeTask({ id: "root", author: other });
    const myComment = makeComment({ id: "my-comment", author: me, parentId: "root" });
    const siblingTask = makeTask({ id: "sibling", author: other, parentId: "root" });

    const involved = buildUserInvolvementIndex([foreignRoot, myComment, siblingTask], ME);

    expect(involved).toEqual(new Set(["my-comment"]));
  });

  it("returns an empty set when signed out", () => {
    const task = makeTask({ id: "t", author: me });
    expect(buildUserInvolvementIndex([task], undefined).size).toBe(0);
  });
});

describe("makeHomeTimelinePredicate", () => {
  it("keeps top-level posts and involving posts, drops foreign nested ones", () => {
    const topLevel = makeTask({ id: "top", author: other });
    const foreignNested = makeTask({ id: "nested", author: other, parentId: "top" });
    const involvedNested = makeTask({ id: "mine-nested", author: me, parentId: "top" });
    const predicate = makeHomeTimelinePredicate({
      focusedTaskId: null,
      involvedIds: new Set(["mine-nested"]),
    });

    expect(predicate(topLevel)).toBe(true);
    expect(predicate(foreignNested)).toBe(false);
    expect(predicate(involvedNested)).toBe(true);
  });

  it("treats direct children of the focused task as top-level", () => {
    const child = makeTask({ id: "child", author: other, parentId: "focus" });
    const grandchild = makeTask({ id: "grandchild", author: other, parentId: "child" });
    const predicate = makeHomeTimelinePredicate({ focusedTaskId: "focus", involvedIds: new Set() });

    expect(predicate(child)).toBe(true);
    expect(predicate(grandchild)).toBe(false);
  });

  it("restricts top-level posts to pinned channels but keeps involving posts", () => {
    const pinnedTopLevel = makeTask({ id: "pinned-top", author: other, tags: ["Dev"] });
    const unpinnedTopLevel = makeTask({ id: "unpinned-top", author: other, tags: ["random"] });
    const involvedElsewhere = makeTask({ id: "mine", author: me, tags: ["random"] });
    const predicate = makeHomeTimelinePredicate({
      focusedTaskId: null,
      involvedIds: new Set(["mine"]),
      pinnedChannelTags: new Set(["dev"]),
    });

    expect(predicate(pinnedTopLevel)).toBe(true);
    expect(predicate(unpinnedTopLevel)).toBe(false);
    // Involvement bypasses the pinned-channel restriction.
    expect(predicate(involvedElsewhere)).toBe(true);
  });
});
