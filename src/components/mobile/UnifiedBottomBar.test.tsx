import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import type { Channel, Person, Relay } from "@/types";
import { addDays, format } from "date-fns";

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
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

describe("UnifiedBottomBar auth gating", () => {
  it("opens sign-in when create is tapped while signed out", () => {
    const onSignInClick = vi.fn();

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
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
        onSubmit={() => {}}
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

  it("submits as opposite kind on Alt+Enter in compose mode", () => {
    const onSubmit = vi.fn();

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

    fireEvent.keyDown(composeField, { key: "Enter", altKey: true });
    expect(onSubmit).toHaveBeenCalledWith(
      "Ship #general",
      ["general"],
      ["demo"],
      "comment",
      undefined,
      undefined
    );

    fireEvent.click(screen.getByRole("button", { name: /comment/i }));
    const commentField = screen.getByPlaceholderText(/search or add comment/i) as HTMLTextAreaElement;
    fireEvent.change(commentField, { target: { value: "Reply #general" } });

    fireEvent.keyDown(commentField, { key: "Enter", altKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Reply #general",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined
    );
  });

  it("submits current kind on Ctrl+Enter and Cmd+Enter", () => {
    const onSubmit = vi.fn();

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
      undefined
    );
  });

  it("hides comment option in tree view without focused task", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
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

    expect(screen.queryByRole("button", { name: /comment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /task/i })).not.toBeInTheDocument();
  });

  it("shows comment option in tree view when task is focused", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
        currentView="tree"
        focusedTaskId="abc123"
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

    expect(screen.getByRole("button", { name: /task/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /comment/i })).toBeInTheDocument();
  });

  it("prefills due date with today in calendar view", () => {
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
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

    expect(screen.getByText(format(new Date(), "MMM d"))).toBeInTheDocument();
  });

  it("updates due date when selected calendar date changes", () => {
    const nextDay = addDays(new Date(), 1);
    const { rerender } = render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
        currentView="calendar"
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
        onSubmit={() => {}}
        currentView="calendar"
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
          onSubmit={() => {}}
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
          onSubmit={() => {}}
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
        onSubmit={() => {}}
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

    expect(field.value).toBe("ping @alice ");
    expect(onSearchChange).toHaveBeenLastCalledWith("ping @alice ");
  });
});
