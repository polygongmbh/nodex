import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import type { Channel, Relay, TaskCreatePayload, TaskCreateResult } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { getComposerPrimaryAction, getTaskComposerInput } from "@/test/ui";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import { makeTask } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" }, createHttpAuthHeader: vi.fn(async () => null) }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const, result: { ok: true as const } },
}));
const createTaskMock = vi.fn(
  async (_payload: TaskCreatePayload): Promise<TaskCreateResult> => ({ ok: true })
);

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("@/features/feed-page/controllers/feed-task-commands-context", () => ({
  useFeedTaskCommands: () => ({ createTask: createTaskMock }),
}));

const relays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  isActive: true,
  connectionStatus: "connected",
}];
const singleInactiveRelay: Relay[] = [{
  id: "relay-a",
  name: "Relay A",
  url: "wss://relay-a.example.com",
  isActive: false,
  connectionStatus: "connected",
}];
const multiRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    isActive: true,
    connectionStatus: "connected",
  },
];
const mixedRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    isActive: true,
    connectionStatus: "read-only",
  },
];

const channels: Channel[] = [{ id: "backend", name: "backend", filterState: "neutral" }];
const people: SelectablePerson[] = [];

function renderCreateComposer({
  feedRelays = relays,
  tasks = [],
  allTasks = tasks,
  ...props
}: Partial<ComponentProps<typeof TaskCreateComposer>> & {
  feedRelays?: Relay[];
  tasks?: ReturnType<typeof makeTask>[];
  allTasks?: ReturnType<typeof makeTask>[];
} = {}) {
  for (const post of allTasks) {
    ingestPost({ post });
  }
  return render(
    <FeedSurfaceProvider
      value={{
        relays: feedRelays,
        channels,
        people,
        searchQuery: "",
        quickFilters: makeQuickFilterState(),
        channelMatchMode: "and",
      }}
    >
      <TaskCreateComposer onCancel={() => {}} focusedTaskId={null} {...props} />
    </FeedSurfaceProvider>
  );
}

