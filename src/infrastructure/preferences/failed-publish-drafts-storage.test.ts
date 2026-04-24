import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
  loadFailedPublishDrafts,
  saveFailedPublishDrafts,
  type FailedPublishDraft,
} from "./failed-publish-drafts-storage";

const sampleDraft: FailedPublishDraft = {
  id: "draft-1",
  author: {
    id: "pubkey-1",
    name: "alice",
    displayName: "Alice",
    isOnline: true,
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

describe("failed publish drafts persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty array for missing or invalid storage payloads", () => {
    expect(loadFailedPublishDrafts()).toEqual([]);
    localStorage.setItem(FAILED_PUBLISH_DRAFTS_STORAGE_KEY, JSON.stringify({ invalid: true }));
    expect(loadFailedPublishDrafts()).toEqual([]);
  });

  it("saves and loads drafts", () => {
    saveFailedPublishDrafts([sampleDraft]);
    expect(localStorage.getItem(FAILED_PUBLISH_DRAFTS_STORAGE_KEY)).toBeTruthy();
    expect(loadFailedPublishDrafts()).toEqual([sampleDraft]);
  });
});
