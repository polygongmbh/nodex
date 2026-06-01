import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskComposer, type TaskComposerFormData, deriveTitledPostTitleFromContent } from "./TaskComposer";
import {
  TaskComposerRuntimeProvider,
} from "./task-composer-runtime";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import * as attachmentUpload from "@/lib/nostr/nip96-attachment-upload";
import type { Channel, Relay } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { toast } from "sonner";
import { makePerson } from "@/test/fixtures";

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
const basePeople: SelectablePerson[] = [
  makePerson({
    pubkey: alicePubkey,
    name: "alice",
    displayName: "Alice",
    nip05: "alice@example.com",
    avatar: "",
  }),
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
  people?: SelectablePerson[];
  mentionablePeople?: SelectablePerson[];
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
        .map((person) => person.pubkey.trim().toLowerCase()),
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
  people?: SelectablePerson[];
  mentionablePeople?: SelectablePerson[];
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

function getComposerInput(kind: "task" | "comment" | "listing" = "task") {
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
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as TaskComposerFormData;
    expect(data).toMatchObject({
      content: "Ship #backend now",
      tags: ["backend"],
      postType: "task",
      dates: [],
      explicitMentionPubkeys: [],
      mentionIdentifiers: [],
      attachments: [],
    });
    expect(data).not.toHaveProperty("relays");
  });

  it("keeps the draft intact when the publish is rejected", async () => {
    let resolveSubmit: (value: { ok: boolean }) => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<{ ok: boolean }>((resolve) => { resolveSubmit = resolve; })
    );
    renderComposer({ onSubmit });

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Important draft #backend" } });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Content stays visible while the publish is in flight.
    expect(getComposerInput().value).toBe("Important draft #backend");
    // Submit button is disabled to prevent double-submit.
    expect(screen.getByTestId("composer-primary-action")).toBeDisabled();

    resolveSubmit({ ok: false });
    await waitFor(() => {
      expect(screen.getByTestId("composer-primary-action")).not.toBeDisabled();
    });
    // Content is still there after the failure resolves.
    expect(getComposerInput().value).toBe("Important draft #backend");
  });

  it("clears the composer after a successful publish", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }));
    renderComposer({ onSubmit });

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Will succeed #backend" } });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    await waitFor(() => {
      expect(getComposerInput().value).toBe("");
    });
  });

  it("submits the visible mention chips as the authoritative mention set", () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });

    const textarea = getComposerInput() as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Check with @ali #backend", selectionStart: 15 },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as TaskComposerFormData;
    expect(data.mentionIdentifiers).toEqual(["alice@example.com"]);
    expect(data.explicitMentionPubkeys).toEqual([]);
    expect(data.content).toContain("@alice@example.com");
  });

  it("submits listing-specific fields from listing mode", () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit, allowedPostTypes: ["task", "comment", "listing", "event"] });

    fireEvent.click(screen.getByRole("button", { name: "Listing" }));
    fireEvent.change(getComposerInput("listing"), {
      target: { value: "Need a designer #design" },
    });
    fireEvent.change(screen.getByTestId("titled-post-title"), {
      target: { value: "Need designer for mobile UI" },
    });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      content: "Need a designer #design",
      tags: ["design"],
      postType: "listing",
      nip99: expect.objectContaining({ status: "active" }),
      titledPost: expect.objectContaining({ title: "Need designer for mobile UI" }),
    }));
  });

  it("restores draft content and kind from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "persisted hello #note",
      postType: "comment",
      savedAt: new Date().toISOString(),
    }));

    renderComposer();

    expect(getComposerInput("comment")).toHaveValue("persisted hello #note");
    expect(screen.getByTestId("composer-primary-action")).toBeInTheDocument();
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

  it("restores the full draft payload from the shared draft key", async () => {
    const onSubmit = vi.fn();
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "ship restored task",
      postType: "task",
      savedAt: new Date().toISOString(),
      explicitTagNames: ["backend"],
      explicitMentionPubkeys: [alicePubkey],
      dates: [{ datetime: "2026-04-01T10:00:00.000Z", type: "start" }],
      priority: 80,
      locationGeohash: "u33db",
    }));

    renderComposer({ onSubmit });

    expect(getComposerInput()).toHaveValue("ship restored task");
    const persistedMoment = new Date("2026-04-01T10:00:00.000Z");
    expect(screen.getByTestId("task-time-input-hours")).toHaveValue(String(persistedMoment.getHours()).padStart(2, "0"));
    expect(screen.getByTestId("task-time-input-minutes")).toHaveValue(String(persistedMoment.getMinutes()).padStart(2, "0"));
    expect(screen.getByTestId("task-composer-geohash")).toHaveValue("u33db");
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="backend"]')).not.toBeNull();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).not.toBeNull();

    fireEvent.click(screen.getByTestId("composer-primary-action"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        priority: 80,
        dates: [{ datetime: new Date("2026-04-01T10:00:00.000Z"), type: "start" }],
        locationGeohash: "u33db",
        tags: expect.arrayContaining(["backend"]),
        explicitMentionPubkeys: [alicePubkey],
      }));
    });
  });

  it("keeps mention and hashtag chips out of the sequential tab order", () => {
    renderComposer();
    fireEvent.change(getComposerInput(), {
      target: { value: "Check with @alice@example.com #backend" },
    });

    const hashtagChip = document.querySelector<HTMLButtonElement>('[data-chip-kind="hashtag"][data-chip-value="backend"]');
    const mentionChip = document.querySelector<HTMLButtonElement>('[data-chip-kind="mention"][data-chip-value="alice@example.com"]');

    expect(hashtagChip).not.toBeNull();
    expect(mentionChip).not.toBeNull();
    expect(hashtagChip).toHaveAttribute("tabindex", "-1");
    expect(mentionChip).toHaveAttribute("tabindex", "-1");
  });

  it("keeps the hidden desktop kind select out of the sequential tab order", () => {
    renderComposer();

    expect(screen.getByTestId("task-composer-kind")).toHaveAttribute("tabindex", "-1");
  });

  it("restores the recompose banner from the persisted draft on remount", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "second pass at the post",
      postType: "task",
      savedAt: new Date().toISOString(),
      recomposeOf: {
        eventId: "evt-1",
        originalKind: 1,
        relayIds: ["relay-one"],
        contentPreview: "first pass",
      },
    }));

    renderComposer();

    expect(screen.getByTestId("task-composer-recompose-banner")).toBeInTheDocument();
    expect(getComposerInput()).toHaveValue("second pass at the post");
  });

  it("clears the recompose banner across remounts after a discard", async () => {
    const { unmount } = renderComposer({
      composeRestoreRequest: {
        id: 1,
        state: {
          content: "second pass at the post",
          postType: "task",
          dates: [],
          titledPost: {},
          nip99: {},
          attachments: [],
          explicitTagNames: [],
          explicitMentionPubkeys: [],
          recomposeOf: {
            eventId: "evt-1",
            originalKind: 1,
            relayIds: ["relay-one"],
            contentPreview: "first pass",
          },
        },
      },
    });

    expect(screen.getByTestId("task-composer-recompose-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("task-composer-recompose-banner")).not.toBeInTheDocument();
    });

    unmount();
    renderComposer();

    expect(screen.queryByTestId("task-composer-recompose-banner")).not.toBeInTheDocument();
    expect(getComposerInput()).toHaveValue("");
  });

  it("does not restore drafts without text, attachments, or NIP-99 content", () => {
    // Auxiliary state alone (date/priority/tags/mentions/location) must not
    // leak from a previous composer context (e.g. the calendar view) into a
    // fresh composer elsewhere.
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "",
      postType: "task",
      savedAt: new Date().toISOString(),
      explicitTagNames: ["backend"],
      explicitMentionPubkeys: [alicePubkey],
      dates: [{ datetime: "2026-04-01T10:00:00.000Z", type: "start" }],
      priority: 80,
      locationGeohash: "u33db",
    }));

    renderComposer();

    expect(getComposerInput()).toHaveValue("");
    expect(screen.queryByDisplayValue("10:00")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/geohash/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="backend"]')).toBeNull();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).toBeNull();
  });

  it("clears the persisted draft when the composer is emptied", async () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "draft text",
      postType: "task",
      savedAt: new Date().toISOString(),
    }));

    renderComposer();

    const textarea = getComposerInput();
    expect(textarea).toHaveValue("draft text");

    fireEvent.change(textarea, { target: { value: "" } });

    await waitFor(() => {
      expect(localStorage.getItem(COMPOSE_DRAFT_STORAGE_KEY)).toBeNull();
    });
  });

  it("drops stale restored tags, mentions, date, and location from the shared draft key", async () => {
    const onSubmit = vi.fn();
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "keep this text",
      postType: "task",
      savedAt: "2026-04-01T10:00:00.000Z",
      explicitTagNames: ["backend"],
      explicitMentionPubkeys: [alicePubkey],
      dates: [{ date: "2026-04-06T10:00:00.000Z", time: "10:00", type: "start" }],
      locationGeohash: "u33db",
      priority: 80,
    }));

    renderComposer({ onSubmit });

    expect(getComposerInput()).toHaveValue("keep this text");
    expect(screen.queryByDisplayValue("10:00")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/geohash/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="backend"]')).toBeNull();
    expect(document.querySelector(`[data-chip-kind="mention"][data-chip-value="${alicePubkey}"]`)).toBeNull();

    fireEvent.change(getComposerInput(), {
      target: { value: "keep this text #design" },
    });
    fireEvent.click(screen.getByTestId("composer-primary-action"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        priority: 80,
        dates: [],
        tags: ["design"],
      }));
      expect(onSubmit).toHaveBeenCalledWith(expect.not.objectContaining({
        locationGeohash: "u33db",
        tags: expect.arrayContaining(["backend"]),
        explicitMentionPubkeys: [alicePubkey],
      }));
    });
  });

  it("restores listing metadata and attachments from the shared draft key", () => {
    localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify({
      content: "Need a designer #design",
      postType: "listing",
      savedAt: new Date().toISOString(),
      nip99: { status: "active" },
      titledPost: {
        title: "Need designer for mobile UI",
        summary: "Short summary",
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

    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });

    expect(getComposerInput("listing")).toHaveValue("Need a designer #design");
    expect(screen.getByTestId("titled-post-title")).toHaveValue("Need designer for mobile UI");
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
    fireEvent.click(screen.getByTestId("composer-primary-action"));

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

  it("shows listing action only when feed message types are enabled", () => {
    const { rerender } = render(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer onSubmit={() => {}} onCancel={() => {}} />
      </TaskComposerRuntimeProvider>
    );

    expect(screen.queryByRole("button", { name: "Listing" })).not.toBeInTheDocument();

    rerender(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer onSubmit={() => {}} onCancel={() => {}} allowedPostTypes={["task", "comment", "listing", "event"]} />
      </TaskComposerRuntimeProvider>
    );

    expect(screen.getByRole("button", { name: "Listing" })).toBeInTheDocument();
  });

  it("shows the sign-in action when the user is not authenticated", () => {
    renderComposer({ canCreateContent: false });

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId("composer-primary-action")).not.toBeInTheDocument();
  });

  it("keeps inherited tags that were previously sidebar-active when scope focus clears the filter", () => {
    const filterSyncWithFoo = {
      filterTagNames: ["foo"],
      filterMentionPubkeys: [],
      onRemoveFilterTag: vi.fn(),
      onRemoveFilterMention: vi.fn(),
    };
    const filterSyncEmpty = {
      filterTagNames: [] as string[],
      filterMentionPubkeys: [] as string[],
      onRemoveFilterTag: vi.fn(),
      onRemoveFilterMention: vi.fn(),
    };

    const { rerender } = render(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer
          onSubmit={() => {}}
          onCancel={() => {}}
          filterSync={filterSyncWithFoo}
        />
      </TaskComposerRuntimeProvider>
    );

    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="foo"]')).not.toBeNull();

    rerender(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer
          onSubmit={() => {}}
          onCancel={() => {}}
          filterSync={filterSyncWithFoo}
          inheritedTagNames={["foo", "bar"]}
        />
      </TaskComposerRuntimeProvider>
    );

    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="foo"]')).not.toBeNull();
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="bar"]')).not.toBeNull();

    rerender(
      <TaskComposerRuntimeProvider value={buildRuntimeValue()}>
        <TaskComposer
          onSubmit={() => {}}
          onCancel={() => {}}
          filterSync={filterSyncEmpty}
          inheritedTagNames={["foo", "bar"]}
        />
      </TaskComposerRuntimeProvider>
    );

    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="foo"]')).not.toBeNull();
    expect(document.querySelector('[data-chip-kind="hashtag"][data-chip-value="bar"]')).not.toBeNull();
  });
});