describe("TaskCreateComposer", () => {
  beforeEach(() => {
    dispatchFeedInteraction.mockClear();
    createTaskMock.mockClear();
    createTaskMock.mockImplementation(async () => ({ ok: true }));
    localStorage.clear();
  });

  afterEach(() => {
    __resetPostsStoreForTests();
  });

  it("dispatches task.create with caller-supplied onSubmit and closes on success", async () => {
    const onCancel = vi.fn();

    function Wrapper() {
      const submit = useComposerSubmitHandler({
        focusedTaskId: "parent-task",
        initialState: { status: "active" },
        closeOnSuccess: true,
        onCancel,
      });
      return (
        <FeedSurfaceProvider
          value={{
            relays,
            channels,
            people,
            searchQuery: "",
            quickFilters: makeQuickFilterState(),
            channelMatchMode: "and",
          }}
        >
          <TaskCreateComposer
            onCancel={onCancel}
            onSubmit={submit}
            focusedTaskId="parent-task"
            allowedPostTypes={["task"]}
          />
        </FeedSurfaceProvider>
      );
    }

    render(<Wrapper />);

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
        expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Ship #backend",
          focusedTaskId: "parent-task",
          initialState: { status: "active" },
        })
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the focused task title in the composer placeholder", () => {
    const parentTask = makeTask({
      id: "parent-task",
      content: "Parent #planning task for @alice",
    });

    renderCreateComposer({
      focusedTaskId: "parent-task",
      allTasks: [parentTask],
      allowedPostTypes: ["task"],
    });

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Parent planning task for")
    );
    expect(screen.getByRole("textbox")).not.toHaveAttribute(
      "placeholder",
      expect.stringContaining("#planning")
    );
    expect(screen.getByRole("textbox")).not.toHaveAttribute(
      "placeholder",
      expect.stringContaining("@alice")
    );
  });

  it("restores the shared draft by default", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "Persisted #backend",
      postType: "comment",
      savedAt: new Date().toISOString(),
    }));

    renderCreateComposer();

    expect(screen.getByRole("textbox")).toHaveValue("Persisted #backend");
    expect(screen.getByTestId("composer-primary-action")).toBeInTheDocument();
  });

  it("does not render the composer when the parent only lives on read-only relays", () => {
    const readOnlyRelays: Relay[] = [{
      id: "relay-a",
      name: "Relay A",
      url: "wss://relay-a.example.com",
      isActive: true,
      connectionStatus: "read-only",
    }];
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
    });

    const { container } = renderCreateComposer({
      feedRelays: readOnlyRelays,
      allTasks: [parentTask],
      focusedTaskId: "parent-task",
    });

    expect(container).toBeEmptyDOMElement();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("blocks root task creation when more than one writable relay is active", () => {
    renderCreateComposer({ feedRelays: multiRelays });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("allows root task creation when exactly one writable relay is active", async () => {
    renderCreateComposer({ feedRelays: mixedRelays });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Ship #backend",
        tags: ["backend"],
        postType: "task",
        relays: ["relay-a"],
      }));
    });
  });

  it("allows root task creation when no relay is selected but exactly one writable relay exists", async () => {
    renderCreateComposer({ feedRelays: singleInactiveRelay });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Ship #backend",
        tags: ["backend"],
        postType: "task",
        relays: ["relay-a"],
      }));
    });
  });

  it("inherits parent tags as explicit chips when focused on desktop", async () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
      tags: ["general"],
    });

    renderCreateComposer({
      feedRelays: multiRelays,
      allTasks: [parentTask],
      focusedTaskId: "parent-task",
    });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Follow-up update for this thread" },
    });

    expect(
      screen.getByRole("button", { name: /general/i })
    ).toHaveAttribute("data-chip-kind", "hashtag");

    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Follow-up update for this thread",
        tags: ["general"],
        focusedTaskId: "parent-task",
      }));
    });
  });

  it("merges inherited parent tags with content-parsed tags on desktop", async () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
      tags: ["general"],
    });

    renderCreateComposer({
      feedRelays: multiRelays,
      allTasks: [parentTask],
      focusedTaskId: "parent-task",
    });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Follow-up #backend" },
    });
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      const payload = createTaskMock.mock.calls.at(-1)?.[0];
      expect(payload).toBeDefined();
      expect(payload?.tags).toEqual(expect.arrayContaining(["general", "backend"]));
    });
  });

  it("drops inherited parent tag chip after manual removal", async () => {
    const parentTask = makeTask({
      id: "parent-task",
      relays: ["relay-a"],
      tags: ["general"],
    });

    renderCreateComposer({
      feedRelays: multiRelays,
      allTasks: [parentTask],
      focusedTaskId: "parent-task",
    });

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Follow-up update for this thread" },
    });

    const inheritedChip = screen.getByRole("button", { name: /general/i });
    fireEvent.click(inheritedChip);
    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Follow-up update for this thread",
        tags: [],
        focusedTaskId: "parent-task",
      }));
    });
  });

  it("submits comments with only the writable relay subset", async () => {
    renderCreateComposer({ feedRelays: mixedRelays });

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Looks good #backend" },
    });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Looks good #backend",
        tags: ["backend"],
        postType: "comment",
        relays: ["relay-a"],
      }));
    });
  });

  it("allows focused comment submit with multiple writable relays and no single selected space", async () => {
    const parentTask = makeTask({ id: "parent-task", relays: ["relay-a"] });

    renderCreateComposer({
      feedRelays: multiRelays,
      allTasks: [parentTask],
      focusedTaskId: "parent-task",
      allowedPostTypes: ["task", "comment"],
    });

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Great progress" },
    });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        content: "Great progress",
        postType: "comment",
        focusedTaskId: "parent-task",
      }));
    });
  });

  it("uses the current relay selection at submit time, not the one captured at mount", async () => {
    function RelaySwappingWrapper() {
      const [activeRelayId, setActiveRelayId] = useState("relay-a");
      const relaysWithSelection: Relay[] = [
        {
          id: "relay-a",
          name: "Relay A",
          url: "wss://relay-a.example.com",
          isActive: activeRelayId === "relay-a",
          connectionStatus: "connected",
        },
        {
          id: "relay-b",
          name: "Relay B",
          url: "wss://relay-b.example.com",
          isActive: activeRelayId === "relay-b",
          connectionStatus: "connected",
        },
      ];
      return (
        <FeedSurfaceProvider value={{ relays: relaysWithSelection, channels, people, searchQuery: "", quickFilters: makeQuickFilterState(), channelMatchMode: "and" }}>
          <button onClick={() => setActiveRelayId("relay-b")}>Switch to Relay B</button>
          <TaskCreateComposer onCancel={() => {}} focusedTaskId={null} allowedPostTypes={["task"]} />
        </FeedSurfaceProvider>
      );
    }

    render(<RelaySwappingWrapper />);

    fireEvent.change(getTaskComposerInput(), { target: { value: "Ship #backend" } });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /switch to relay b/i }));
    });

    fireEvent.click(getComposerPrimaryAction());

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        relays: ["relay-b"],
      }));
    });
  });
});
