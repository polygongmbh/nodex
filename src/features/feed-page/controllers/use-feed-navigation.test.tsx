import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useFeedNavigation } from "./use-feed-navigation";
import type { Relay, Task } from "@/types";

vi.mock("@/hooks/use-swipe-navigation", () => ({
  useSwipeNavigation: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onWheel: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

const NO_RELAYS: Relay[] = [];
const NO_TASKS: Task[] = [];
const EMPTY_RELAY_IDS = new Set<string>();

function Harness({
  allTasks = NO_TASKS,
  isMobile = false,
  effectiveActiveRelayIds = EMPTY_RELAY_IDS,
  relays = NO_RELAYS,
}: Partial<Parameters<typeof useFeedNavigation>[0]>) {
  const nav = useFeedNavigation({ allTasks, isMobile, effectiveActiveRelayIds, relays });

  return (
    <>
      <output data-testid="current-view">{nav.currentView}</output>
      <output data-testid="focused-task-id">{nav.focusedTaskId ?? "null"}</output>
      <output data-testid="is-manage">{String(nav.isManageRouteActive)}</output>
      <button onClick={() => nav.setCurrentView("tree")}>go-tree</button>
      <button onClick={() => nav.setCurrentView("kanban")}>go-kanban</button>
      <button onClick={() => nav.setCurrentView("calendar")}>go-calendar</button>
      <button onClick={() => nav.setFocusedTaskId("task-abc")}>focus-task</button>
      <button onClick={() => nav.setFocusedTaskId(null)}>unfocus-task</button>
      <button onClick={() => nav.setManageRouteActive(true)}>open-manage</button>
      <button onClick={() => nav.setManageRouteActive(false)}>close-manage</button>
    </>
  );
}

function renderAt(path: string, props: Partial<Parameters<typeof useFeedNavigation>[0]> = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:view" element={<Harness {...props} />} />
        <Route path="/:view/:taskId" element={<Harness {...props} />} />
        <Route path="/" element={<Harness {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("useFeedNavigation", () => {
  it("derives currentView from URL", () => {
    renderAt("/kanban");
    expect(screen.getByTestId("current-view")).toHaveTextContent("kanban");
  });

  it("defaults currentView to feed for unknown URL views", () => {
    renderAt("/bogus");
    expect(screen.getByTestId("current-view")).toHaveTextContent("feed");
  });

  it("defaults currentView to feed at root path", () => {
    renderAt("/");
    expect(screen.getByTestId("current-view")).toHaveTextContent("feed");
  });

  it("derives focusedTaskId from URL", () => {
    renderAt("/feed/task-123");
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("task-123");
  });

  it("focusedTaskId is null when no taskId in URL", () => {
    renderAt("/feed");
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("null");
  });

  it("setCurrentView navigates to /<view> without a focused task", () => {
    renderAt("/feed");
    act(() => screen.getByRole("button", { name: "go-kanban" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("kanban");
  });

  it("setCurrentView preserves taskId in the URL when a task is focused", () => {
    renderAt("/feed/task-abc");
    act(() => screen.getByRole("button", { name: "go-kanban" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("kanban");
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("task-abc");
  });

  it("setFocusedTaskId navigates to /<view>/<taskId>", () => {
    renderAt("/list");
    act(() => screen.getByRole("button", { name: "focus-task" }).click());
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("task-abc");
    expect(screen.getByTestId("current-view")).toHaveTextContent("list");
  });

  it("setFocusedTaskId(null) navigates to /<view>", () => {
    renderAt("/list/task-abc");
    act(() => screen.getByRole("button", { name: "unfocus-task" }).click());
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("null");
    expect(screen.getByTestId("current-view")).toHaveTextContent("list");
  });

  it("setManageRouteActive(true) navigates to /manage", () => {
    renderAt("/feed");
    act(() => screen.getByRole("button", { name: "open-manage" }).click());
    expect(screen.getByTestId("is-manage")).toHaveTextContent("true");
  });

  it("setManageRouteActive(false) returns to current view", () => {
    renderAt("/manage");
    // After toggling off manage, we expect to be back on the default view.
    act(() => screen.getByRole("button", { name: "close-manage" }).click());
    expect(screen.getByTestId("is-manage")).toHaveTextContent("false");
  });

  it("preserves the last non-manage view while the manage route is active", () => {
    renderAt("/tree");

    act(() => screen.getByRole("button", { name: "open-manage" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("tree");
    expect(screen.getByTestId("is-manage")).toHaveTextContent("true");

    act(() => screen.getByRole("button", { name: "close-manage" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("tree");
    expect(screen.getByTestId("is-manage")).toHaveTextContent("false");
  });

  it("switches directly to the chosen view from manage instead of falling back to feed", () => {
    renderAt("/list");

    act(() => screen.getByRole("button", { name: "open-manage" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("list");

    act(() => screen.getByRole("button", { name: "go-calendar" }).click());
    expect(screen.getByTestId("current-view")).toHaveTextContent("calendar");
    expect(screen.getByTestId("is-manage")).toHaveTextContent("false");
  });

  it("clears focusedTaskId when focused task leaves relay scope", () => {
    const task: Task = {
      id: "task-scoped",
      content: "test task",
      status: "todo",
      timestamp: new Date(),
      tags: [],
      relays: ["relay-a"],
      relayIds: ["relay-a"],
      author: { id: "pubkey-1", name: "Author" },
      taskType: "task",
    } as unknown as Task;

    const relay: Relay = {
      id: "relay-b",
      name: "Relay B",
      isActive: true,
      connectionStatus: "connected",
      url: "wss://relay.b",
    };

    // Task is on relay-a but only relay-b is active → task is outside scope
    renderAt("/feed/task-scoped", {
      allTasks: [task],
      relays: [relay],
      effectiveActiveRelayIds: new Set(["relay-b"]),
    });

    // The effect should fire and clear the focused task
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("null");
  });
});
