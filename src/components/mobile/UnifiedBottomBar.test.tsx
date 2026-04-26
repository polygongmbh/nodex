import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type Dispatch, type SetStateAction } from "react";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import type { Channel, Relay, TaskCreateResult } from "@/types";
import type { Person } from "@/types/person";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";
import { DEFAULT_GEOHASH_PRECISION, encodeGeohash } from "@/infrastructure/nostr/geohash-location";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import {
  getMobileCommentAction,
  getMobilePrimaryAction,
  getMobileSubmitBlockPanel,
  openMobileComposeOptions,
} from "@/test/ui";
import { makeTask } from "@/test/fixtures";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { FeedTaskViewModelProvider } from "@/features/feed-page/views/feed-task-view-model-context";
import { makeQuickFilterState } from "@/test/quick-filter-state";

const successResult: TaskCreateResult = { ok: true, mode: "local" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({
    createHttpAuthHeader: vi.fn(async () => null),
  }),
}));

const buildDispatchEvent = (intent: FeedInteractionIntent, result: TaskCreateResult = successResult) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const, result },
});

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => buildDispatchEvent(intent));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", isActive: true, url: "wss://demo.test" },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const autocompleteChannels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
  { id: "growth", name: "growth", filterState: "neutral" },
  { id: "ops", name: "ops", filterState: "neutral" },
];

