import type { SetStateAction } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
  failedPublishDraftsSchema,
  type FailedPublishDraft,
} from "@/infrastructure/preferences/failed-publish-drafts-storage";

interface FailedPublishDraftsState {
  failedPublishDrafts: FailedPublishDraft[];
  setFailedPublishDrafts: (updater: SetStateAction<FailedPublishDraft[]>) => void;
}

function applyUpdater<T>(prev: T, updater: SetStateAction<T>): T {
  return typeof updater === "function"
    ? (updater as (prev: T) => T)(prev)
    : updater;
}

export const useFailedPublishDraftsStore = create<FailedPublishDraftsState>()(
  persist(
    (set) => ({
      failedPublishDrafts: [],
      setFailedPublishDrafts: (updater) =>
        set((state) => ({
          failedPublishDrafts: applyUpdater(state.failedPublishDrafts, updater),
        })),
    }),
    {
      name: FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
      partialize: (state) => ({
        failedPublishDrafts: state.failedPublishDrafts,
      }),
      merge: (persisted, current) => {
        const stored = persisted as { failedPublishDrafts?: unknown } | undefined;
        const parsed = failedPublishDraftsSchema.safeParse(stored?.failedPublishDrafts ?? []);
        return {
          ...current,
          failedPublishDrafts: parsed.success ? parsed.data : [],
        };
      },
    }
  )
);
