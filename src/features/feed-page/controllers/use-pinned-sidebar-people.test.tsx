import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarPeople } from "./use-pinned-sidebar-people";
import { makePerson, makeTask } from "@/test/fixtures";
import type { Person } from "@/types";
import { pinPersonForRelays, createEmptyPinnedPeopleState } from "@/domain/preferences/pinned-person-state";
import { savePinnedPeopleState } from "@/infrastructure/preferences/pinned-people-storage";

function Harness({ people }: { people: Person[] }) {
  const result = usePinnedSidebarPeople({
    userPubkey: undefined,
    currentView: "feed",
    effectiveActiveRelayIds: new Set(["relay-one"]),
    people,
    allTasks: [
      makeTask({
        id: "task-one",
        author: makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
        relays: ["relay-one"],
      }),
      makeTask({
        id: "task-two",
        author: makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
        relays: ["relay-one"],
      }),
    ],
  });

  return (
    <output data-testid="people-with-state">
      {result.peopleWithState.map((person) => person.id).join(",")}
    </output>
  );
}

describe("usePinnedSidebarPeople", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("surfaces pinned people ahead of derived people", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), "feed", ["relay-one"], "bob");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
          makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
        ]}
      />
    );

    expect(screen.getByTestId("people-with-state")).toHaveTextContent("bob,alice");
  });

  it("does not duplicate a pinned person already present in the derived list", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), "feed", ["relay-one"], "alice");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
        ]}
      />
    );

    expect(screen.getByTestId("people-with-state")).toHaveTextContent("alice");
  });
});
