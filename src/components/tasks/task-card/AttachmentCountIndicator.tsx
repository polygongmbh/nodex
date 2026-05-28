import { Paperclip } from "lucide-react";

export function AttachmentCountIndicator({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Paperclip className="w-3 h-3" />
      {count}
    </span>
  );
}
