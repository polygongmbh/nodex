import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import type { Channel, Person, Relay } from "@/types";
import { addDays, format } from "date-fns";
import { toast } from "sonner";

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

describe("UnifiedBottomBar auth gating", () => {
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

  it("keeps task option disabled when sending without a selected channel tag", () => {
    const onSubmit = vi.fn(async () => ({ ok: true, mode: "local" as const }));
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
    expect(taskButton).toBeDisabled();
    fireEvent.click(taskButton);

    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    toastErrorSpy.mockRestore();
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

  it("submits as comment on Alt+Enter in compose-capable views", () => {
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
      undefined,
      "due",
      [],
      undefined
    );

  });

  it("submits current kind on Ctrl+Enter and Cmd+Enter", () => {
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
      undefined
    );
  });

  it("submits comment when send comment button is tapped", () => {
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
      undefined
    );
  });

  it("reveals task and comment send options in tree view", () => {
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

  it("adds mention tag via modifier+Enter without inserting mention text", async () => {
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

    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
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
      undefined
    );
  });
});
