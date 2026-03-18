import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import { makeChannel, makePerson, makeTask } from "@/test/fixtures";
import type { Channel, Task } from "@/types";

function Harness({
  allTasks,
  tasks,
  channels,
}: {
  allTasks: Task[];
  tasks: Task[];
  channels: Channel[];
}) {
  const filtered = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId: null,
    searchQuery: "",
    people: [makePerson()],
    channels,
    channelMatchMode: "and",
    taskPredicate: (task) => task.taskType === "task",
  });

  return <output data-testid="filtered-task-ids">{filtered.map((task) => task.id).join(",")}</output>;
}

describe("useTaskViewFiltering", () => {
  it("ignores included channels that do not exist in the active relay-scoped tasks", () => {
    const generalTask = makeTask({ id: "general-task", tags: ["general"], content: "General task #general" });
    const opsTask = makeTask({ id: "ops-task", tags: ["ops"], content: "Ops task #ops" });

    render(
      <Harness
        allTasks={[generalTask, opsTask]}
        tasks={[generalTask]}
        channels={[
          makeChannel({ id: "ops", name: "ops", filterState: "included" }),
          makeChannel({ id: "general", name: "general", filterState: "neutral" }),
        ]}
      />
    );

    expect(screen.getByTestId("filtered-task-ids")).toHaveTextContent("general-task");
  });
});
