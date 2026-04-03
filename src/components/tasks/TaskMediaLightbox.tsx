import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskProgressiveImage } from "@/components/tasks/TaskProgressiveImage";
import { useReducedDataMode } from "@/hooks/use-reduced-data-mode";
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
  onPreviousPost?: () => void;
  onNextPost?: () => void;
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
  onPreviousPost,
  onNextPost,
  onOpenTask,
}: TaskMediaLightboxProps) {
  const { t } = useTranslation();
  const reducedDataMode = useReducedDataMode();
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const mediaBoundsRef = useRef<HTMLDivElement | null>(null);
  const [overlayBounds, setOverlayBounds] = useState({ top: 0, height: 0 });
  const caption = mediaItem?.alt || mediaItem?.name || mediaItem?.url || "";
  const isPreviewableMedia = mediaItem?.kind === "image" || mediaItem?.kind === "video";
  const canGoPrevious = mediaCount > 1 && mediaIndex > 0;
  const canGoNext = mediaCount > 1 && mediaIndex < mediaCount - 1;
  const postMediaLabel = `${Math.max(1, postMediaIndex + 1)} / ${Math.max(1, postMediaCount)}`;
  const postText = mediaItem?.taskContent.replace(/\s+/g, " ").trim() || "";
  const postTextPreview = postText.length > 90 ? `${postText.slice(0, 90).trimEnd()}...` : postText;
  const hasOverlayBounds = overlayBounds.height > 0;
  const isRawUrlCaption = caption === mediaItem?.url;

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

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "OPTION" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === "ArrowLeft" || key === "h") {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" || key === "l") {
        event.preventDefault();
        onNext();
        return;
      }

      if (event.key === "ArrowUp" || key === "k") {
        event.preventDefault();
        onPreviousPost?.();
        return;
      }

      if (event.key === "ArrowDown" || key === "j") {
        event.preventDefault();
        onNextPost?.();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (!mediaItem) return;
        onOpenTask?.(mediaItem.taskId);
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, mediaItem, onPrevious, onNext, onPreviousPost, onNextPost, onOpenTask, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] min-w-0 p-0 overflow-hidden border-0"
      >
        <DialogTitle className="sr-only">{t("mediaLightbox.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("mediaLightbox.description")}</DialogDescription>
        {mediaItem && isPreviewableMedia ? (
          <div className="relative min-w-0 max-w-full bg-background">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                <span className="shrink-0">{postMediaLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    onOpenTask?.(mediaItem.taskId);
                    onOpenChange(false);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title={postText}
                >
                  {postTextPreview || t("mediaLightbox.openPost")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md bg-background/90 p-2 text-foreground hover:bg-background"
                aria-label={t("mediaLightbox.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 pt-1">
              <div
                ref={previewAreaRef}
                className="relative flex min-h-[16rem] max-h-[70vh] items-center justify-center overflow-hidden bg-muted/20"
              >
                <div ref={mediaBoundsRef} className="flex max-h-[68vh] max-w-full items-center justify-center">
                  {mediaItem.kind === "image" && (
                    <TaskProgressiveImage
                      src={mediaItem.url}
                      alt={mediaItem.alt || mediaItem.name || t("mediaLightbox.imageAlt")}
                      blurhash={mediaItem.blurhash}
                      thumbnailUrl={mediaItem.thumbnailUrl}
                      previewImageUrl={mediaItem.previewImageUrl}
                      dimensions={mediaItem.dimensions}
                      renderMode="lightbox"
                      preserveAspectRatio={false}
                      className="max-h-[68vh] max-w-full"
                      imageClassName="max-h-[68vh] max-w-full"
                      onDisplayLoad={() => requestAnimationFrame(syncOverlayBounds)}
                    />
                  )}
                  {mediaItem.kind === "video" && (
                    <video controls preload="metadata" autoPlay={!reducedDataMode} className="block max-h-[68vh] max-w-full w-auto object-contain">
                      <source src={mediaItem.url} />
                    </video>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onPrevious}
                  disabled={!canGoPrevious}
                  className="absolute left-0 z-10 flex w-[24%] min-w-[6rem] items-center justify-start pl-4 text-foreground transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  style={hasOverlayBounds ? { top: `${overlayBounds.top}px`, height: `${overlayBounds.height}px` } : undefined}
                  aria-label={t("mediaLightbox.previous")}
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!canGoNext}
                  className="absolute right-0 z-10 flex w-[24%] min-w-[6rem] items-center justify-end pr-4 text-foreground transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  style={hasOverlayBounds ? { top: `${overlayBounds.top}px`, height: `${overlayBounds.height}px` } : undefined}
                  aria-label={t("mediaLightbox.next")}
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </div>
            </div>

            <div className="min-w-0 max-w-full px-3 py-2 text-sm text-muted-foreground overflow-hidden">
              {isRawUrlCaption ? (
                <div className="min-w-0 overflow-hidden">
                  <div
                    className="overflow-x-auto whitespace-nowrap font-mono text-[11px] text-foreground/85 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    title={caption}
                  >
                    {caption}
                  </div>
                </div>
              ) : (
                <p className="truncate" title={caption}>{caption}</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
