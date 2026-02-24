import { FileText } from "lucide-react";
import { isImageAttachment, normalizePublishedAttachments } from "@/lib/attachments";
import type { PublishedAttachment } from "@/types";

interface TaskAttachmentListProps {
  attachments?: PublishedAttachment[];
  className?: string;
}

export function TaskAttachmentList({ attachments = [], className = "mt-2 space-y-2" }: TaskAttachmentListProps) {
  const normalized = normalizePublishedAttachments(attachments);
  if (normalized.length === 0) return null;

  return (
    <div className={className}>
      {normalized.map((attachment) => {
        if (isImageAttachment(attachment)) {
          return (
            <a
              key={attachment.url}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="block max-w-sm"
            >
              <img
                src={attachment.url}
                alt={attachment.alt || attachment.name || "Image attachment"}
                loading="lazy"
                className="max-h-64 w-auto rounded-md border border-border/60 bg-muted/30 object-contain"
              />
            </a>
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
