import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";
import type { Channel, Relay, Person, TaskCreateResult } from "@/types";
import { toast } from "sonner";

let mockUser: { id: string } | null = { id: "me" };

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const relays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  icon: "R",
  isActive: true,
}];

const multiRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    icon: "R",
    isActive: true,
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    icon: "R",
    isActive: true,
  },
];

const channels: Channel[] = [
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "design", name: "design", filterState: "neutral" },
];

const people: Person[] = [
  {
    id: "f".repeat(64),
    name: "alice",
    displayName: "Alice",
    nip05: "alice@example.com",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

const successfulCreateResult: TaskCreateResult = { ok: true, mode: "local" };

describe("TaskComposer hashtag autocomplete", () => {
  beforeEach(() => {
    mockUser = { id: "me" };
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("keeps task submit label when signed out and disabled", () => {
    mockUser = null;
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /create task/i })).toBeInTheDocument();
    expect(screen.queryByText("Sign in to post")).not.toBeInTheDocument();
  });

  it("supports keyboard selection with Enter", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "#b", selectionStart: 2 },
    });

    expect(screen.getByText("backend")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("#backend ");
  });

  it("adds hashtag tags via modifier+Enter without inserting hashtag text", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    const draft = "Ship #ba";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    textarea.focus();
    textarea.setSelectionRange(draft.length, draft.length);

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(textarea.value).toBe("Ship ");
    });

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship ",
        ["backend"],
        ["demo"],
        "task",
        undefined,
        undefined,
        "due",
        [],
        undefined
      );
    });
  });

  it("uses Alt+Enter to add hashtag tag-only when hashtag autocomplete is open", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    const draft = "Ship #ba";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    textarea.focus();
    textarea.setSelectionRange(draft.length, draft.length);

    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });
    await waitFor(() => {
      expect(textarea.value).toBe("Ship ");
    });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship ",
        ["backend"],
        ["demo"],
        "task",
        undefined,
        undefined,
        "due",
        [],
        undefined
      );
    });
  });

  it("stays compact in adaptive mode and expands on focus", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        compact
        adaptiveSize
      />
    );

    expect(screen.queryByText(/set .*date \(optional\)/i)).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/what needs to be done/i);
    fireEvent.focus(textarea);

    expect(screen.getByText(/set .*date \(optional\)/i)).toBeInTheDocument();
  });

  it("restores draft content from shared storage key", () => {
    localStorage.setItem(
      "nodex.compose-draft.shared",
      JSON.stringify({
        content: "#persisted hello",
        taskType: "comment",
        explicitMentionPubkeys: ["f".repeat(64)],
      })
    );

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        draftStorageKey="nodex.compose-draft.shared"
      />
    );

    expect(screen.getByDisplayValue("#persisted hello")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
    expect(screen.getByTestId("compose-mention-chip")).toHaveTextContent("alice");
  });

  it("does not render a cancel action button", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  it("allows switching kind to comment from action dropdown", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });

    expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
  });

  it("submits as the opposite kind on Alt+Enter", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i);
    fireEvent.change(textarea, { target: { value: "Ship #backend now" } });
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship #backend now",
        ["backend"],
        ["demo"],
        "comment",
        undefined,
        undefined,
        "due",
        [],
        undefined
      );
    });
  });

  it("supports @mention autocomplete via keyboard selection", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "Need input from @al", selectionStart: 19 },
    });

    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("Need input from @alice@example.com ");
  });

  it("adds mention pubkey tags via modifier+Enter without inserting mention text", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    const draft = "Ship #backend with @al";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    textarea.focus();
    textarea.setSelectionRange(draft.length, draft.length);

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(textarea.value).toBe("Ship #backend with ");
    });

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship #backend with ",
        ["backend"],
        ["demo"],
        "task",
        undefined,
        undefined,
        "due",
        ["f".repeat(64)],
        undefined
      );
    });
  });

  it("renders parsed mention chips before hashtag chips", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i);
    fireEvent.change(textarea, {
      target: { value: "Pair with @alice@example.com on #backend" },
    });

    const mentionChip = screen.getByTestId("compose-mention-chip");
    const hashtagChip = screen.getByTestId("compose-hashtag-chip");
    const relation = mentionChip.compareDocumentPosition(hashtagChip);
    expect((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it("expands adaptively when forceExpandSignal changes", () => {
    const { rerender } = render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        compact
        adaptiveSize
        forceExpandSignal={1}
      />
    );

    expect(screen.getByText(/set .*date \(optional\)/i)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText(/what needs to be done/i), { key: "Escape" });
    expect(screen.queryByText(/set .*date \(optional\)/i)).not.toBeInTheDocument();

    rerender(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        compact
        adaptiveSize
        forceExpandSignal={2}
      />
    );

    expect(screen.getByText(/set .*date \(optional\)/i)).toBeInTheDocument();
  });

  it("blocks root task submit when multiple relays are selected", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={multiRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "Ship #backend now" },
    });

    expect(screen.getByText("Select a single relay or a parent task to create a new task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
  });

  it("keeps content when submit returns a failure result", async () => {
    const onSubmit = vi.fn(async () => ({ ok: false as const, reason: "relay-selection" as const }));
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship #backend now" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(textarea.value).toBe("Ship #backend now");
  });

  it("keeps content and shows error toast when submit throws", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("network down");
    });
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship #backend now" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Task creation failed. Please try again.");
    });
    expect(textarea.value).toBe("Ship #backend now");
  });
});
