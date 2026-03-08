import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import type { Channel, Person, Relay, TaskCreateResult } from "@/types";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";
import { DEFAULT_GEOHASH_PRECISION, encodeGeohash } from "@/lib/nostr/geohash-location";

const successResult: TaskCreateResult = { ok: true, mode: "local" };

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({
    createHttpAuthHeader: vi.fn(async () => null),
  }),
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", icon: "D", isActive: true },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
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
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /add attachment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image attachment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add file attachment/i })).not.toBeInTheDocument();
  });

  it("opens sign-in when create is tapped while signed out", () => {
    const onSignInClick = vi.fn();

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={false}
        onSignInClick={onSignInClick}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
  });

  it("searches as user types in combined field", () => {
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "hello #general" } });
    expect(onSearchChange).toHaveBeenLastCalledWith("hello #general");
  });

  it("keeps task and comment options disabled when sending without a selected channel tag", () => {
    const onSubmit = vi.fn(async () => successResult);
    const toastErrorSpy = vi.spyOn(toast, "error").mockImplementation(() => "");

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship update" } });
    fireEvent.click(screen.getByRole("button", { name: /send task \/ send comment/i }));
    const taskButton = screen.getByRole("button", { name: /^send task$/i });
    const commentButton = screen.getByRole("button", { name: /^send comment$/i });
    expect(taskButton).toBeDisabled();
    expect(commentButton).toBeDisabled();
    fireEvent.click(taskButton);
    fireEvent.click(commentButton);

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    toastErrorSpy.mockRestore();
  });

  it("disables sending when content has only tags and mentions", () => {
    const onSubmit = vi.fn(async () => successResult);

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "#general @alice@example.com" } });
    const sendButton = screen.getByRole("button", { name: /send task \/ send comment/i });
    expect(sendButton).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows focused-subtask send without explicit tags", async () => {
    const onSubmit = vi.fn(async () => successResult);

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="tree"
        focusedTaskId="parent-task"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Follow-up details for parent task" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Follow-up details for parent task",
        [],
        ["demo"],
        "task",
        undefined,
        undefined,
        "due",
        [],
        undefined,
        [],
        undefined
      );
    });
  });

  it("keeps compose text when submit returns a failure result", async () => {
    const onSubmit = vi.fn(async () => ({ ok: false as const, reason: "relay-selection" as const }));
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(field.value).toBe("Ship #general");
  });

  it("submits as comment on Alt+Enter when no hashtag token is being typed", () => {
    const onSubmit = vi.fn(async () => successResult);

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general now" } });

    fireEvent.keyDown(composeField, { key: "Enter", altKey: true });
    expect(onSubmit).toHaveBeenCalledWith(
      "Ship #general now",
      ["general"],
      ["demo"],
      "comment",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined
    );

  });

  it("submits current kind on Ctrl+Enter and Cmd+Enter", () => {
    const onSubmit = vi.fn(async () => successResult);

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general" } });

    fireEvent.keyDown(composeField, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith(
      "Ship #general",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined
    );

    fireEvent.change(composeField, { target: { value: "Ship again #general" } });
    fireEvent.keyDown(composeField, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Ship again #general",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined
    );
  });

  it("submits comment when send comment button is tapped", () => {
    const onSubmit = vi.fn(async () => successResult);

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Reply #general" } });
    fireEvent.click(screen.getByRole("button", { name: /send task \/ send comment/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send comment$/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      "Reply #general",
      ["general"],
      ["demo"],
      "comment",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined
    );
  });

  it("shows offer/request options in feed view and submits listing metadata", async () => {
    const onSubmit = vi.fn(async () => successResult);
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Need help #general" } });
    fireEvent.click(screen.getByRole("button", { name: /send task \/ send comment/i }));

    expect(screen.getByRole("button", { name: /post offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post request/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /post request/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(onSubmit).toHaveBeenCalledWith(
      "Need help #general",
      ["general"],
      ["demo"],
      "request",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      {
        title: "Need help",
        status: "active",
      }
    );
  });

  it("does not offer comment send options in tree view without a focused parent", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="tree"
        focusedTaskId={null}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /send task/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send task \/ send comment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send comment$/i })).not.toBeInTheDocument();
  });

  it("reveals task and comment send options in tree view when a focused parent exists", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="tree"
        focusedTaskId="parent-1"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /send task \/ send comment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send task$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send comment$/i })).not.toBeInTheDocument();

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Reply #general" } });
    fireEvent.click(screen.getByRole("button", { name: /send task \/ send comment/i }));

    expect(screen.getByRole("button", { name: /^send task$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send comment$/i })).toBeInTheDocument();
  });

  it("hides comment send button in non-feed/tree views", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="calendar"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /send task/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send comment/i })).not.toBeInTheDocument();
  });

  it("prefills due date with today in calendar view", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="calendar"
        defaultContent="Ship #general"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
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
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="calendar"
        defaultContent="Ship #general"
        selectedCalendarDate={new Date()}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    rerender(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="calendar"
        defaultContent="Ship #general"
        selectedCalendarDate={nextDay}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.getByText(format(nextDay, "MMM d"))).toBeInTheDocument();
  });

  it("hides date type until a due date is selected", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    expect(screen.queryByLabelText(/date type/i)).not.toBeInTheDocument();
  });

  it("syncs channel filters when hashtags are completed or removed", () => {
    const toggleCalls: string[] = [];

    const StatefulBar = () => {
      const [statefulChannels, setStatefulChannels] = useState<Channel[]>([
        { id: "general", name: "general", filterState: "neutral" },
      ]);

      return (
        <UnifiedBottomBar
          searchQuery=""
          onSearchChange={() => {}}
          onSubmit={() => ({ ok: true, mode: "local" })}
          currentView="feed"
          relays={relays}
          channels={statefulChannels}
          people={people}
          onRelayToggle={() => {}}
          onChannelToggle={(id) => {
            toggleCalls.push(id);
            setStatefulChannels((prev) =>
              prev.map((channel) => {
                if (channel.id !== id) return channel;
                if (channel.filterState === "neutral") return { ...channel, filterState: "included" };
                if (channel.filterState === "included") return { ...channel, filterState: "excluded" };
                return { ...channel, filterState: "neutral" };
              })
            );
          }}
          onPersonToggle={() => {}}
          isSignedIn={true}
          onSignInClick={() => {}}
        />
      );
    };

    render(<StatefulBar />);

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general " } });
    expect(toggleCalls).toEqual(["general"]);

    fireEvent.change(composeField, { target: { value: "Ship " } });
    expect(toggleCalls).toEqual(["general", "general", "general"]);
  });

  it("does not touch unrelated channel filters when editing specific hashtags", () => {
    const toggleCalls: string[] = [];

    const StatefulBar = () => {
      const [statefulChannels, setStatefulChannels] = useState<Channel[]>([
        { id: "general", name: "general", filterState: "neutral" },
        { id: "ops", name: "ops", filterState: "excluded" },
      ]);

      return (
        <UnifiedBottomBar
          searchQuery=""
          onSearchChange={() => {}}
          onSubmit={() => ({ ok: true, mode: "local" })}
          currentView="feed"
          relays={relays}
          channels={statefulChannels}
          people={people}
          onRelayToggle={() => {}}
          onChannelToggle={(id) => {
            toggleCalls.push(id);
            setStatefulChannels((prev) =>
              prev.map((channel) => {
                if (channel.id !== id) return channel;
                if (channel.filterState === "neutral") return { ...channel, filterState: "included" };
                if (channel.filterState === "included") return { ...channel, filterState: "excluded" };
                return { ...channel, filterState: "neutral" };
              })
            );
          }}
          onPersonToggle={() => {}}
          isSignedIn={true}
          onSignInClick={() => {}}
        />
      );
    };

    render(<StatefulBar />);

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general " } });
    fireEvent.change(composeField, { target: { value: "Ship " } });

    expect(toggleCalls).toEqual(["general", "general", "general"]);
    expect(toggleCalls).not.toContain("ops");
  });

  it("supports @mention autocomplete in the combined search/compose field", () => {
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "ping @al", selectionStart: 8 } });

    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.keyDown(field, { key: "Enter" });

    expect(field.value).toBe("ping @alice@example.com ");
    expect(onSearchChange).toHaveBeenLastCalledWith("ping @alice@example.com ");
  });

  it("closes mention autocomplete when compose is cancelled", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "ping @al", selectionStart: 8 } });
    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear compose/i }));
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it("adds mention tag via Alt+Enter without inserting mention text", async () => {
    const onSubmit = vi.fn(async () => successResult);
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general @al", selectionStart: 16 } });

    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    await waitFor(() => {
      expect(field.value).toBe("Ship #general ");
    });
    expect(onSearchChange).toHaveBeenLastCalledWith("Ship #general ");

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Ship #general ",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      ["e".repeat(64)],
      undefined,
      [],
      undefined
    );
  });

  it("uses Alt+Click on mention autocomplete option to add mention tag-only", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true, mode: "local" as const }));
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general @al", selectionStart: 16 } });

    const mentionOption = screen.getByText("@alice").closest("button");
    expect(mentionOption).toBeTruthy();
    fireEvent.click(mentionOption!, { altKey: true });

    await waitFor(() => {
      expect(field.value).toBe("Ship #general ");
    });
    expect(onSearchChange).toHaveBeenLastCalledWith("Ship #general ");

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Ship #general ",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      ["e".repeat(64)],
      undefined,
      [],
      undefined
    );
  });

  it("submits on Cmd/Ctrl+Enter even when mention autocomplete is open", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true, mode: "local" as const }));
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    const draft = "Ship #general @al";
    fireEvent.change(field, { target: { value: draft, selectionStart: draft.length } });

    fireEvent.keyDown(field, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0][0]).toContain("@al");
  });

  it("adds hashtag tag via Alt+Enter without keeping hashtag text, including new tags", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true, mode: "local" as const }));
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    const draft = "Ship #brandnew";
    fireEvent.change(field, { target: { value: draft, selectionStart: draft.length } });

    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    await waitFor(() => {
      expect(field.value).toBe("Ship ");
    });
    expect(onSearchChange).toHaveBeenLastCalledWith("Ship ");

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Ship ",
      ["brandnew"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined
    );
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
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
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
    const onSubmit = vi.fn(async () => ({ ok: true, mode: "local" as const }));

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /location/i }));
    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      "Ship #general",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined,
      "due",
      [],
      undefined,
      [],
      undefined,
      expectedGeohash
    );
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
        onSearchChange={() => {}}
        onSubmit={() => ({ ok: true, mode: "local" })}
        currentView="feed"
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn
        onSignInClick={() => {}}
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
