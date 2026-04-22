import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskComposer, type TaskComposerFormData } from "./TaskComposer";
import {
  TaskComposerRuntimeProvider,
} from "./task-composer-runtime";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";
import type { Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const baseChannels: Channel[] = [
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "design", name: "design", filterState: "neutral" },
];

const alicePubkey = "f".repeat(64);
const basePeople: Person[] = [
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

const uploadConfiguredSpy = vi.spyOn(attachmentUpload, "isAttachmentUploadConfigured");
const uploadAttachmentSpy = vi.spyOn(attachmentUpload, "uploadAttachment");

const uploadedAttachment = {
  url: "https://cdn.example.com/uploaded.png",
  mimeType: "image/png",
  size: 1234,
  name: "uploaded.png",
} satisfies Awaited<ReturnType<typeof attachmentUpload.uploadAttachment>>;

function buildRuntimeValue({
  channels = baseChannels,
  people = basePeople,
  mentionablePeople = people,
}: {
  channels?: Channel[];
  people?: Person[];
  mentionablePeople?: Person[];
} = {}) {
  return {
    environment: {
      relays: [] as Relay[],
      channels,
      people,
      mentionablePeople,
      includedChannels: channels
        .filter((channel) => channel.filterState === "included")
        .map((channel) => channel.name.trim().toLowerCase()),
      selectedPeoplePubkeys: people
        .filter((person) => person.isSelected)
        .map((person) => person.id.trim().toLowerCase()),
    },
    draftStorageKey: COMPOSE_DRAFT_STORAGE_KEY,
  };
}

function renderComposer({
  onSubmit = vi.fn(),
  channels,
  people,
  mentionablePeople,
  canCreateContent = true,
  getUploadAuthHeader = vi.fn(async () => null),
  ...props
}: Partial<ComponentProps<typeof TaskComposer>> & {
  channels?: Channel[];
  people?: Person[];
  mentionablePeople?: Person[];
} = {}) {
  const renderResult = render(
    <TaskComposerRuntimeProvider
      value={buildRuntimeValue({ channels, people, mentionablePeople })}
    >
      <TaskComposer
        onSubmit={onSubmit}
        onCancel={() => {}}
        canCreateContent={canCreateContent}
        getUploadAuthHeader={getUploadAuthHeader}
        {...props}
      />
    </TaskComposerRuntimeProvider>
  );

  return { onSubmit, ...renderResult };
}

function getComposerInput(kind: "task" | "comment" | "offer" | "request" = "task") {
  void kind;
  const input = document.querySelector<HTMLTextAreaElement>('textarea[data-onboarding="compose-input"]');
  if (!input) {
    throw new Error("Expected composer textarea");
  }
  return input;
}

describe("TaskComposer", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.dismiss).mockClear();
    uploadConfiguredSpy.mockReturnValue(true);
    uploadAttachmentSpy.mockReset();
    uploadAttachmentSpy.mockResolvedValue(uploadedAttachment);
    localStorage.clear();
  });

  it("submits only composer-entered task fields", () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    fireEvent.change(getComposerInput(), {
      target: { value: "Ship #backend now" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as TaskComposerFormData;
    expect(data).toMatchObject({
      content: "Ship #backend now",
      tags: ["backend"],
      taskType: "task",
      dateType: "due",
      explicitMentionPubkeys: [],
      mentionIdentifiers: [],
      attachments: [],
    });
    expect(data).not.toHaveProperty("relays");
  });

  it("submits the visible mention chips as the authoritative mention set", () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Check with @ali #backend", selectionStart: 15 },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as TaskComposerFormData;
    expect(data.mentionIdentifiers).toEqual(["alice@example.com"]);
    expect(data.explicitMentionPubkeys).toEqual([]);
    expect(data.content).toContain("@alice@example.com");
  });

  it("submits request-specific fields from request mode", () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit, allowFeedMessageTypes: true });

    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    fireEvent.change(getComposerInput("request"), {
      target: { value: "Need a designer #design" },
    });
    fireEvent.change(screen.getByLabelText("Listing title"), {
      target: { value: "Need designer for mobile UI" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post request/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      content: "Need a designer #design",
      tags: ["design"],
      taskType: "request",
      nip99: expect.objectContaining({
        title: "Need designer for mobile UI",
        status: "active",
      }),
    }));
  });

  it("restores draft content and kind from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "#persisted hello",
      messageType: "comment",
    }));

    renderComposer();

    expect(getComposerInput("comment")).toHaveValue("#persisted hello");
    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument();
  });

  it("focuses the composer on mount by default in non-adaptive mode", () => {
    renderComposer();

    expect(getComposerInput()).toHaveFocus();
  });

  it("does not focus on mount when focusOnMount is false", () => {
    render(<button type="button">Before</button>);
    const beforeButton = screen.getByRole("button", { name: "Before" });
    beforeButton.focus();

    renderComposer({ focusOnMount: false });

    expect(getComposerInput()).not.toHaveFocus();
    expect(beforeButton).toHaveFocus();
  });

  it("restores the full draft payload from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "",
      messageType: "task",
      savedAt: new Date().toISOString(),
      explicitTagNames: ["backend"],
      explicitMentionPubkeys: [alicePubkey],
      taskDate: {
        dueDate: "2026-04-01T10:00:00.000Z",
        dueTime: "10:00",
        dateType: "start",
      },
      priority: 80,
      locationGeohash: "u33db",
    }));

    renderComposer();

    expect(getComposerInput()).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /priority/i })).toHaveValue("4");
    expect(screen.getByRole("combobox", { name: /date type/i })).toHaveValue("start");
    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByLabelText(/geohash/i)).toHaveValue("u33db");
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="backend"]')).not.toBeNull();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).not.toBeNull();
  });

  it("drops stale restored tags, mentions, date, and location from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "keep this text",
      messageType: "task",
      savedAt: "2026-04-01T10:00:00.000Z",
      explicitTagNames: ["backend"],
      explicitMentionPubkeys: [alicePubkey],
      taskDate: {
        dueDate: "2026-04-06T10:00:00.000Z",
        dueTime: "10:00",
        dateType: "start",
      },
      locationGeohash: "u33db",
      priority: 80,
    }));

    renderComposer();

    expect(getComposerInput()).toHaveValue("keep this text");
    expect(screen.getByRole("combobox", { name: /priority/i })).toHaveValue("4");
    expect(screen.getByRole("combobox", { name: /date type/i })).toHaveValue("due");
    expect(screen.queryByDisplayValue("10:00")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/geohash/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="backend"]')).toBeNull();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).toBeNull();
  });

  it("restores listing metadata and attachments from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "Need a designer #design",
      messageType: "request",
      savedAt: new Date().toISOString(),
      nip99: {
        title: "Need designer for mobile UI",
        summary: "Short summary",
        status: "active",
      },
      attachments: [
        {
          url: "https://cdn.example.com/restored.png",
          mimeType: "image/png",
          name: "restored.png",
          alt: "Restored attachment",
        },
      ],
      explicitTagNames: ["design"],
      explicitMentionPubkeys: [alicePubkey],
    }));

    renderComposer({ allowFeedMessageTypes: true });

    expect(getComposerInput("request")).toHaveValue("Need a designer #design");
    expect(screen.getByLabelText("Listing title")).toHaveValue("Need designer for mobile UI");
    expect(screen.getByDisplayValue("Short summary")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Restored attachment")).toBeInTheDocument();
    expect(screen.getByText("restored.png")).toBeInTheDocument();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).not.toBeNull();
  });

  it("accepts hashtag autocomplete with Enter", () => {
    renderComposer();

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "#ba", selectionStart: 3 },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("#backend ");
  });

  it("accepts mention autocomplete with Enter", () => {
    renderComposer();

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "@ali", selectionStart: 4 },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("@alice@example.com ");
  });

  it("queues an uploaded attachment and includes it in submit data", async () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["image-bytes"], "picked.png", { type: "image/png" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadAttachmentSpy).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ getAuthHeader: expect.any(Function) })
      );
    });

    fireEvent.change(getComposerInput(), { target: { value: "Ship #backend now" } });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [
        expect.objectContaining({
          url: "https://cdn.example.com/uploaded.png",
          mimeType: "image/png",
          name: "uploaded.png",
        }),
      ],
    }));
  });

  it("shows request and offer actions only when feed message types are enabled", () => {
    const { rerender } = render(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer onSubmit={() => {}} onCancel={() => {}} />
      </TaskComposerRuntimeProvider>
    );

    expect(screen.queryByRole("button", { name: "Offer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request" })).not.toBeInTheDocument();

    rerender(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer onSubmit={() => {}} onCancel={() => {}} allowFeedMessageTypes />
      </TaskComposerRuntimeProvider>
    );

    expect(screen.getByRole("button", { name: "Offer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request" })).toBeInTheDocument();
  });

  it("shows the sign-in action when the user is not authenticated", () => {
    renderComposer({ canCreateContent: false });

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create task/i })).not.toBeInTheDocument();
  });
});
