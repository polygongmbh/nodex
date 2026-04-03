import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFocusedTaskCollapsedSidebarPreview } from "./use-focused-task-collapsed-sidebar-preview";
import { makeChannel, makePerson, makeTask } from "@/test/fixtures";
import type { Channel, Task } from "@/types";
import type { Person } from "@/types/person";

const channels: Channel[] = [
  makeChannel({ id: "general", name: "general" }),
  makeChannel({ id: "ops", name: "ops" }),
  makeChannel({ id: "random", name: "random" }),
];

const people: Person[] = [
  makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
  makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
  makePerson({ id: "cara", name: "cara", displayName: "Cara" }),
];

const allTasks: Task[] = [
  makeTask({
    id: "root",
    content: "Root #general",
    tags: ["general"],
    author: makePerson({ id: "alice", name: "alice", displayName: "Alice" }),
    relays: ["relay-one"],
  }),
  makeTask({
    id: "child",
    parentId: "root",
    content: "Child #ops",
    tags: ["ops"],
    author: makePerson({ id: "bob", name: "bob", displayName: "Bob" }),
    relays: ["relay-one"],
  }),
  makeTask({
    id: "other-root",
    content: "Other #random",
    tags: ["random"],
    author: makePerson({ id: "cara", name: "cara", displayName: "Cara" }),
    relays: ["relay-one"],
  }),
];

function Harness({
  focusedTaskId,
  sidebarChannels = channels,
  sidebarPeople = people,
}: {
  focusedTaskId: string | null;
  sidebarChannels?: Channel[];
  sidebarPeople?: Person[];
}) {
  const preview = useFocusedTaskCollapsedSidebarPreview({
    allTasks,
    focusedTaskId,
    activeRelayIds: new Set(["relay-one"]),
    channels: sidebarChannels,
    people: sidebarPeople,
  });

  return (
    <>
      <output data-testid="channels">{preview.channels.map((channel) => channel.id).join(",")}</output>
      <output data-testid="people">{preview.people.map((person) => person.id).join(",")}</output>
    </>
  );
}

describe("useFocusedTaskCollapsedSidebarPreview", () => {
  it("returns the full sidebar lists when no task is focused", () => {
    render(<Harness focusedTaskId={null} />);

    expect(screen.getByTestId("channels")).toHaveTextContent("general,ops,random");
    expect(screen.getByTestId("people")).toHaveTextContent("alice,bob,cara");
  });

  it("returns only channels and people active in the focused task scope", () => {
    render(<Harness focusedTaskId="root" />);

    expect(screen.getByTestId("channels")).toHaveTextContent("general,ops");
    expect(screen.getByTestId("channels")).not.toHaveTextContent("random");
    expect(screen.getByTestId("people")).toHaveTextContent("alice,bob");
    expect(screen.getByTestId("people")).not.toHaveTextContent("cara");
  });

  it("omits out-of-scope pinned stubs from the collapsed preview source", () => {
    render(
      <Harness
        focusedTaskId="root"
        sidebarChannels={[...channels, makeChannel({ id: "release", name: "release" })]}
        sidebarPeople={[...people, makePerson({ id: "dora", name: "dora", displayName: "Dora" })]}
      />
    );

    expect(screen.getByTestId("channels")).not.toHaveTextContent("release");
    expect(screen.getByTestId("people")).not.toHaveTextContent("dora");
  });
});
