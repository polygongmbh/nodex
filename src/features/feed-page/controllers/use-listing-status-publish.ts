import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { TranslateFn } from "@/lib/i18n/translate";
import { buildImetaTag } from "@/lib/attachments";
import { getListingReplaceableKey } from "@/domain/listings/listing-identity";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { buildNip99PublishTags } from "@/infrastructure/nostr/nip99-metadata";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Nip99ListingStatus, Task } from "@/types";
import type { Person } from "@/types/person";

interface PublishResult {
  success: boolean;
}

interface UseListingStatusPublishOptions {
  allTasks: Task[];
  currentUser: Person | undefined;
  guardInteraction: (mode: "post" | "modify") => boolean;
  publishEvent: (
    kind: number,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<PublishResult>;
  resolveTaskOriginRelay: (taskId: string) => { relayUrls: string[] };
  setLocalTasks: Dispatch<SetStateAction<Task[]>>;
  t: TranslateFn;
}

const LISTING_EVENT_KIND = NostrEventKind.ClassifiedListing;

export function useListingStatusPublish({
  allTasks,
  currentUser,
  guardInteraction,
  publishEvent,
  resolveTaskOriginRelay,
  setLocalTasks,
  t,
}: UseListingStatusPublishOptions) {
  const handleListingStatusChange = useCallback((taskId: string, status: Nip99ListingStatus) => {
    if (guardInteraction("modify")) return;

    const existing = allTasks.find((task) => task.id === taskId);
    if (!existing?.feedMessageType || !existing.nip99) return;
    if (!currentUser?.id || currentUser.id.toLowerCase() !== existing.author.id.toLowerCase()) return;

    const previousStatus = existing.nip99.status;
    const replaceableKey = getListingReplaceableKey(existing, LISTING_EVENT_KIND);
    if (!replaceableKey) return;

    setLocalTasks((prev) => {
      const nextNip99 = { ...(existing.nip99 || {}), status };
      const matchesListing = (task: Task) =>
        task.id === taskId ||
        getListingReplaceableKey(task, LISTING_EVENT_KIND) === replaceableKey;
      let touched = false;
      const next = prev.map((task) => {
        if (!matchesListing(task)) return task;
        touched = true;
        return { ...task, nip99: nextNip99, lastEditedAt: new Date() };
      });
      if (touched) return next;
      return [{ ...existing, nip99: nextNip99, lastEditedAt: new Date() }, ...next];
    });

    if (!isNostrEventId(existing.id)) return;
    const { relayUrls } = resolveTaskOriginRelay(existing.id);
    if (relayUrls.length === 0) {
      toast.error(t("toasts.errors.publishListingStatusFailed"));
      return;
    }

    const publishTags = buildNip99PublishTags({
      metadata: { ...existing.nip99, status },
      feedMessageType: existing.feedMessageType,
      hashtags: existing.tags,
      mentionPubkeys: (existing.mentions || []).filter((mention) => /^[a-f0-9]{64}$/i.test(mention)),
      attachmentTags: (existing.attachments || [])
        .map((attachment) => buildImetaTag(attachment))
        .filter((tag) => tag.length > 0),
      fallbackTitle: existing.content.slice(0, 80),
      identifierSeed: existing.nip99.identifier || existing.id,
      statusOverride: status,
      locationGeohash: existing.locationGeohash,
    });

    void publishEvent(
      NostrEventKind.ClassifiedListing,
      existing.content,
      publishTags,
      undefined,
      relayUrls.slice(0, 1)
    ).then((result) => {
      if (result.success) return;
      toast.error(t("toasts.errors.publishListingStatusFailed"));
      setLocalTasks((prev) => prev.map((task) => {
        const taskReplaceableKey = getListingReplaceableKey(task, LISTING_EVENT_KIND);
        if (taskReplaceableKey !== replaceableKey) return task;
        return {
          ...task,
          nip99: { ...(task.nip99 || {}), status: previousStatus || "active" },
          lastEditedAt: new Date(),
        };
      }));
    });
  }, [
    allTasks,
    currentUser,
    guardInteraction,
    publishEvent,
    resolveTaskOriginRelay,
    setLocalTasks,
    t,
  ]);

  return { handleListingStatusChange };
}
