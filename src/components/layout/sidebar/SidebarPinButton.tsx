import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarPinButtonProps {
  isPinned: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  ariaLabel: string;
  dataTestId?: string;
}

export function SidebarPinButton({
  isPinned,
  onClick,
  title,
  ariaLabel,
  dataTestId,
}: SidebarPinButtonProps) {
  return (
    <button
      data-testid={dataTestId}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "absolute inset-y-0 left-1 z-10 my-auto flex h-6 w-6 items-center justify-center transition-opacity",
        isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"
      )}
    >
      <Pin
        className={cn(
          "h-3 w-3",
          isPinned ? "fill-primary text-primary" : "text-muted-foreground"
        )}
      />
    </button>
  );
}
