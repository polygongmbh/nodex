import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskComposer, type TaskComposerFormData } from "./TaskComposer";
import { TaskComposerRuntimeProvider } from "./task-composer-runtime";
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
  draftStorageKey,
}: {
  channels?: Channel[];
  people?: Person[];
  mentionablePeople?: Person[];
  draftStorageKey?: string;
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
    draftStorageKey,
  };
}

function renderComposer({
  onSubmit = vi.fn(),
  channels,
  people,
  mentionablePeople,
  draftStorageKey,
  canCreateContent = true,
  getUploadAuthHeader = vi.fn(async () => null),
  ...props
}: Partial<ComponentProps<typeof TaskComposer>> & {
  channels?: Channel[];
  people?: Person[];
  mentionablePeople?: Person[];
  draftStorageKey?: string;
} = {}) {
  render(
    <TaskComposerRuntimeProvider
      value={buildRuntimeValue({ channels, people, mentionablePeople, draftStorageKey })}
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

  return { onSubmit };
}

function getComposerInput(kind: "task" | "comment" | "offer" | "request" = "task") {
  const labels = {
    task: /what's up\? use #channels and @mentions/i,
    comment: /add your comment with #channels and @mentions/i,
    offer: /post an offer with #channels and @mentions/i,
    request: /post a request with #channels and @mentions/i,
  };
  return screen.getByRole("textbox", { name: labels[kind] });
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

  it("restores draft content and kind from the provided storage key", () => {
    localStorage.setItem("composer-draft", JSON.stringify({
      content: "#persisted hello",
      messageType: "comment",
    }));

    renderComposer({ draftStorageKey: "composer-draft" });

    expect(getComposerInput("comment")).toHaveValue("#persisted hello");
    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument();
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
