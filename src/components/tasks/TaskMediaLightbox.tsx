import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskMediaItem } from "@/lib/task-media";

interface TaskMediaLightboxProps {
  open: boolean;
  mediaItem: TaskMediaItem | null;
  mediaCount: number;
  mediaIndex: number;
  postMediaIndex: number;
  postMediaCount: number;
  onOpenChange: (open: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenTask?: (taskId: string) => void;
}

export function TaskMediaLightbox({
  open,
  mediaItem,
  mediaCount,
  mediaIndex,
  postMediaIndex,
  postMediaCount,
  onOpenChange,
  onPrevious,
  onNext,
  onOpenTask,
}: TaskMediaLightboxProps) {
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const mediaBoundsRef = useRef<HTMLDivElement | null>(null);
  const [overlayBounds, setOverlayBounds] = useState({ top: 0, height: 0 });
  const caption = mediaItem?.alt || mediaItem?.name || mediaItem?.url || "";
  const canGoPrevious = mediaCount > 1 && mediaIndex > 0;
  const canGoNext = mediaCount > 1 && mediaIndex < mediaCount - 1;
  const postMediaLabel = `${Math.max(1, postMediaIndex + 1)} / ${Math.max(1, postMediaCount)}`;
  const postText = mediaItem?.taskContent.replace(/\s+/g, " ").trim() || "";
  const postTextPreview = postText.length > 90 ? `${postText.slice(0, 90).trimEnd()}...` : postText;
  const hasOverlayBounds = overlayBounds.height > 0;

  const syncOverlayBounds = useCallback(() => {
    const previewArea = previewAreaRef.current;
    const mediaBounds = mediaBoundsRef.current;
    if (!previewArea || !mediaBounds) return;

    const previewRect = previewArea.getBoundingClientRect();
    const mediaRect = mediaBounds.getBoundingClientRect();
    const top = Math.max(0, mediaRect.top - previewRect.top);
    const height = Math.min(previewRect.height - top, mediaRect.height);

    setOverlayBounds((prev) => {
      if (Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5) return prev;
      return { top, height };
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !mediaItem) return;

    const update = () => requestAnimationFrame(syncOverlayBounds);
    update();

    const previewArea = previewAreaRef.current;
    const mediaBounds = mediaBoundsRef.current;
    if (!previewArea || !mediaBounds) return;

    const resizeObserver = new ResizeObserver(() => {
      update();
    });
    resizeObserver.observe(previewArea);
    resizeObserver.observe(mediaBounds);
    window.addEventListener("resize", update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [open, mediaItem, syncOverlayBounds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-5xl p-0 overflow-hidden border-0">
        <DialogTitle className="sr-only">Media preview</DialogTitle>
        <DialogDescription className="sr-only">Preview media and navigate between post attachments</DialogDescription>
        {mediaItem ? (
          <div className="relative bg-background">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0">{postMediaLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    onOpenTask?.(mediaItem.taskId);
                    onOpenChange(false);
                  }}
                  className="truncate text-left text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title={postText}
                >
                  {postTextPreview || "Open post"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md bg-background/90 p-2 text-foreground hover:bg-background"
                aria-label="Close media preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 pt-1">
              <div
                ref={previewAreaRef}
                className="relative flex min-h-[16rem] max-h-[70vh] items-center justify-center overflow-hidden bg-muted/20"
              >
                <div ref={mediaBoundsRef} className="inline-flex max-h-[68vh] max-w-full items-center justify-center">
                  {mediaItem.kind === "image" && (
                    <img src={mediaItem.url} alt={mediaItem.alt || mediaItem.name || "Media preview"} className="block max-h-[68vh] w-auto object-contain" />
                  )}
                  {mediaItem.kind === "video" && (
                    <video controls preload="metadata" autoPlay className="block max-h-[68vh] max-w-full w-auto object-contain">
                      <source src={mediaItem.url} />
                    </video>
                  )}
                  {mediaItem.kind === "audio" && (
                    <audio controls preload="metadata" className="w-full max-w-2xl">
                      <source src={mediaItem.url} />
                    </audio>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onPrevious}
                  disabled={!canGoPrevious}
                  className="absolute left-0 z-10 flex w-[24%] min-w-[6rem] items-center justify-start pl-4 text-foreground transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  style={hasOverlayBounds ? { top: `${overlayBounds.top}px`, height: `${overlayBounds.height}px` } : undefined}
                  aria-label="Previous media"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!canGoNext}
                  className="absolute right-0 z-10 flex w-[24%] min-w-[6rem] items-center justify-end pr-4 text-foreground transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  style={hasOverlayBounds ? { top: `${overlayBounds.top}px`, height: `${overlayBounds.height}px` } : undefined}
                  aria-label="Next media"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </div>
            </div>

            <div className="px-3 py-2 text-sm text-muted-foreground">
              <p className="truncate" title={caption}>{caption}</p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
