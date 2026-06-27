import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useFeedNavigation } from "./use-feed-navigation";
import type { Relay, Post } from "@/types";
import { makeTask } from "@/test/fixtures";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

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
const NO_TASKS: Post[] = [];
const EMPTY_RELAY_IDS = new Set<string>();

function Harness({
  allTasks = NO_TASKS,
  isMobile = false,
  effectiveActiveRelayIds = EMPTY_RELAY_IDS,
  relays = NO_RELAYS,
  // Default to hydrating so unrelated existing tests can use synthetic task IDs
  // without tripping the post-not-found cleanup effect.
  isHydrating = true,
}: Partial<Parameters<typeof useFeedNavigation>[0]>) {
  const nav = useFeedNavigation({
    allTasks,
    isMobile,
    effectiveActiveRelayIds,
    relays,
    isHydrating,
  });

  const location = useLocation();

  return (
    <>
      <output data-testid="current-view">{nav.currentView}</output>
      <output data-testid="focused-task-id">{nav.focusedTaskId ?? "null"}</output>
      <output data-testid="pathname">{location.pathname}</output>
      <button onClick={() => nav.setCurrentView("tree")}>go-tree</button>
      <button onClick={() => nav.setCurrentView("kanban")}>go-kanban</button>
      <button onClick={() => nav.setCurrentView("calendar")}>go-calendar</button>
      <button onClick={() => nav.setFocusedTaskId("task-abc")}>focus-task</button>
      <button onClick={() => nav.setFocusedTaskId(null)}>unfocus-task</button>
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

  it("defaults currentView to the desktop default for unknown URL views", () => {
    renderAt("/bogus");
    expect(screen.getByTestId("current-view")).toHaveTextContent("home");
  });

  it("defaults currentView to the desktop default at root path", () => {
    renderAt("/");
    expect(screen.getByTestId("current-view")).toHaveTextContent("home");
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

  it("falls back to the default view for an unknown view slug", () => {
    renderAt("/manage");
    // "manage" is no longer a route; an unknown slug resolves to the default.
    expect(screen.getByTestId("current-view")).toHaveTextContent("home");
  });

  it("does not clear an unknown focused task while still hydrating", () => {
    vi.mocked(toast).mockClear();
    renderAt("/feed/unknown-task", { isHydrating: true });
    expect(screen.getByTestId("focused-task-id")).toHaveTextContent("unknown-task");
    expect(toast).not.toHaveBeenCalled();
  });

  it("clears focusedTaskId and toasts when the focused task is not found after hydration", async () => {
    vi.mocked(toast).mockClear();
    renderAt("/feed/missing-task-id-1234567890", { isHydrating: false });
    await waitFor(() => {
      expect(screen.getByTestId("focused-task-id")).toHaveTextContent("null");
      expect(screen.getByTestId("pathname")).toHaveTextContent("/feed");
    });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toContain("missing-");
  });

  it("clears focusedTaskId when focused task leaves relay scope", () => {
    const task = makeTask({
      id: "task-scoped",
      content: "test task",
      relays: ["relay-a"],
      author: { pubkey: "pubkey-1", name: "Author", displayName: "Author" },
    });

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
