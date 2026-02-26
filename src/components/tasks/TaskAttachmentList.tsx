import { FileText } from "lucide-react";
import { normalizePublishedAttachments } from "@/lib/attachments";
import { inferTaskMediaKind } from "@/lib/task-media";
import type { PublishedAttachment } from "@/types";

interface TaskAttachmentListProps {
  attachments?: PublishedAttachment[];
  className?: string;
  onMediaClick?: (url: string) => void;
}

export function TaskAttachmentList({
  attachments = [],
  className = "mt-2 space-y-2",
  onMediaClick,
}: TaskAttachmentListProps) {
  const normalized = normalizePublishedAttachments(attachments);
  if (normalized.length === 0) return null;

  return (
    <div className={className}>
      {normalized.map((attachment) => {
        const mediaKind = inferTaskMediaKind(attachment.url, attachment.mimeType);
        const caption = attachment.alt || attachment.name || attachment.url;

        if (mediaKind === "image") {
          return (
            <button
              key={attachment.url}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMediaClick?.(attachment.url);
              }}
              className="group relative block max-w-sm"
            >
              <img
                src={attachment.url}
                alt={caption}
                loading="lazy"
                className="max-h-64 w-auto rounded-md border border-border/60 bg-muted/30 object-contain"
              />
              <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/85 px-2 py-1 text-left text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate" title={caption}>{caption}</p>
              </div>
            </button>
          );
        }

        if (mediaKind === "video") {
          return (
            <div key={attachment.url} className="group relative max-w-xl">
              <video
                controls
                preload="metadata"
                onClick={(event) => {
                  event.stopPropagation();
                  onMediaClick?.(attachment.url);
                }}
                className="max-h-72 w-full rounded-md border border-border/60 bg-muted/30"
              >
                <source src={attachment.url} type={attachment.mimeType || undefined} />
              </video>
              <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/85 px-2 py-1 text-left text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate" title={caption}>{caption}</p>
              </div>
            </div>
          );
        }

        if (mediaKind === "audio") {
          return (
            <div key={attachment.url} className="w-full max-w-xl">
              <audio
                controls
                preload="metadata"
                onClick={(event) => {
                  event.stopPropagation();
                  onMediaClick?.(attachment.url);
                }}
                className="w-full"
              >
                <source src={attachment.url} type={attachment.mimeType || undefined} />
              </audio>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={caption}>
                {caption}
              </p>
            </div>
          );
        }

        return (
          <a
            key={attachment.url}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs hover:bg-muted/50"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="max-w-[18rem] truncate">{attachment.name || attachment.url}</span>
          </a>
        );
      })}
    </div>
  );
}