describe("deriveTitledPostTitleFromContent", () => {
  it("returns undefined for empty content", () => {
    expect(deriveTitledPostTitleFromContent("")).toBeUndefined();
    expect(deriveTitledPostTitleFromContent("   \n  ")).toBeUndefined();
  });

  it("uses only the first non-empty line", () => {
    expect(deriveTitledPostTitleFromContent("Team standup\n\nWeekly sync notes here"))
      .toBe("Team standup");
    expect(deriveTitledPostTitleFromContent("\n\nHello\nlater stuff"))
      .toBe("Hello");
  });

  it("strips hashtags and mentions from the first line", () => {
    expect(deriveTitledPostTitleFromContent("Ship #backend now")).toBe("Ship now");
  });

  it("truncates long first lines word-safely", () => {
    const longLine = "word ".repeat(40).trim();
    const result = deriveTitledPostTitleFromContent(longLine);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(80);
    expect(result!.endsWith("word")).toBe(true);
  });
});

describe("TaskComposer auto-fill", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    localStorage.clear();
  });

  it("auto-fills listing title from the first line of content", async () => {
    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });
    fireEvent.click(screen.getByRole("button", { name: "Listing" }));
    fireEvent.change(getComposerInput("listing"), {
      target: { value: "First line title\n\nBody text continues here." },
    });
    await waitFor(() => {
      expect(screen.getByTestId("titled-post-title")).toHaveValue("First line title");
    });
    expect(screen.getByTestId("titled-post-summary")).toHaveValue("");
  });

  it("preserves a manually-edited listing title across content changes", async () => {
    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });
    fireEvent.click(screen.getByRole("button", { name: "Listing" }));
    fireEvent.change(getComposerInput("listing"), {
      target: { value: "Initial title\n\nBody" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("titled-post-title")).toHaveValue("Initial title");
    });
    fireEvent.change(screen.getByTestId("titled-post-title"), {
      target: { value: "User-curated title" },
    });
    fireEvent.change(getComposerInput("listing"), {
      target: { value: "Different first line\n\nBody" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("titled-post-title")).toHaveValue("User-curated title");
  });

  it("auto-fills event title from the first line of content", async () => {
    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });
    fireEvent.click(screen.getByRole("button", { name: "Event" }));
    fireEvent.change(getComposerInput(), {
      target: { value: "Team standup\n\nNotes" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("titled-post-title")).toHaveValue("Team standup");
    });
  });

  it("preserves a manually-edited event title across content changes", async () => {
    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });
    fireEvent.click(screen.getByRole("button", { name: "Event" }));
    fireEvent.change(getComposerInput(), {
      target: { value: "Initial title\n\nBody" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("titled-post-title")).toHaveValue("Initial title");
    });
    fireEvent.change(screen.getByTestId("titled-post-title"), {
      target: { value: "User-curated event" },
    });
    fireEvent.change(getComposerInput(), {
      target: { value: "Different first line\n\nBody" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("titled-post-title")).toHaveValue("User-curated event");
  });
});

describe("TaskComposer Event mode", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    localStorage.clear();
  });

  it("renders Start and End date controls in Event mode", () => {
    renderComposer({ allowedPostTypes: ["event", "task", "comment", "listing"] });
    expect(screen.getByRole("button", { name: "Start date" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End date" })).toBeInTheDocument();
  });

  it("initializes in the first allowed type (event)", () => {
    renderComposer({ allowedPostTypes: ["event", "task", "comment", "listing"] });
    expect(screen.getByRole("button", { name: /create event/i })).toBeInTheDocument();
  });

  it("initializes in the first allowed type (task)", () => {
    renderComposer({ allowedPostTypes: ["task", "comment", "listing", "event"] });
    expect(screen.getByTestId("composer-primary-action")).toBeInTheDocument();
  });

  it("locks to Event when allowedPostTypes is just ['event']", () => {
    renderComposer({ allowedPostTypes: ["event"] });
    expect(screen.getByRole("button", { name: /create event/i })).toBeInTheDocument();
  });
});
