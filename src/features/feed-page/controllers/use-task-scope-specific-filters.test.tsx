import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMemo, useRef, useState } from "react";
import { makePerson } from "@/test/fixtures";
import { makeFilterSnapshot } from "@/test/filter-state";
import type { Channel, ChannelMatchMode } from "@/types";
import type { SelectablePerson } from "@/types/person";
import {
  TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS,
  useTaskScopeSpecificFilters,
} from "./use-task-scope-specific-filters";

const peopleSeed: SelectablePerson[] = [
  makePerson({ pubkey: "alice", name: "alice", displayName: "Alice", isSelected: true }),
  makePerson({ pubkey: "bob", name: "bob", displayName: "Bob", isSelected: false }),
];

function Harness({
  initialFocusedTaskId = null,
  restoreTimeoutMs = TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS,
  shouldRestoreSnapshot,
}: {
  initialFocusedTaskId?: string | null;
  restoreTimeoutMs?: number;
  shouldRestoreSnapshot?: Parameters<typeof useTaskScopeSpecificFilters>[0]["shouldRestoreSnapshot"];
}) {
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(initialFocusedTaskId);
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    new Map([
      ["general", "included"],
      ["ops", "excluded"],
    ])
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>("or");
  const [people, setPeople] = useState<SelectablePerson[]>(peopleSeed);
  const nowRef = useRef(0);

  const currentFilterSnapshot = useMemo(
    () =>
      makeFilterSnapshot({
        channelStates: Object.fromEntries(
          Array.from(channelFilterStates.entries()).filter(([, state]) => state === "included" || state === "excluded")
        ) as Record<string, "included" | "excluded">,
        selectedPeopleIds: people.filter((person) => person.isSelected).map((person) => person.pubkey).sort(),
        channelMatchMode,
      }),
    [channelFilterStates, channelMatchMode, people]
  );

  const { discardTaskScopeFilterRestore } = useTaskScopeSpecificFilters({
    focusedTaskId,
    currentFilterSnapshot,
    shouldRestoreSnapshot,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
    restoreTimeoutMs,
    now: () => nowRef.current,
  });

  return (
    <>
      <button onClick={() => setFocusedTaskId("task-1")}>FocusOne</button>
      <button onClick={() => setFocusedTaskId("task-2")}>FocusTwo</button>
      <button onClick={() => setFocusedTaskId(null)}>Unfocus</button>
      <button onClick={() => { nowRef.current = restoreTimeoutMs + 1; }}>AdvancePastTimeout</button>
      <button
        onClick={() => {
          setChannelFilterStates(new Map([["ops", "included"]]));
          setChannelMatchMode("and");
          setPeople((previous) => previous.map((person) => ({ ...person, isSelected: person.pubkey === "bob" })));
        }}
      >
        MutateWhileScoped
      </button>
      <button onClick={discardTaskScopeFilterRestore}>DiscardRestore</button>
      <output data-testid="focused-task">{focusedTaskId ?? "null"}</output>
      <output data-testid="channel-general">{channelFilterStates.get("general") || "neutral"}</output>
      <output data-testid="channel-ops">{channelFilterStates.get("ops") || "neutral"}</output>
      <output data-testid="match-mode">{channelMatchMode}</output>
      <output data-testid="selected-people">
        {people.filter((person) => person.isSelected).map((person) => person.pubkey).join(",")}
      </output>
    </>
  );
}

describe("useTaskScopeSpecificFilters", () => {
  it("clears channel, people, and match-mode filters when entering task scope", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));

    expect(screen.getByTestId("focused-task")).toHaveTextContent("task-1");
    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("neutral");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("restores the previous filters when returning to all tasks before the timeout", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("excluded");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("or");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
  });

  it("keeps the all-tasks view unfiltered when returning after the timeout", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "AdvancePastTimeout" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("neutral");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("keeps the original snapshot when moving between focused tasks", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "FocusTwo" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("excluded");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("or");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
  });

  it("keeps user-selected filters when returning to all tasks with active channel or people filters", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "MutateWhileScoped" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("included");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("bob");
  });

  it("still restores the previous match mode when no channel or people filters are selected", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("match-mode")).toHaveTextContent("or");
  });

  it("does not restore the previous filters when they no longer match any all-task results", () => {
    render(<Harness restoreTimeoutMs={1000} shouldRestoreSnapshot={() => false} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("neutral");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("can discard the pending restore for explicit reset flows", () => {
    render(<Harness restoreTimeoutMs={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "FocusOne" }));
    fireEvent.click(screen.getByRole("button", { name: "DiscardRestore" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("neutral");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");
  });

  it("also suspends filters when the page loads directly into a focused task", () => {
    render(<Harness initialFocusedTaskId="task-1" restoreTimeoutMs={1000} />);

    expect(screen.getByTestId("channel-general")).toHaveTextContent("neutral");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("neutral");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("and");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Unfocus" }));

    expect(screen.getByTestId("channel-general")).toHaveTextContent("included");
    expect(screen.getByTestId("channel-ops")).toHaveTextContent("excluded");
    expect(screen.getByTestId("match-mode")).toHaveTextContent("or");
    expect(screen.getByTestId("selected-people")).toHaveTextContent("alice");
  });
});