const people: Person[] = [
  {
    id: "e".repeat(64),
    name: "alice",
    displayName: "Alice",
    nip05: "alice@example.com",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

const attachmentUploadEnabledSpy = vi.spyOn(attachmentUpload, "isAttachmentUploadConfigured");
const originalGeolocation = navigator.geolocation;
type TaskCreateIntent = Extract<FeedInteractionIntent, { type: "task.create" }>;

function getTaskCreateCalls() {
  return dispatchFeedInteraction.mock.calls
    .map(([intent]) => intent as FeedInteractionIntent)
    .filter((intent): intent is Extract<FeedInteractionIntent, { type: "task.create" }> => intent.type === "task.create");
}

function expectLatestTaskCreateCall(expected: Partial<TaskCreateIntent>) {
  expect(getTaskCreateCalls().at(-1)).toEqual(expect.objectContaining(expected));
}

function createPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

describe("UnifiedBottomBar auth gating", () => {
  beforeEach(() => {
    dispatchFeedInteraction.mockReset();
    dispatchFeedInteraction.mockImplementation(async (intent: FeedInteractionIntent) => buildDispatchEvent(intent));
    attachmentUploadEnabledSpy.mockReturnValue(true);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });
  });

  it("shows a single attachment action", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(screen.getByRole("button", { name: /add attachment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image attachment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add file attachment/i })).not.toBeInTheDocument();
  });

  it("focuses the unified composer on mount", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  it("builds the mobile placeholder from shared context and filters", () => {
    render(
      <FeedTaskViewModelProvider
        value={{
          tasks: [],
          allTasks: [makeTask({ id: "focused-task", content: "Coordinate launch copy" })],
          focusedTaskId: "focused-task",
        }}
      >
        <UnifiedBottomBar
          searchQuery=""
          currentView="tree"
          focusedTaskId="focused-task"
          relays={relays}
          channels={[
            { id: "general", name: "general", filterState: "included" },
          ]}
          people={[
            {
              ...people[0],
              isSelected: true,
            },
          ]}
          canCreateContent={true}
        />
      </FeedTaskViewModelProvider>
    );

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      'Find and create posts under "Coordinate launch copy" in #general mentioning @Alice...'
    );
  });

  it("uses shared visible people in the selector and prefers display names over usernames", () => {
    render(
      <FeedSurfaceProvider
        value={{
          relays,
          channels,
          visibleChannels: channels,
          composeChannels: channels,
          people: [
            {
              id: "broad-person",
              name: "broad-user",
              displayName: "Broad Person",
              avatar: "",
              isOnline: false,
              isSelected: false,
            },
          ],
          visiblePeople: [
            {
              id: "visible-person",
              name: "visible-user",
              displayName: "Visible Person",
              avatar: "",
              isOnline: true,
              isSelected: false,
            },
          ],
          searchQuery: "",
          quickFilters: makeQuickFilterState(),
          channelMatchMode: "and",
        }}
      >
        <UnifiedBottomBar
          searchQuery=""
          currentView="feed"
          relays={relays}
          channels={channels}
          canCreateContent={true}
        />
      </FeedSurfaceProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "People" }));

    expect(screen.getByRole("button", { name: /visible person/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /visible-user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /broad person/i })).not.toBeInTheDocument();
  });

  it("routes signed-out create attempts through task.create dispatch", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={false}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(getTaskCreateCalls()).toHaveLength(1);
  });

  it("disables the mobile primary send button when the textbox is actually empty", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const button = getMobilePrimaryAction();
    expect(button).toBeDisabled();
  });

  it("searches as user types in combined field", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "hello #general" } });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "hello #general",
    });
  });

  it("grows the mobile compose box with content until half the viewport height", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(field, "scrollHeight", {
      configurable: true,
      get: () => 520,
    });

    fireEvent.change(field, { target: { value: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6" } });

    expect(field.style.height).toBe("400px");
    expect(field.style.maxHeight).toBe("400px");
    expect(field.style.overflowY).toBe("auto");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
  });

  it("shows a blocker panel and opens channel remediation when sending without a selected channel tag", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship update" } });
    openMobileComposeOptions();

    const blockPanel = getMobileSubmitBlockPanel();
    expect(blockPanel).toHaveTextContent("Can't post yet");
    expect(blockPanel).toHaveTextContent("Add or select at least one #channel");
    expect(screen.getByRole("button", { name: "#general" })).toBeInTheDocument();
    expect(getTaskCreateCalls()).toHaveLength(0);
  });

  it("shows the blocker CTA when content has only tags and mentions", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "#general @alice@example.com" } });
    const sendButton = getMobilePrimaryAction();
    expect(sendButton).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getTaskCreateCalls()).toHaveLength(0);
  });

  it("keeps focus and preserves date and priority after mobile submit", async () => {
    const dueDate = new Date("2026-03-19T00:00:00.000Z");

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="calendar"
        defaultContent="Ship #general"
        selectedCalendarDate={dueDate}
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^create task$/i }));

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(field).toHaveFocus();
    expect(screen.getByText(format(dueDate, "MMM d"))).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toHaveValue("2");
  });

  it("opens relay selection when task posting is blocked by multiple active feeds", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        relays={[
          { id: "relay-one", name: "Relay One", isActive: true, url: "wss://relay-one.test" },
          { id: "relay-two", name: "Relay Two", isActive: true, url: "wss://relay-two.test" },
        ]}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(getMobilePrimaryAction());

    expect(screen.getByRole("button", { name: /relay one/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /relay two/i })).toBeInTheDocument();
    expect(getTaskCreateCalls()).toHaveLength(0);
  });

  it("uses toast feedback instead of an inline alert while attachments are uploading", () => {
    const toastInfoSpy = vi.spyOn(toast, "info").mockImplementation(() => "");

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
        composeRestoreRequest={{
          id: 3,
          state: {
            content: "Ship #general",
            taskType: "task",
            explicitTagNames: [],
            explicitMentionPubkeys: [],
            attachments: [
              {
                id: "upload-1",
                fileName: "diagram.png",
                url: "https://example.test/diagram.png",
                status: "uploading",
                source: "upload",
              },
            ],
          },
        }}
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(getMobilePrimaryAction());

    expect(toastInfoSpy).toHaveBeenCalledWith(expect.any(String), { id: "task-composer-uploading-blocked" });
    expect(getTaskCreateCalls()).toHaveLength(0);
  });

  it("submits a root task when exactly one active relay is writable", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        relays={[
          { id: "relay-one", name: "Relay One", isActive: true, connectionStatus: "connected", url: "wss://relay-one.test" },
          { id: "relay-two", name: "Relay Two", isActive: true, connectionStatus: "read-only", url: "wss://relay-two.test" },
        ]}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(getMobilePrimaryAction());

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["relay-one"],
      taskType: "task",
    });
  });

  it("submits a root task when no relay is selected but exactly one writable relay exists", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        relays={[
          { id: "relay-one", name: "Relay One", isActive: false, connectionStatus: "connected", url: "wss://relay-one.test" },
        ]}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(getMobilePrimaryAction());

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["relay-one"],
      taskType: "task",
    });
  });

  it("allows focused-subtask send without explicit tags", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        focusedTaskId="parent-task"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Follow-up details for parent task" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Follow-up details for parent task",
      tags: [],
      relays: ["demo"],
      taskType: "task",
      focusedTaskId: "parent-task",
    });
  });

  it("keeps compose text when submit returns a failure result", async () => {
    dispatchFeedInteraction.mockImplementation(async (intent: FeedInteractionIntent) =>
      buildDispatchEvent(intent, { ok: false as const, reason: "relay-selection" as const })
    );
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expect(field.value).toBe("Ship #general");
  });

  it("submits as comment on Alt+Enter when no hashtag token is being typed", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general now" } });

    fireEvent.keyDown(composeField, { key: "Enter", altKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general now",
      tags: ["general"],
      relays: ["demo"],
      taskType: "comment",
    });
  });

  it("submits current kind on Ctrl+Enter and Cmd+Enter", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general" } });

    fireEvent.keyDown(composeField, { key: "Enter", ctrlKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
    });

    fireEvent.change(composeField, { target: { value: "Ship again #general" } });
    fireEvent.keyDown(composeField, { key: "Enter", metaKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship again #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
    });
  });

  it("submits comment when add comment button is tapped", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Reply #general" } });
    openMobileComposeOptions();
    fireEvent.click(getMobileCommentAction());

    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Reply #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "comment",
    });
  });

  it("shows offer/request options in feed view and submits listing metadata", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Need help #general" } });
    openMobileComposeOptions();

    expect(screen.getByRole("button", { name: /post offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post request/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /post request/i }));
    await waitFor(() => expect(getTaskCreateCalls()).toHaveLength(1));

    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Need help #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "request",
      nip99: {
        title: "Need help",
        status: "active",
      },
    });
  });

  it("does not offer comment send options in tree view without a focused parent", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        focusedTaskId={null}
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(getMobilePrimaryAction()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add comment$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add comment$/i })).not.toBeInTheDocument();
  });

  it("reveals task and comment send options in tree view when a focused parent exists", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        focusedTaskId="parent-1"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(getMobilePrimaryAction()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create task$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add comment$/i })).not.toBeInTheDocument();

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Reply #general" } });
    openMobileComposeOptions();
    expect(getMobileCommentAction()).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^create task$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add comment$/i })).toBeInTheDocument();
  });

  it("hides comment send button in non-feed/tree views", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="calendar"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(screen.getByRole("button", { name: /create task/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add comment/i })).not.toBeInTheDocument();
  });

  it("prefills due date with today in calendar view", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="calendar"
        defaultContent="Ship #general"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(screen.getByText(format(new Date(), "MMM d"))).toBeInTheDocument();
    expect(screen.getByLabelText(/date type/i)).toBeInTheDocument();
  });

  it("updates due date when selected calendar date changes", () => {
    const nextDay = addDays(new Date(), 1);
    const { rerender } = render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="calendar"
        defaultContent="Ship #general"
        selectedCalendarDate={new Date()}
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    rerender(
      <UnifiedBottomBar
        searchQuery=""
        currentView="calendar"
        defaultContent="Ship #general"
        selectedCalendarDate={nextDay}
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(screen.getByText(format(nextDay, "MMM d"))).toBeInTheDocument();
  });

  it("hides date type until a due date is selected", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    expect(screen.queryByLabelText(/date type/i)).not.toBeInTheDocument();
  });

  it("syncs channel filters when hashtags are completed or removed", () => {
    const toggleCalls: string[] = [];
    const setChannelsRef: { current: Dispatch<SetStateAction<Channel[]>> | null } = { current: null };

    dispatchFeedInteraction.mockImplementation(async (intent: FeedInteractionIntent) => {
      if (intent.type === "sidebar.channel.toggle") {
        toggleCalls.push(intent.channelId);
        setChannelsRef.current?.((previous) =>
          previous.map((channel) => {
            if (channel.id !== intent.channelId) return channel;
            if (channel.filterState === "neutral") return { ...channel, filterState: "included" };
            if (channel.filterState === "included") return { ...channel, filterState: "excluded" };
            return { ...channel, filterState: "neutral" };
          })
        );
      }
      return buildDispatchEvent(intent);
    });

    const StatefulBar = () => {
      const [statefulChannels, setStatefulChannels] = useState<Channel[]>([
        { id: "general", name: "general", filterState: "neutral" },
      ]);
      setChannelsRef.current = setStatefulChannels;

      return (
        <UnifiedBottomBar
          searchQuery=""
          currentView="feed"
          relays={relays}
          channels={statefulChannels}
          people={people}
          canCreateContent={true}
        />
      );
    };

    render(<StatefulBar />);

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general " } });
    expect(toggleCalls).toEqual(["general"]);

    fireEvent.change(composeField, { target: { value: "Ship " } });
    expect(toggleCalls).toEqual(["general", "general", "general"]);
  });

  it("does not touch unrelated channel filters when editing specific hashtags", () => {
    const toggleCalls: string[] = [];
    const setChannelsRef: { current: Dispatch<SetStateAction<Channel[]>> | null } = { current: null };

    dispatchFeedInteraction.mockImplementation(async (intent: FeedInteractionIntent) => {
      if (intent.type === "sidebar.channel.toggle") {
        toggleCalls.push(intent.channelId);
        setChannelsRef.current?.((previous) =>
          previous.map((channel) => {
            if (channel.id !== intent.channelId) return channel;
            if (channel.filterState === "neutral") return { ...channel, filterState: "included" };
            if (channel.filterState === "included") return { ...channel, filterState: "excluded" };
            return { ...channel, filterState: "neutral" };
          })
        );
      }
      return buildDispatchEvent(intent);
    });

    const StatefulBar = () => {
      const [statefulChannels, setStatefulChannels] = useState<Channel[]>([
        { id: "general", name: "general", filterState: "neutral" },
        { id: "ops", name: "ops", filterState: "excluded" },
      ]);
      setChannelsRef.current = setStatefulChannels;

      return (
        <UnifiedBottomBar
          searchQuery=""
          currentView="feed"
          relays={relays}
          channels={statefulChannels}
          people={people}
          canCreateContent={true}
        />
      );
    };

    render(<StatefulBar />);

    const composeField = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general " } });
    fireEvent.change(composeField, { target: { value: "Ship " } });

    expect(toggleCalls).toEqual(["general", "general", "general"]);
    expect(toggleCalls).not.toContain("ops");
  });

  it("supports @mention autocomplete in the combined search/compose field", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "ping @al", selectionStart: 8 } });

    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.keyDown(field, { key: "Enter" });

    expect(field.value).toBe("ping @alice@example.com ");
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "ping @alice@example.com ",
    });
  });

  it("anchors mobile mention autocomplete above the composer", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "ping @al", selectionStart: 8 } });

    const panel = screen.getByTestId("mobile-autocomplete-panel");
    // The mobile composer is bottom-docked, so suggestions must open upward to stay usable.
    expect(panel.className).toContain("bottom-full");
  });

  it("supports #channel autocomplete in the combined search/compose field", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={autocompleteChannels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #ge", selectionStart: 8 } });

    expect(screen.getByText("general")).toBeInTheDocument();

    fireEvent.keyDown(field, { key: "Enter" });

    expect(field.value).toBe("Ship #general ");
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "Ship #general ",
    });
  });

  it("closes mention autocomplete when compose is cancelled", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "ping @al", selectionStart: 8 } });
    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear compose/i }));
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it("closes hashtag autocomplete on escape", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={autocompleteChannels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #ge", selectionStart: 8 } });
    expect(screen.getByText("general")).toBeInTheDocument();

    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByText("general")).not.toBeInTheDocument();
  });

  it("adds mention tag via Alt+Enter without inserting mention text", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general @al", selectionStart: 16 } });

    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    await waitFor(() => {
      expect(field.value).toBe("Ship #general ");
    });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "Ship #general ",
    });

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general ",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
      explicitMentionPubkeys: ["e".repeat(64)],
    });
  });

  it("uses Alt+Click on mention autocomplete option to add mention tag-only", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general @al", selectionStart: 16 } });

    const mentionOption = screen.getByText("@alice").closest("button");
    expect(mentionOption).toBeTruthy();
    fireEvent.click(mentionOption!, { altKey: true });

    await waitFor(() => {
      expect(field.value).toBe("Ship #general ");
    });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "Ship #general ",
    });

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general ",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
      explicitMentionPubkeys: ["e".repeat(64)],
    });
  });

  it("submits on Cmd/Ctrl+Enter even when mention autocomplete is open", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    const draft = "Ship #general @al";
    fireEvent.change(field, { target: { value: draft, selectionStart: draft.length } });

    fireEvent.keyDown(field, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expect(getTaskCreateCalls()[0].content).toContain("@al");
  });

  it("adds hashtag tag via Alt+Enter without keeping hashtag text, including new tags", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    const draft = "Ship #brandnew";
    fireEvent.change(field, { target: { value: draft, selectionStart: draft.length } });

    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    await waitFor(() => {
      expect(field.value).toBe("Ship ");
    });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "Ship ",
    });

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship ",
      tags: ["brandnew"],
      relays: ["demo"],
      taskType: "task",
    });
  });

  it("uses Alt+Click on hashtag autocomplete option to add tag-only", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={autocompleteChannels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #ge", selectionStart: 8 } });

    const hashtagOption = screen.getByText("general").closest("button");
    expect(hashtagOption).toBeTruthy();
    fireEvent.click(hashtagOption!, { altKey: true });

    await waitFor(() => {
      expect(field.value).toBe("Ship ");
    });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "ui.search.change",
      query: "Ship ",
    });

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship ",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
    });
  });

  it("captures location directly from the location button without opening a selector menu", () => {
    const latitude = 40.7128;
    const longitude = -74.006;
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(createPosition(latitude, longitude));
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    expect(screen.queryByRole("button", { name: /use current location/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /location/i }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /use current location/i })).not.toBeInTheDocument();
  });

  it("includes captured location geohash in submit payload", async () => {
    const latitude = 37.7749;
    const longitude = -122.4194;
    const expectedGeohash = encodeGeohash(latitude, longitude, DEFAULT_GEOHASH_PRECISION);
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(createPosition(latitude, longitude));
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /location/i }));
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
      locationGeohash: expectedGeohash,
    });
  });

  it("clears captured location when the mobile location button is tapped again", async () => {
    const latitude = 37.7749;
    const longitude = -122.4194;
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(createPosition(latitude, longitude));
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const locationButton = screen.getByRole("button", { name: /^location$/i });
    fireEvent.click(locationButton);
    fireEvent.click(locationButton);

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Ship #general",
      tags: ["general"],
      relays: ["demo"],
      taskType: "task",
      locationGeohash: undefined,
    });
  });

  it("allows focused comment submit with multiple active relays and no single selected space", async () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        focusedTaskId="parent-task"
        relays={[
          { id: "relay-one", name: "Relay One", isActive: true, connectionStatus: "connected", url: "wss://relay-one.test" },
          { id: "relay-two", name: "Relay Two", isActive: true, connectionStatus: "connected", url: "wss://relay-two.test" },
        ]}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Looks good #general" } });
    openMobileComposeOptions();
    fireEvent.click(getMobileCommentAction());

    await waitFor(() => {
      expect(getTaskCreateCalls()).toHaveLength(1);
    });
    expectLatestTaskCreateCall({
      type: "task.create",
      content: "Looks good #general",
      tags: ["general"],
      taskType: "comment",
      focusedTaskId: "parent-task",
    });
  });

  it("does not surface selectRelayOrParent copy in the send button title when focused", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="tree"
        focusedTaskId="parent-task"
        relays={[
          { id: "relay-one", name: "Relay One", isActive: true, connectionStatus: "connected", url: "wss://relay-one.test" },
          { id: "relay-two", name: "Relay Two", isActive: true, connectionStatus: "connected", url: "wss://relay-two.test" },
        ]}
        channels={channels}
        people={people}
        canCreateContent={true}
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Follow up for this thread" } });

    const sendButton = getMobilePrimaryAction();
    expect(sendButton.title).not.toContain("select");
    expect(sendButton.title).not.toContain("relay");
  });

  it("removes the document pointerdown listener on unmount", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const pointerDownRegistration = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "pointerdown"
    );
    expect(pointerDownRegistration).toBeTruthy();

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "pointerdown",
      pointerDownRegistration?.[1]
    );
  });

  it("clears the pending send-launch timeout on unmount", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await Promise.resolve();
    await Promise.resolve();
    expect(getTaskCreateCalls()).toHaveLength(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancels pending focus animation frames on unmount", () => {
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
        composeRestoreRequest={{
          id: 1,
          state: {
            content: "Restored #general",
            taskType: "task",
            explicitTagNames: [],
            explicitMentionPubkeys: [],
            attachments: [],
          },
        }}
      />
    );

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });

  it("restores populated mobile date and time controls from compose state", async () => {
    const dueDate = new Date("2026-03-19T00:00:00.000Z");
    const dueTime = "12:11";

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
        composeRestoreRequest={{
          id: 2,
          state: {
            content: "Restored #general",
            taskType: "task",
            dueDate,
            dueTime,
            explicitTagNames: [],
            explicitMentionPubkeys: [],
            attachments: [],
          },
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: format(dueDate, "MMM d") })).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(dueTime)).toBeInTheDocument();
  });

  it("shows location capture failure toast when geolocation errors", () => {
    const toastErrorSpy = vi.spyOn(toast, "error").mockImplementation(() => "");
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <UnifiedBottomBar
        searchQuery=""
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        canCreateContent
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /location/i }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    toastErrorSpy.mockRestore();
  });
});

afterAll(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: originalGeolocation,
  });
});
