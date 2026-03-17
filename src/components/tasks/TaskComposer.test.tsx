import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";
import type { Channel, Relay, Person, TaskCreateResult } from "@/types";
import { toast } from "sonner";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";

let mockUser: { id: string } | null = { id: "me" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser, createHttpAuthHeader: vi.fn(async () => null) }),
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
  connectionStatus: "connected",
}];

const multiRelays: Relay[] = [
  {
    id: "relay-a",
    name: "Relay A",
    url: "wss://relay-a.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
  {
    id: "relay-b",
    name: "Relay B",
    url: "wss://relay-b.example.com",
    icon: "R",
    isActive: true,
    connectionStatus: "connected",
  },
];

const disconnectedRelays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  icon: "R",
  isActive: true,
  connectionStatus: "disconnected",
}];

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
const attachmentUploadEnabledSpy = vi.spyOn(attachmentUpload, "isAttachmentUploadConfigured");

describe("TaskComposer hashtag autocomplete", () => {
  beforeEach(() => {
    mockUser = { id: "me" };
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    attachmentUploadEnabledSpy.mockReturnValue(true);
  });

  it("shows a single attachment action", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /add attachment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image attachment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add file attachment/i })).not.toBeInTheDocument();
  });

  it("replaces submit action with sign in when signed out", () => {
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

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create task/i })).not.toBeInTheDocument();
  });

  it("shows offer/request kind options only when feed message types are enabled", () => {
    const { rerender } = render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request/i })).not.toBeInTheDocument();

    rerender(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        allowFeedMessageTypes
      />
    );

    expect(screen.getByRole("button", { name: "Offer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request" })).toBeInTheDocument();
  });

  it("submits request kind when selected in feed mode", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        allowFeedMessageTypes
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    fireEvent.change(screen.getByLabelText("Post a request..."), {
      target: { value: "Need a designer #design" },
    });
    fireEvent.change(screen.getByLabelText("Listing title"), {
      target: { value: "Need designer for mobile UI" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post Request" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Need a designer #design",
        ["design"],
        ["demo"],
        "request",
        undefined,
        undefined,
        "due",
        [],
        undefined,
        [],
        {
          identifier: undefined,
          title: "Need designer for mobile UI",
          summary: undefined,
          location: undefined,
          price: undefined,
          currency: undefined,
          frequency: undefined,
          status: "active",
          publishedAt: undefined,
        }
      );
    });
  });

  it("defaults currency field to EUR with currency autocomplete suggestions", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        allowFeedMessageTypes
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Offer" }));
    const currencyInput = screen.getByLabelText("Currency");
    expect(currencyInput).toHaveValue("EUR");
    expect(currencyInput).toHaveAttribute("list", "nip99-currency-suggestions");
    expect(screen.getByDisplayValue("EUR")).toBeInTheDocument();
  });

  it("autofills listing title from content and strips tags by default", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        allowFeedMessageTypes
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Offer" }));
    fireEvent.change(screen.getByLabelText("Post an offer..."), {
      target: { value: "Selling mountain bike @alice@example.com #bikes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post Offer" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Selling mountain bike @alice@example.com #bikes",
        ["bikes"],
        ["demo"],
        "offer",
        undefined,
        undefined,
        "due",
        [],
        undefined,
        [],
        {
          identifier: undefined,
          title: "Selling mountain bike",
          summary: undefined,
          location: undefined,
          price: undefined,
          currency: undefined,
          frequency: undefined,
          status: "active",
          publishedAt: undefined,
        }
      );
    });
  });

  it("stops title autofill once the listing title is edited manually", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        allowFeedMessageTypes
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Offer" }));
    fireEvent.change(screen.getByLabelText("Post an offer..."), {
      target: { value: "First listing headline #bikes" },
    });
    const titleInput = screen.getByLabelText("Listing title") as HTMLInputElement;
    expect(titleInput.value).toBe("First listing headline");

    fireEvent.change(titleInput, { target: { value: "Custom manual title" } });
    fireEvent.change(screen.getByLabelText("Post an offer..."), {
      target: { value: "Changed body text #bikes" },
    });

    expect((screen.getByLabelText("Listing title") as HTMLInputElement).value).toBe("Custom manual title");
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

  it("prefers shorter hashtag matches in autocomplete ordering", () => {
    const rankingChannels: Channel[] = [
      { id: "bitcoin", name: "bitcoin", filterState: "neutral" },
      { id: "bit", name: "bit", filterState: "neutral" },
      { id: "it", name: "it", filterState: "neutral" },
    ];
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={rankingChannels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "#it", selectionStart: 3 },
    });

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("#it ");
  });

  it("prefers prefix hashtag matches over non-prefix matches", () => {
    const rankingChannels: Channel[] = [
      { id: "xac", name: "xac", filterState: "neutral" },
      { id: "accounting", name: "accounting", filterState: "neutral" },
    ];
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={rankingChannels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "#ac", selectionStart: 3 },
    });

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("#accounting ");
  });

  it("hides autocomplete on blur or cursor move, and restores when refocused at unfinished token", () => {
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
      target: { value: "Ship #ba", selectionStart: 8 },
    });
    expect(screen.getByText("backend")).toBeInTheDocument();

    textarea.setSelectionRange(2, 2);
    fireEvent.select(textarea);
    expect(screen.queryByText("backend")).not.toBeInTheDocument();

    fireEvent.blur(textarea);
    expect(screen.queryByText("backend")).not.toBeInTheDocument();

    fireEvent.focus(textarea);
    textarea.setSelectionRange(8, 8);
    fireEvent.select(textarea);
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("adds hashtag tags via Alt+Enter without inserting hashtag text", async () => {
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
        undefined,
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
        undefined,
        [],
        undefined
      );
    });
  });

  it("uses Alt+Click on hashtag autocomplete option to add tag-only", async () => {
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

    const hashtagOption = screen.getByText("backend").closest("button");
    expect(hashtagOption).toBeTruthy();
    fireEvent.click(hashtagOption!, { altKey: true });

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
        undefined,
        [],
        undefined
      );
    });
  });

  it("uses Alt+Enter to add a new hashtag tag-only even without suggestions", async () => {
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
    const draft = "Ship #brandnew";
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
        undefined,
        [],
        undefined
      );
    });
  });

  it("submits as comment when kind is switched and submit button is clicked", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        parentId="parent-task"
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    fireEvent.change(textarea, { target: { value: "Looks good #backend" } });
    fireEvent.click(screen.getByRole("button", { name: /add comment/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Looks good #backend",
        ["backend"],
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

  it("adds mention pubkey tags via Alt+Enter without inserting mention text", async () => {
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

    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });
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
        undefined,
        [],
        undefined
      );
    });
  });

  it("uses Alt+Click on mention autocomplete option to add mention tag-only", async () => {
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

    const mentionOption = screen.getByText("@alice").closest("button");
    expect(mentionOption).toBeTruthy();
    fireEvent.click(mentionOption!, { altKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe("Ship #backend with ");
    });
    expect(onSubmit).not.toHaveBeenCalled();

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
        undefined,
        [],
        undefined
      );
    });
  });

  it("submits on Cmd/Ctrl+Enter even when mention autocomplete is open", async () => {
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

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect((onSubmit.mock.calls as unknown[][])[0][0]).toContain("@al");
  });

  it("removes metadata-only hashtag chip when clicked", async () => {
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
    const draft = "Ship #brandnew";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe("Ship ");
    });
    expect(screen.getByTestId("compose-hashtag-chip")).toHaveTextContent("brandnew");

    fireEvent.click(screen.getByTestId("compose-hashtag-chip"));
    expect(screen.queryByTestId("compose-hashtag-chip")).not.toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("removes metadata-only mention chip when clicked", async () => {
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
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe("Ship #backend with ");
    });
    expect(screen.getByTestId("compose-mention-chip")).toHaveTextContent("alice");

    fireEvent.click(screen.getByTestId("compose-mention-chip"));
    expect(screen.queryByTestId("compose-mention-chip")).not.toBeInTheDocument();

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
        [],
        undefined,
        [],
        undefined
      );
    });
  });

  it("adds included channel filters as metadata-only hashtag chips", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    const channelsWithIncluded: Channel[] = [
      { id: "backend", name: "backend", filterState: "included" },
      { id: "design", name: "design", filterState: "neutral" },
    ];
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channelsWithIncluded}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship feature now" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship feature now",
        ["backend"],
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

    expect(screen.getByTestId("compose-hashtag-chip")).toHaveTextContent("backend");
  });

  it("adds selected people as metadata-only mention chips", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    const selectedPeople: Person[] = [
      {
        ...people[0],
        isSelected: true,
      },
    ];
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={selectedPeople}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship #backend now" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship #backend now",
        ["backend"],
        ["demo"],
        "task",
        undefined,
        undefined,
        "due",
        ["f".repeat(64)],
        undefined,
        [],
        undefined
      );
    });

    expect(screen.getByTestId("compose-mention-chip")).toHaveTextContent("alice");
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

    expect(screen.getByText("Select a single feed or a parent task to create a new task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
  });

  it("blocks submit when composer content has only tags and mentions", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "#backend @alice@example.com" },
    });

    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
    expect(screen.getByText("Write a message first")).toBeInTheDocument();
  });

  it("allows parent-scoped submit without explicit tags", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={multiRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        parentId="parent-task"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "Follow-up update for this thread" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Follow-up update for this thread",
        [],
        ["relay-a", "relay-b"],
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

  it("does not submit hashtags embedded inside words", async () => {
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

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "email#backend release #design" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "email#backend release #design",
        ["design"],
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

  it("blocks root task submit when relay is disconnected", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={disconnectedRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "Ship #backend now" },
    });

    expect(screen.getByText("Select a single feed or a parent task to create a new task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
  });

  it("blocks root task submit when relay is connected but not toggled active", () => {
    const connectedInactiveRelays: Relay[] = [{
      id: "demo",
      name: "Demo",
      url: "wss://relay.example.com",
      icon: "R",
      isActive: false,
      connectionStatus: "connected",
    }];
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={connectedInactiveRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/what needs to be done/i), {
      target: { value: "Ship #backend now" },
    });

    expect(screen.getByText("Select a single feed or a parent task to create a new task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
  });

  it("blocks comment submit when no parent task is selected", () => {
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
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: "Looks good #backend" },
    });

    expect(screen.getByText("Select a task to reply to")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).toBeDisabled();
  });

  it("allows comment submit when parentId is provided", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        parentId="some-task-id"
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: "Looks good #backend" },
    });

    expect(screen.queryByText("Select a task to reply to")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).not.toBeDisabled();
  });

  it("restores compose state when restore request changes", () => {
    const { rerender } = render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    rerender(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        composeRestoreRequest={{
          id: 1,
          state: {
            content: "Recovered content",
            taskType: "task",
            explicitTagNames: ["backend"],
            explicitMentionPubkeys: ["f".repeat(64)],
          },
        }}
      />
    );

    expect(screen.getByDisplayValue("Recovered content")).toBeInTheDocument();
    expect(screen.getByTestId("compose-hashtag-chip")).toHaveTextContent("backend");
    expect(screen.getByTestId("compose-mention-chip")).toHaveTextContent("alice");
  });
});
