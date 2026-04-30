import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
  type FailedPublishDraft,
} from "@/infrastructure/preferences/failed-publish-drafts-storage";
import { useFailedPublishDraftsStore } from "./failed-publish-drafts-store";

const sampleDraft: FailedPublishDraft = {
  id: "draft-1",
  author: {
    id: "pubkey-1",
    name: "alice",
    displayName: "Alice",
    isSelected: false,
  },
  content: "Ship #go task",
  tags: ["go"],
  relayIds: ["relay-a"],
  relayUrls: ["wss://relay.a"],
  taskType: "task",
  createdAt: "2026-02-18T12:00:00.000Z",
  dateType: "due",
  dueDate: "2026-02-20T00:00:00.000Z",
  dueTime: "10:30",
  initialStatus: { type: "open" },
  mentionPubkeys: ["f".repeat(64)],
  assigneePubkeys: ["f".repeat(64)],
  priority: 2,
  attachments: [
    {
      url: "https://cdn.example.com/report.pdf",
      mimeType: "application/pdf",
      size: 512,
    },
  ],
  publishKind: NostrEventKind.Task,
  publishTags: [["t", "go"]],
};

describe("failedPublishDraftsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useFailedPublishDraftsStore.setState({ failedPublishDrafts: [] });
  });

  it("setFailedPublishDrafts replaces with direct value and persists to localStorage", () => {
    useFailedPublishDraftsStore.getState().setFailedPublishDrafts([sampleDraft]);
    expect(useFailedPublishDraftsStore.getState().failedPublishDrafts).toEqual([sampleDraft]);
    const raw = localStorage.getItem(FAILED_PUBLISH_DRAFTS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.failedPublishDrafts).toEqual([sampleDraft]);
  });

  it("setFailedPublishDrafts accepts a functional updater", () => {
    const second = { ...sampleDraft, id: "draft-2" };
    useFailedPublishDraftsStore.getState().setFailedPublishDrafts([sampleDraft]);
    useFailedPublishDraftsStore.getState().setFailedPublishDrafts((prev) => [...prev, second]);
    expect(useFailedPublishDraftsStore.getState().failedPublishDrafts).toHaveLength(2);
    expect(useFailedPublishDraftsStore.getState().failedPublishDrafts[1].id).toBe("draft-2");
  });
});
