import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import { makeChannel, makePerson, makeTask } from "@/test/fixtures";
import { isTaskPost } from "@/types";
import type { Channel, Post } from "@/types";

function Harness({
  posts,
  channels,
}: {
  posts: Post[];
  channels: Channel[];
}) {
  const filtered = useTaskViewFiltering({
    posts,
    focusedTaskId: null,
    searchQuery: "",
    people: [makePerson()],
    selectedPubkeys: new Set(),
    channels,
    channelMatchMode: "and",
    taskPredicate: (task) => isTaskPost(task),
  });

  return <output data-testid="filtered-task-ids">{filtered.map((task) => task.id).join(",")}</output>;
}

describe("useTaskViewFiltering", () => {
  it("returns empty when an included channel matches no post in scope", () => {
    const generalTask = makeTask({ id: "general-task", tags: ["general"], content: "General task #general" });

    render(
      <Harness
        posts={[generalTask]}
        channels={[
          makeChannel({ id: "ops", name: "ops", filterState: "included" }),
          makeChannel({ id: "general", name: "general", filterState: "neutral" }),
        ]}
      />
    );

    expect(screen.getByTestId("filtered-task-ids")).toBeEmptyDOMElement();
  });
});
