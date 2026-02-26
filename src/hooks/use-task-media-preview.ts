import { useMemo, useState } from "react";
import type { Task } from "@/types";
import { collectTaskMediaItems, type TaskMediaItem } from "@/lib/task-media";

interface UseTaskMediaPreviewResult {
  mediaItems: TaskMediaItem[];
  activeMediaIndex: number | null;
  activeMediaItem: TaskMediaItem | null;
  activePostMediaIndex: number;
  activePostMediaCount: number;
  openTaskMedia: (taskId: string, url: string) => void;
  goToPreviousMedia: () => void;
  goToNextMedia: () => void;
  closeMediaPreview: () => void;
}

const normalizeUrl = (value: string): string => value.trim().toLowerCase();

export function useTaskMediaPreview(orderedTasks: Task[]): UseTaskMediaPreviewResult {
  const mediaItems = useMemo(() => {
    return orderedTasks.flatMap((task) => collectTaskMediaItems(task));
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

  return {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
    openTaskMedia,
    goToPreviousMedia,
    goToNextMedia,
    closeMediaPreview,
  };
}
