import { useMemo, useState } from "react";
import type { Task } from "@/types";
import { collectTaskPreviewMediaItems, type TaskPreviewMediaItem } from "@/lib/task-media";

interface UseTaskMediaPreviewResult {
  mediaItems: TaskPreviewMediaItem[];
  activeMediaIndex: number | null;
  activeMediaItem: TaskPreviewMediaItem | null;
  activePostMediaIndex: number;
  activePostMediaCount: number;
  openTaskMedia: (taskId: string, url: string) => void;
  goToPreviousMedia: () => void;
  goToNextMedia: () => void;
  goToPreviousPost: () => void;
  goToNextPost: () => void;
  closeMediaPreview: () => void;
}

const normalizeUrl = (value: string): string => value.trim().toLowerCase();

export function useTaskMediaPreview(orderedTasks: Task[]): UseTaskMediaPreviewResult {
  const mediaItems = useMemo(() => {
    return orderedTasks.flatMap((task) => collectTaskPreviewMediaItems(task));
  }, [orderedTasks]);

  const mediaIndexByTaskAndUrl = useMemo(() => {
    const map = new Map<string, number>();
    mediaItems.forEach((item, index) => {
      const key = `${item.taskId}::${normalizeUrl(item.url)}`;
      if (!map.has(key)) {
        map.set(key, index);
      }
    });
    return map;
  }, [mediaItems]);

  const postMediaIndices = useMemo(() => {
    const map = new Map<string, number[]>();
    mediaItems.forEach((item, index) => {
      const list = map.get(item.taskId);
      if (list) {
        list.push(index);
        return;
      }
      map.set(item.taskId, [index]);
    });
    return map;
  }, [mediaItems]);

  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);

  const activeMediaItem = activeMediaIndex !== null ? mediaItems[activeMediaIndex] || null : null;
  const activeTaskIndices = activeMediaItem ? (postMediaIndices.get(activeMediaItem.taskId) || []) : [];
  const activePostMediaIndex = activeMediaIndex !== null ? activeTaskIndices.indexOf(activeMediaIndex) : -1;
  const activePostMediaCount = activeTaskIndices.length;
  const taskIdsWithMedia = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    mediaItems.forEach((item) => {
      if (seen.has(item.taskId)) return;
      seen.add(item.taskId);
      ids.push(item.taskId);
    });
    return ids;
  }, [mediaItems]);
  const activeTaskIndex = activeMediaItem ? taskIdsWithMedia.indexOf(activeMediaItem.taskId) : -1;

  const openTaskMedia = (taskId: string, url: string) => {
    const key = `${taskId}::${normalizeUrl(url)}`;
    const index = mediaIndexByTaskAndUrl.get(key);
    if (typeof index !== "number") return;
    setActiveMediaIndex(index);
  };

  const closeMediaPreview = () => {
    setActiveMediaIndex(null);
  };

  const goToPreviousMedia = () => {
    if (activeMediaIndex === null || mediaItems.length === 0) return;
    if (activeMediaIndex <= 0) return;
    setActiveMediaIndex(activeMediaIndex - 1);
  };

  const goToNextMedia = () => {
    if (activeMediaIndex === null || mediaItems.length === 0) return;
    if (activeMediaIndex >= mediaItems.length - 1) return;
    setActiveMediaIndex(activeMediaIndex + 1);
  };

  const goToPreviousPost = () => {
    if (activeMediaIndex === null || activeTaskIndex <= 0) return;
    const targetTaskId = taskIdsWithMedia[activeTaskIndex - 1];
    if (!targetTaskId) return;
    const targetPostIndices = postMediaIndices.get(targetTaskId) || [];
    if (targetPostIndices.length === 0) return;
    const targetPostOffset = activePostMediaIndex < 0 ? 0 : Math.min(activePostMediaIndex, targetPostIndices.length - 1);
    setActiveMediaIndex(targetPostIndices[targetPostOffset]);
  };

  const goToNextPost = () => {
    if (activeMediaIndex === null || activeTaskIndex < 0 || activeTaskIndex >= taskIdsWithMedia.length - 1) return;
    const targetTaskId = taskIdsWithMedia[activeTaskIndex + 1];
    if (!targetTaskId) return;
    const targetPostIndices = postMediaIndices.get(targetTaskId) || [];
    if (targetPostIndices.length === 0) return;
    const targetPostOffset = activePostMediaIndex < 0 ? 0 : Math.min(activePostMediaIndex, targetPostIndices.length - 1);
    setActiveMediaIndex(targetPostIndices[targetPostOffset]);
  };

  return {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
    openTaskMedia,
    goToPreviousMedia,
    goToNextMedia,
    goToPreviousPost,
    goToNextPost,
    closeMediaPreview,
  };
}
