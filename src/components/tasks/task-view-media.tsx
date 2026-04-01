import { TaskMediaLightbox } from "@/components/tasks/TaskMediaLightbox";
import { useTaskMediaPreview } from "@/hooks/use-task-media-preview";
import type { Task } from "@/types";

export type TaskViewMediaController = ReturnType<typeof useTaskMediaPreview>;

interface TaskViewMediaLightboxProps {
  controller: TaskViewMediaController;
  onOpenTask: (taskId: string | null) => void;
}

export function useTaskViewMedia(tasks: Task[]): TaskViewMediaController {
  return useTaskMediaPreview(tasks);
}

export function TaskViewMediaLightbox({
  controller,
  onOpenTask,
}: TaskViewMediaLightboxProps) {
  const {
    mediaItems,
    activeMediaIndex,
    activeMediaItem,
    activePostMediaIndex,
    activePostMediaCount,
    closeMediaPreview,
    goToNextMedia,
    goToNextPost,
    goToPreviousMedia,
    goToPreviousPost,
  } = controller;

  return (
    <TaskMediaLightbox
      open={activeMediaIndex !== null}
      mediaItem={activeMediaItem}
      mediaCount={mediaItems.length}
      mediaIndex={activeMediaIndex ?? 0}
      postMediaIndex={activePostMediaIndex}
      postMediaCount={activePostMediaCount}
      onOpenChange={(open) => {
        if (!open) closeMediaPreview();
      }}
      onPrevious={goToPreviousMedia}
      onNext={goToNextMedia}
      onPreviousPost={goToPreviousPost}
      onNextPost={goToNextPost}
      onOpenTask={onOpenTask}
    />
  );
}
