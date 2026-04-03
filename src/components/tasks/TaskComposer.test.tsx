import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { format } from "date-fns";
import { useState } from "react";
import { TaskComposer } from "./TaskComposer";
import type { Channel, Relay, TaskCreateResult } from "@/types";
import type { Person } from "@/types/person";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import { toast } from "sonner";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";
import {
  getCommentComposerInput,
  getOfferComposerInput,
  getRequestComposerInput,
  getTaskComposerInput,
} from "@/test/ui";

let mockUser: { id: string } | null = { id: "me" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser, createHttpAuthHeader: vi.fn(async () => null) }),
}));

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const },
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
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
const connectedInactiveRelays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  icon: "R",
  isActive: false,
  connectionStatus: "connected",
}];
const mixedWritableRelays: Relay[] = [
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
    connectionStatus: "read-only",
  },
];
const readOnlyRelays: Relay[] = [{
  id: "relay-a",
  name: "Relay A",
  url: "wss://relay-a.example.com",
  icon: "R",
  isActive: true,
  connectionStatus: "read-only",
}];

const channels: Channel[] = [
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "design", name: "design", filterState: "neutral" },
];

const alicePubkey = "f".repeat(64);
const people: Person[] = [
  {
    id: alicePubkey,
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
const uploadAttachmentSpy = vi.spyOn(attachmentUpload, "uploadAttachment");

const successfulUploadedAttachment = {
  url: "https://cdn.example.com/uploaded.png",
  mimeType: "image/png",
  size: 1234,
  name: "uploaded.png",
} satisfies Awaited<ReturnType<typeof attachmentUpload.uploadAttachment>>;

interface MockDataTransferItem {
  kind: "file" | "string";
  type: string;
  getAsFile: () => File | null;
  getAsString?: (callback: (value: string) => void) => void;
}

interface MockDataTransfer {
  files: File[];
  items: MockDataTransferItem[];
  types: string[];
  getData?: (type: string) => string;
}

const buildFileDropDataTransfer = (files: File[]): MockDataTransfer => ({
  files,
  items: files.map((file) => ({
    kind: "file" as const,
    type: file.type,
    getAsFile: () => file,
  })),
  types: ["Files"],
});

const buildTextDropDataTransfer = (text: string): MockDataTransfer => ({
  files: [],
  items: [
    {
      kind: "string" as const,
      type: "text/plain",
      getAsFile: () => null,
      getAsString: (callback: (value: string) => void) => callback(text),
    },
  ],
  types: ["text/plain"],
  getData: (type: string) => (type === "text/plain" ? text : ""),
});

const buildPasteClipboardData = (files: File[]): MockDataTransfer => ({
  items: files.map((file) => ({
    kind: "file" as const,
    type: file.type,
    getAsFile: () => file,
  })),
  files,
  types: ["Files"],
});
const getChipButton = (kind: "mention" | "hashtag", value: string) => {
  const match = screen
    .getAllByRole("button")
    .find((button) =>
      button.getAttribute("data-chip-kind") === kind
      && button.getAttribute("data-chip-value") === value
    );
  if (!match) throw new Error(`Chip button "${kind}:${value}" not found`);
  return match;
};
const queryChipButton = (kind: "mention" | "hashtag", value: string) =>
  screen
    .queryAllByRole("button")
    .find((button) =>
      button.getAttribute("data-chip-kind") === kind
      && button.getAttribute("data-chip-value") === value
    ) ?? null;
const getHashtagChip = (tag: string) => getChipButton("hashtag", tag);
const queryHashtagChip = (tag: string) => queryChipButton("hashtag", tag);
const getMentionChip = (value: string) => getChipButton("mention", value);
const queryMentionChip = (value: string) => queryChipButton("mention", value);

describe("TaskComposer hashtag autocomplete", () => {
  beforeEach(() => {
    mockUser = { id: "me" };
    dispatchFeedInteraction.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.dismiss).mockClear();
    attachmentUploadEnabledSpy.mockReturnValue(true);
    uploadAttachmentSpy.mockReset();
    uploadAttachmentSpy.mockResolvedValue(successfulUploadedAttachment);
    localStorage.clear();
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

  it("queues selected files through the existing attachment input", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["image-bytes"], "picked.png", { type: "image/png" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadAttachmentSpy).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          getAuthHeader: expect.any(Function),
        })
      );
    });
    expect(screen.getByText("picked.png")).toBeInTheDocument();
  });

  it("queues dropped files as attachments", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const composer = getTaskComposerInput().closest("[data-onboarding='focused-compose']");
    expect(composer).not.toBeNull();

    const file = new File(["image-bytes"], "dropped.png", { type: "image/png" });
    fireEvent.drop(composer!, {
      dataTransfer: buildFileDropDataTransfer([file]),
    });

    await waitFor(() => {
      expect(uploadAttachmentSpy).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          getAuthHeader: expect.any(Function),
        })
      );
    });
    expect(screen.getByText("dropped.png")).toBeInTheDocument();
  });

  it("inserts dropped plain text into the composer instead of uploading it", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    const composer = textarea.closest("[data-onboarding='focused-compose']");
    expect(composer).not.toBeNull();

    fireEvent.change(textarea, { target: { value: "Ship " } });
    textarea.setSelectionRange(5, 5);

    fireEvent.drop(composer!, {
      dataTransfer: buildTextDropDataTransfer("#backend now"),
    });

    expect(uploadAttachmentSpy).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Ship #backend now");
  });

  it("queues pasted files as attachments", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = getTaskComposerInput();
    const file = new File(["image-bytes"], "pasted.png", { type: "image/png" });

    fireEvent.paste(textarea, {
      clipboardData: buildPasteClipboardData([file]),
    });

    await waitFor(() => {
      expect(uploadAttachmentSpy).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          getAuthHeader: expect.any(Function),
        })
      );
    });
    expect(screen.getByText("pasted.png")).toBeInTheDocument();
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

  it("routes signed-out submit attempts through onSubmit", async () => {
    mockUser = null;
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, reason: "not-authenticated" } as TaskCreateResult);

    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend now" },
    });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const [content, tags, relayIds, taskType] = onSubmit.mock.calls[0];
    expect(content).toBe("Ship #backend now");
    expect(tags).toContain("backend");
    expect(Array.isArray(relayIds)).toBe(true);
    expect(taskType).toBe("task");
  });

  it("disables the desktop submit button when the textbox is actually empty", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const button = screen.getByRole("button", { name: /create task/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Create Task");
    expect(button).toHaveAttribute("title", "Write a message first");
  });

  it("shows a blocker panel and remediation CTA when posting is blocked by missing channel tags", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship update" },
    });

    const blockPanel = screen.getByRole("alert");
    expect(blockPanel).toHaveTextContent("Can't post yet");
    expect(blockPanel).toHaveTextContent("Add or select at least one #channel");
    expect(screen.getByRole("button", { name: /create task/i })).toHaveTextContent("Add #channel");
  });

  it("keeps the blocked desktop CTA interactive instead of submitting", () => {
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

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship update" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows publishing as a toast instead of a warning banner", async () => {
    const onSubmit = vi.fn(
      () =>
        new Promise<TaskCreateResult>(() => {
          // keep pending to assert in-progress UI behavior
        })
    );
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship update #backend" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(toast.loading).toHaveBeenCalledWith("Publishing...", { id: "task-composer-publishing" });
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toBeDisabled();
  });

  it("prevents duplicate submits while publishing is in flight", async () => {
    let resolveSubmit!: (result: TaskCreateResult) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<TaskCreateResult>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship update #backend" },
    });
    const submitButton = screen.getByRole("button", { name: /create task/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    resolveSubmit(successfulCreateResult);
    await waitFor(() => {
      expect(toast.dismiss).toHaveBeenCalledWith("task-composer-publishing");
    });
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
    fireEvent.change(getRequestComposerInput(), {
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
        undefined,
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

  it("keeps the adaptive composer open and preserves date and priority after submit", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    const dueDate = new Date("2026-03-19T00:00:00.000Z");

    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        adaptiveSize
        composeRestoreRequest={{
          id: 10,
          state: {
            content: "Ship #backend",
            taskType: "task",
            dueDate,
            priority: 40,
            explicitTagNames: [],
            explicitMentionPubkeys: [],
            attachments: [],
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(getTaskComposerInput()).toHaveFocus();
    expect(getTaskComposerInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: format(dueDate, "MMM d, yyyy") })).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toHaveValue("2");
    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
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
    fireEvent.change(getOfferComposerInput(), {
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
        undefined,
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
    fireEvent.change(getOfferComposerInput(), {
      target: { value: "First listing headline #bikes" },
    });
    const titleInput = screen.getByLabelText("Listing title") as HTMLInputElement;
    expect(titleInput.value).toBe("First listing headline");

    fireEvent.change(titleInput, { target: { value: "Custom manual title" } });
    fireEvent.change(getOfferComposerInput(), {
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;

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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    expect(screen.getByText(/set .*date \(optional\)/i)).toBeInTheDocument();
  });

  it("restores draft content from shared storage key", () => {
    localStorage.setItem(
      "nodex.compose-draft.shared",
      JSON.stringify({
        content: "#persisted hello",
        taskType: "comment",
        explicitMentionPubkeys: [alicePubkey],
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
    expect(getCommentComposerInput()).toBeInTheDocument();
    expect(getMentionChip(alicePubkey)).toBeInTheDocument();
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

    expect(getCommentComposerInput()).toBeInTheDocument();
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

    const textarea = getTaskComposerInput();
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
        undefined,
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

    const textarea = getCommentComposerInput();
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
        undefined,
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "Need input from @al", selectionStart: 19 },
    });

    expect(screen.getByText("@alice")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("Need input from @alice@example.com ");
  });

  it("uses scoped mention candidates from context while keeping parsed mention labels from full people", () => {
    const bobPubkey = "e".repeat(64);
    const bob: Person = {
      id: bobPubkey,
      name: "bob",
      displayName: "Bob",
      nip05: "bob@example.com",
      avatar: "",
      isOnline: true,
      isSelected: false,
    };

    render(
      <FeedSurfaceProvider
        value={{
          relays,
          channels,
          composeChannels: channels,
          people: [...people, bob],
          mentionablePeople: people,
          searchQuery: "",
          channelMatchMode: "and",
        }}
      >
        <TaskComposer
          onSubmit={() => successfulCreateResult}
          relays={relays}
          channels={channels}
          onCancel={() => {}}
          defaultContent="Already asked @bob@example.com"
        />
      </FeedSurfaceProvider>
    );

    expect(getMentionChip("bob@example.com")).toHaveTextContent("bob");

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Need input from @al", selectionStart: 19 },
    });

    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.queryByText("@bob")).not.toBeInTheDocument();
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    const draft = "Ship #brandnew";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe("Ship ");
    });
    expect(getHashtagChip("brandnew")).toBeInTheDocument();

    fireEvent.click(getHashtagChip("brandnew"));
    expect(queryHashtagChip("brandnew")).not.toBeInTheDocument();

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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    const draft = "Ship #backend with @al";
    fireEvent.change(textarea, {
      target: { value: draft, selectionStart: draft.length },
    });
    fireEvent.keyDown(textarea, { key: "Enter", altKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe("Ship #backend with ");
    });
    expect(getMentionChip(alicePubkey)).toBeInTheDocument();

    fireEvent.click(getMentionChip(alicePubkey));
    expect(queryMentionChip(alicePubkey)).not.toBeInTheDocument();

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

  it("does not reapply a consumed mention request after remount", async () => {
    const consumedRequestIds: number[] = [];

    function MentionRequestHarness() {
      const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>({
        mention: "@alice@example.com",
        id: 7,
      });
      const [visible, setVisible] = useState(true);

      return (
        <>
          <button type="button" onClick={() => setVisible((current) => !current)}>
            toggle composer
          </button>
          {visible ? (
            <TaskComposer
              onSubmit={() => successfulCreateResult}
              relays={relays}
              channels={channels}
              people={people}
              onCancel={() => {}}
              mentionRequest={mentionRequest}
              onMentionRequestConsumed={(requestId) => {
                consumedRequestIds.push(requestId);
                setMentionRequest((current) => (current?.id === requestId ? null : current));
              }}
            />
          ) : null}
        </>
      );
    }

    render(<MentionRequestHarness />);

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe("@alice@example.com ");
    });
    expect(consumedRequestIds).toEqual([7]);

    fireEvent.change(textarea, { target: { value: "" } });
    expect(textarea.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "toggle composer" }));
    expect(screen.queryByRole("textbox", { name: /what's up\? use #channels and @mentions/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "toggle composer" }));

    const remountedTextarea = getTaskComposerInput() as HTMLTextAreaElement;
    expect(remountedTextarea.value).toBe("");
    expect(consumedRequestIds).toEqual([7]);
  });

  it("focuses the composer when applying an external mention request", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        mentionRequest={{ mention: "@alice@example.com", id: 11 }}
      />
    );

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    await waitFor(() => {
      expect(textarea.value).toBe("@alice@example.com ");
      expect(document.activeElement).toBe(textarea);
    });

    outsideButton.remove();
  });

  it("focuses and highlights the composer input when clicking a parsed hashtag chip", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Ship #backend now" },
    });

    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    fireEvent.click(getHashtagChip("backend"));

    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
      expect(textarea).toHaveClass("ring-amber-400");
    });
    expect(getHashtagChip("backend")).toBeInTheDocument();

    outsideButton.remove();
  });

  it("focuses and highlights the composer input when clicking a parsed mention chip", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Pair with @alice@example.com on #backend" },
    });

    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    fireEvent.click(getMentionChip("alice@example.com"));

    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
      expect(textarea).toHaveClass("ring-amber-400");
    });
    expect(getMentionChip("alice@example.com")).toBeInTheDocument();

    outsideButton.remove();
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    expect(getHashtagChip("backend")).toBeInTheDocument();
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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
        [alicePubkey],
        undefined,
        [],
        undefined
      );
    });

    expect(getMentionChip(alicePubkey)).toBeInTheDocument();
  });

  it("clears an included channel filter when removing its filter-backed chip", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship feature now" },
    });
    fireEvent.click(getHashtagChip("backend"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "filter.clearChannel",
      channelId: "backend",
    });
  });

  it("clears a selected person filter when removing its filter-backed chip", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={[{ ...people[0], isSelected: true }]}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend now" },
    });
    fireEvent.click(getMentionChip(alicePubkey));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "filter.clearPerson",
      personId: alicePubkey,
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

    const textarea = getTaskComposerInput();
    fireEvent.change(textarea, {
      target: { value: "Pair with @alice@example.com on #backend" },
    });

    const mentionChip = getMentionChip("alice@example.com");
    const hashtagChip = getHashtagChip("backend");
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

    fireEvent.keyDown(getTaskComposerInput(), { key: "Escape" });
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

  it("keeps filter chips visible when an empty adaptive composer collapses on blur", async () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);
    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();

    fireEvent.blur(textarea, { relatedTarget: outsideButton });

    expect(getHashtagChip("backend")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /insert hashtag/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Write a message first")).not.toBeInTheDocument();
    });

    outsideButton.remove();
  });

  it("does not collapse when focus moves to another control inside the composer", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    const hashtagButton = screen.getByRole("button", { name: /insert hashtag/i });
    fireEvent.blur(textarea, { relatedTarget: hashtagButton });
    fireEvent.click(hashtagButton);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
    expect((getTaskComposerInput() as HTMLTextAreaElement).value).toBe("#");
  });

  it("does not collapse when an internal button click blurs the textarea without moving focus", async () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    const hashtagButton = screen.getByRole("button", { name: /insert hashtag/i });
    fireEvent.mouseDown(hashtagButton);
    fireEvent.blur(textarea);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
    expect(screen.queryByText("Write a message first")).not.toBeInTheDocument();

    fireEvent.mouseDown(outsideButton);
    fireEvent.click(outsideButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /insert hashtag/i })).not.toBeInTheDocument();
    });

    outsideButton.remove();
  });

  it("waits until the outside click completes before collapsing the empty adaptive composer", async () => {
    const outsideTarget = document.createElement("div");
    document.body.appendChild(outsideTarget);

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();

    fireEvent.mouseDown(outsideTarget);
    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();

    fireEvent.click(outsideTarget);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /insert hashtag/i })).not.toBeInTheDocument();
    });

    outsideTarget.remove();
  });

  it("does not collapse when the empty adaptive composer blurs without a next focus target", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();

    fireEvent.blur(textarea);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
  });

  it("does not collapse when interacting with the due date popover while empty", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);

    const dueDateButton = screen.getByRole("button", { name: /set .*date \(optional\)/i });
    fireEvent.click(dueDateButton);

    const popoverContent = document.querySelector("[data-radix-popper-content-wrapper] .motion-selector-panel");
    expect(popoverContent).not.toBeNull();

    fireEvent.mouseDown(popoverContent!);

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
  });

  it("does not collapse when clearing the date with the clear button", async () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
        composeRestoreRequest={{
          id: 3,
          state: {
            content: "",
            taskType: "task",
            dueDate: new Date("2026-03-19T00:00:00.000Z"),
            dueTime: "09:15",
            explicitTagNames: [],
            explicitMentionPubkeys: [],
            attachments: [],
          },
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /clear due date/i }));

    expect(screen.getByRole("button", { name: /insert hashtag/i })).toBeInTheDocument();
    expect(screen.getByText(/set .*date \(optional\)/i)).toBeInTheDocument();
  });

  it("collapses even when supplemental composer controls have non-default values", async () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={[{ id: "backend", name: "backend", filterState: "included" }]}
        people={people}
        onCancel={() => {}}
        adaptiveSize
      />
    );

    const textarea = getTaskComposerInput();
    fireEvent.focus(textarea);
    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });

    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument();

    fireEvent.blur(textarea, { relatedTarget: outsideButton });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /add comment/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: /kind/i })).not.toBeInTheDocument();
    });

    outsideButton.remove();
  });

  it.each([
    ["multiple relays are selected", multiRelays],
    ["relay is disconnected", disconnectedRelays],
    ["relay is connected but not toggled active", connectedInactiveRelays],
  ])("blocks root task submit when %s", (_scenario, testRelays) => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={testRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend now" },
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create task/i })).toHaveTextContent("Select space");
  });

  it("allows submit when a single active relay exists even if stored relay selection is empty", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);
    const singleRelay = [{
      id: "relay-a",
      name: "Relay A",
      url: "wss://relay-a.example.com",
      icon: "R",
      isActive: true,
      connectionStatus: "connected" as const,
    }];
    const draftStorageKey = "task-composer-single-relay-default";
    localStorage.setItem(draftStorageKey, JSON.stringify({
      selectedRelays: [],
    }));

    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={singleRelay}
        channels={channels}
        people={people}
        onCancel={() => {}}
        draftStorageKey={draftStorageKey}
      />
    );

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "Ship #backend now" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Ship #backend now",
        ["backend"],
        ["relay-a"],
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

    fireEvent.change(getTaskComposerInput(), {
      target: { value: "#backend @alice@example.com" },
    });

    expect(screen.getByRole("button", { name: /create task/i })).toHaveTextContent("Write message");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

    fireEvent.change(getTaskComposerInput(), {
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

    fireEvent.change(getTaskComposerInput(), {
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
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

    const textarea = getTaskComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship #backend now" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Task creation failed. Please try again.");
    });
    expect(textarea.value).toBe("Ship #backend now");
  });

  it("allows root-level comment submit when a tag and postable relay are present", () => {
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
    fireEvent.change(getCommentComposerInput(), {
      target: { value: "Looks good #backend" },
    });

    expect(screen.queryByText("Select a task to reply to")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).not.toBeDisabled();
  });

  it("submits root-level comments with only the writable relay subset", async () => {
    const onSubmit = vi.fn(async () => successfulCreateResult);

    render(
      <TaskComposer
        onSubmit={onSubmit}
        relays={mixedWritableRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(getCommentComposerInput(), {
      target: { value: "Looks good #backend" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add comment/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Looks good #backend",
        ["backend"],
        ["relay-a"],
        "comment",
        undefined,
        undefined,
        undefined,
        [],
        undefined,
        [],
        undefined
      );
    });
  });

  it("blocks root-level comments when no writable relay is selected", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={readOnlyRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(getCommentComposerInput(), {
      target: { value: "Looks good #backend" },
    });

    expect(screen.getByRole("button", { name: /add comment/i })).toHaveTextContent("Select space");
  });

  it("uses the comment-specific relay warning when no postable relay is selected", () => {
    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={disconnectedRelays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /kind/i }), {
      target: { value: "comment" },
    });
    fireEvent.change(getCommentComposerInput(), {
      target: { value: "Looks good #backend" },
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).toHaveTextContent("Select space");
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
    fireEvent.change(getCommentComposerInput(), {
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
            explicitMentionPubkeys: [alicePubkey],
          },
        }}
      />
    );

    expect(screen.getByDisplayValue("Recovered content")).toBeInTheDocument();
    expect(getHashtagChip("backend")).toBeInTheDocument();
    expect(getMentionChip(alicePubkey)).toBeInTheDocument();
  });

  it("restores populated desktop date and time controls from compose state", async () => {
    const dueDate = new Date("2026-03-19T00:00:00.000Z");
    const dueTime = "12:11";

    render(
      <TaskComposer
        onSubmit={() => successfulCreateResult}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        composeRestoreRequest={{
          id: 2,
          state: {
            content: "Recovered content #backend",
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
      expect(screen.getByRole("button", { name: format(dueDate, "MMM d, yyyy") })).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(dueTime)).toBeInTheDocument();
  });
});
