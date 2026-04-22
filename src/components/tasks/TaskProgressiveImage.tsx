import { blurhashToDataUri } from "@unpic/placeholder";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReducedDataMode } from "@/hooks/use-reduced-data-mode";
import { featureDebugLog } from "@/lib/feature-debug";
import {
  parseAttachmentAspectRatio,
  resolveTaskImageSourceDecision,
  type TaskImageRenderMode,
} from "@/lib/task-image-source";
import { cn } from "@/lib/utils";

interface TaskProgressiveImageProps {
  src: string;
  alt: string;
  blurhash?: string;
  thumbnailUrl?: string;
  previewImageUrl?: string;
  dimensions?: string;
  renderMode: TaskImageRenderMode;
  preserveAspectRatio?: boolean;
  className?: string;
  imageClassName?: string;
  onDisplayLoad?: () => void;
}

export function TaskProgressiveImage({
  src,
  alt,
  blurhash,
  thumbnailUrl,
  previewImageUrl,
  dimensions,
  renderMode,
  preserveAspectRatio = renderMode === "inline",
  className,
  imageClassName,
  onDisplayLoad,
}: TaskProgressiveImageProps) {
  const { t } = useTranslation("tasks");
  const reducedDataMode = useReducedDataMode();
  const [fullImageRequested, setFullImageRequested] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState(src);
  const [displayLoaded, setDisplayLoaded] = useState(false);

  const sourceDecision = useMemo(() => resolveTaskImageSourceDecision({
    src,
    previewImageUrl,
    thumbnailUrl,
    reducedDataMode,
    renderMode,
    fullImageRequested,
  }), [src, previewImageUrl, thumbnailUrl, reducedDataMode, renderMode, fullImageRequested]);

  const placeholderStyle = useMemo(() => {
    if (!blurhash) return undefined;
    try {
      return {
        backgroundImage: `url("${blurhashToDataUri(blurhash, 16, 16)}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      } as const;
    } catch {
      return undefined;
    }
  }, [blurhash]);
  const aspectRatio = useMemo(() => parseAttachmentAspectRatio(dimensions), [dimensions]);

  useEffect(() => {
    setFullImageRequested(false);
  }, [src]);

  useEffect(() => {
    setDisplayLoaded(false);
    setDisplayedSrc(sourceDecision.initialSrc);
    featureDebugLog("media", "Selected initial image source", {
      renderMode,
      reducedDataMode,
      source: sourceDecision.initialSrc === src ? "full" : "preview",
      hasPreview: Boolean(sourceDecision.previewSrc),
      fullImageBlockedByReducedData: sourceDecision.fullImageBlockedByReducedData,
    });
  }, [renderMode, reducedDataMode, sourceDecision.fullImageBlockedByReducedData, sourceDecision.initialSrc, sourceDecision.previewSrc, src]);

  useEffect(() => {
    if (!sourceDecision.shouldPreloadFullImage || displayedSrc === src) return undefined;

    let active = true;
    const preloader = new Image();
    preloader.decoding = "async";
    preloader.onload = () => {
      if (!active) return;
      setDisplayLoaded(false);
      setDisplayedSrc(src);
      featureDebugLog("media", "Upgraded image from preview to full", { renderMode, reducedDataMode });
    };
    preloader.onerror = () => {
      if (!active) return;
      featureDebugLog("media", "Full image preload failed; keeping preview", { src, renderMode });
    };
    preloader.src = src;

    return () => {
      active = false;
    };
  }, [displayedSrc, reducedDataMode, renderMode, sourceDecision.shouldPreloadFullImage, src]);

  const shouldShowPlaceholder = !displayLoaded;
  const showLoadFullButton = renderMode === "lightbox" && sourceDecision.fullImageBlockedByReducedData;

  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden bg-muted/20", className)}
      style={preserveAspectRatio && aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
    >
      {shouldShowPlaceholder && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-muted/30"
          style={placeholderStyle}
        />
      )}

      <img
        src={displayedSrc}
        alt={alt}
        loading="lazy"
        className={cn(
          "block max-h-full max-w-full w-auto object-contain transition-opacity duration-200",
          displayLoaded ? "opacity-100" : "opacity-0",
          imageClassName
        )}
        onLoad={() => {
          setDisplayLoaded(true);
          onDisplayLoad?.();
          featureDebugLog("media", "Displayed image loaded", {
            renderMode,
            displayedSource: displayedSrc === src ? "full" : "preview",
          });
        }}
        onError={() => {
          if (displayedSrc !== src) {
            setDisplayLoaded(false);
            setDisplayedSrc(src);
            featureDebugLog("media", "Preview image failed; falling back to full", { renderMode, displayedSrc });
            return;
          }
          featureDebugLog("media", "Displayed image failed", { renderMode, displayedSrc });
        }}
      />

      {showLoadFullButton && (
        <button
          type="button"
          onClick={() => {
            setFullImageRequested(true);
            featureDebugLog("media", "User requested full image while reduced-data mode was active", { renderMode });
          }}
          className="absolute bottom-3 right-3 rounded-md bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-background"
        >
          {t("mediaLightbox.loadFullImage")}
        </button>
      )}

      {showLoadFullButton && (
        <p className="absolute left-3 top-3 rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
          {t("mediaLightbox.reducedDataPreview")}
        </p>
      )}
    </div>
  );
}
