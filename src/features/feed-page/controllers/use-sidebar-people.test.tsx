import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { useSidebarPeople } from "./use-sidebar-people";
import { useAllPosts } from "./use-all-posts";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { __resetPostsStoreForTests } from "@/features/feed-page/stores/posts-store";
import type { PersonFrecencyState } from "@/lib/person-frecency";
import { makePerson, makeRelay, makeTask } from "@/test/fixtures";
import type { Relay } from "@/types";

const relays: Relay[] = [
  makeRelay({ id: "relay-one", name: "Relay One", url: "wss://relay.one", isActive: true }),
  makeRelay({ id: "relay-two", name: "Relay Two", url: "wss://relay.two", isActive: true }),
];

function SidebarPeopleHarness() {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(new Set(["relay-one"]));
  const [personFrecencyState, setPersonFrecencyState] = useState<PersonFrecencyState>({});

  const alice = makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" });
  const bob = makePerson({ pubkey: "bob", name: "bob", displayName: "Bob" });

  const allTasks = useAllPosts({
    demoTasks: [],
    isHydrating: false,
    hasLiveHydratedScope: false,
  });
  const allRelayIds = useMemo(() => relays.map((relay) => relay.id), []);
  const sidebarPeople = useSidebarPeople({
    allTasks,
    people: [alice, bob],
    latestPresenceByAuthor: new Map(),
    effectiveActiveRelayIds: activeRelayIds,
    allRelayIds,
    personFrecencyState,
  });

  return (
    <>
      <button onClick={() => setActiveRelayIds(new Set(["relay-two"]))}>SwitchRelay</button>
      <button
        onClick={() =>
          setPersonFrecencyState({
            alice: { score: 2, lastInteractedAt: Date.now() },
          })
        }
      >
        RefreshAlice
      </button>
      <output data-testid="sidebar-people-ids">
        {sidebarPeople.map((person) => person.pubkey).join(",")}
      </output>
    </>
  );
}

describe("useSidebarPeople", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetPostsStoreForTests();
    const alice = makePerson({ pubkey: "alice", name: "alice", displayName: "Alice" });
    const bob = makePerson({ pubkey: "bob", name: "bob", displayName: "Bob" });
    useTaskMutationStore.setState({
      localTasks: [
        makeTask({ id: "a1", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "a2", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "a3", author: alice, tags: ["ops"], relays: ["relay-one"] }),
        makeTask({ id: "b1", author: bob, tags: ["general"], relays: ["relay-two"] }),
        makeTask({ id: "b2", author: bob, tags: ["general"], relays: ["relay-two"] }),
        makeTask({ id: "b3", author: bob, tags: ["general"], relays: ["relay-two"] }),
      ],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  it("derives frequent people from the active relay scope", () => {
    render(
      <MemoryRouter>
        <SidebarPeopleHarness />
      </MemoryRouter>
    );

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("alice");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("bob");

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");
  });

  it("does not let person frecency keep out-of-scope people visible after switching relays", () => {
    render(
      <MemoryRouter>
        <SidebarPeopleHarness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "SwitchRelay" }));
    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");

    fireEvent.click(screen.getByRole("button", { name: "RefreshAlice" }));

    expect(screen.getByTestId("sidebar-people-ids")).toHaveTextContent("bob");
    expect(screen.getByTestId("sidebar-people-ids")).not.toHaveTextContent("alice");
  });
});
