export type TaskImageRenderMode = "inline" | "lightbox";

export interface TaskImageSourceInput {
  src: string;
  previewImageUrl?: string;
  thumbnailUrl?: string;
  reducedDataMode: boolean;
  renderMode: TaskImageRenderMode;
  fullImageRequested: boolean;
}

export interface TaskImageSourceDecision {
  initialSrc: string;
  previewSrc?: string;
  shouldPreloadFullImage: boolean;
  fullImageBlockedByReducedData: boolean;
}

export function getTaskImagePreviewSrc(input: Pick<TaskImageSourceInput, "previewImageUrl" | "thumbnailUrl">): string | undefined {
  return input.previewImageUrl || input.thumbnailUrl;
}

export function resolveTaskImageSourceDecision(input: TaskImageSourceInput): TaskImageSourceDecision {
  const previewSrc = getTaskImagePreviewSrc(input);

  if (!previewSrc) {
    return {
      initialSrc: input.src,
      previewSrc: undefined,
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: false,
    };
  }

  if (input.renderMode === "inline") {
    return {
      initialSrc: previewSrc,
      previewSrc,
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: false,
    };
  }

  if (input.reducedDataMode && !input.fullImageRequested) {
    return {
      initialSrc: previewSrc,
      previewSrc,
      shouldPreloadFullImage: false,
      fullImageBlockedByReducedData: true,
    };
  }

  return {
    initialSrc: previewSrc,
    previewSrc,
    shouldPreloadFullImage: true,
    fullImageBlockedByReducedData: false,
  };
}

export function parseAttachmentAspectRatio(dimensions?: string): number | undefined {
  if (!dimensions) return undefined;
  const match = dimensions.trim().match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) return undefined;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return width / height;
}
