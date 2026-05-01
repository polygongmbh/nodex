import { render, screen, act } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarPeople } from "./use-pinned-sidebar-people";
import { makePerson, makeTask } from "@/test/fixtures";
import type { SelectablePerson } from "@/types/person";
import {
  createEmptyPinnedPeopleState,
  getPinnedPersonIdsForRelays,
  pinPersonForRelays,
} from "@/domain/preferences/pinned-person-state";
import { loadPinnedPeopleState, savePinnedPeopleState } from "@/infrastructure/preferences/pinned-people-storage";

function Harness({ people, allRelays = ["relay-one"] }: { people: SelectablePerson[]; allRelays?: string[] }) {
  const result = usePinnedSidebarPeople({
    userPubkey: undefined,
    effectiveActiveRelayIds: new Set(allRelays),
    people,
    allTasks: [
      makeTask({
        id: "task-one",
        author: makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
        relays: ["relay-one"],
      }),
      makeTask({
        id: "task-two",
        author: makePerson({ pubkey: "bob", name: "bob", displayName: "Bob" }),
        relays: ["relay-two"],
      }),
    ],
  });

  const handleRef = useRef(result.handlePersonPin);
  handleRef.current = result.handlePersonPin;

  return (
    <>
      <output data-testid="people-with-state">
        {result.peopleWithState.map((person) => person.pubkey).join(",")}
      </output>
      <output data-testid="pinned-person-ids">
        {result.pinnedPersonIds.join(",")}
      </output>
      <button onClick={() => handleRef.current("bob")}>pin-bob</button>
    </>
  );
}

describe("usePinnedSidebarPeople", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("surfaces pinned people ahead of derived people", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), ["relay-one"], "bob");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
          makePerson({ pubkey: "bob", name: "bob", displayName: "Bob" }),
        ]}
      />
    );

    expect(screen.getByTestId("people-with-state")).toHaveTextContent("bob,alice");
  });

  it("does not duplicate a pinned person already present in the derived list", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), ["relay-one"], "alice");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
        ]}
      />
    );

    expect(screen.getByTestId("people-with-state")).toHaveTextContent("alice");
  });

  it("keeps pinned people visible across views", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), ["relay-one"], "bob");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
        ]}
      />
    );

    expect(screen.getByTestId("people-with-state")).toHaveTextContent("bob,alice");
  });

  it("returns pinned person ids as a first-class result", () => {
    const state = pinPersonForRelays(createEmptyPinnedPeopleState(), ["relay-one"], "bob");
    savePinnedPeopleState(state);

    render(
      <Harness
        people={[
          makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" }),
        ]}
      />
    );

    expect(screen.getByTestId("pinned-person-ids")).toHaveTextContent("bob");
  });

  it("pins a person only to the relay where their tasks appear", () => {
    render(
      <Harness
        people={[]}
        allRelays={["relay-one", "relay-two"]}
      />
    );

    act(() => {
      screen.getByText("pin-bob").click();
    });

    const saved = loadPinnedPeopleState(undefined);
    expect(getPinnedPersonIdsForRelays(saved, ["relay-two"])).toContain("bob");
    expect(getPinnedPersonIdsForRelays(saved, ["relay-one"])).not.toContain("bob");
  });
});
