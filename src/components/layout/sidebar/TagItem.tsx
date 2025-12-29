import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tag } from "@/types";

interface TagItemProps {
  tag: Tag;
  onToggle: () => void;
}

export function TagItem({ tag, onToggle }: TagItemProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 pl-7 transition-all group hover:bg-sidebar-accent/50"
      )}
    >
      <Hash
        className={cn(
          "w-4 h-4 transition-colors",
          tag.filterState === "included" && "text-tag-included",
          tag.filterState === "excluded" && "text-tag-excluded",
          tag.filterState === "neutral" && "text-tag-neutral group-hover:text-sidebar-foreground"
        )}
      />
      <span
        className={cn(
          "text-sm transition-colors",
          tag.filterState === "included" && "text-tag-included font-medium",
          tag.filterState === "excluded" && "text-tag-excluded line-through opacity-60",
          tag.filterState === "neutral" && "text-sidebar-foreground"
        )}
      >
        {tag.name}
      </span>
      {tag.filterState !== "neutral" && (
        <div
          className={cn(
            "ml-auto w-1.5 h-1.5 rounded-full",
            tag.filterState === "included" && "bg-tag-included",
            tag.filterState === "excluded" && "bg-tag-excluded"
          )}
        />
      )}
    </button>
  );
}
