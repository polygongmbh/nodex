import { MessageSquare, CheckSquare, Calendar, Gift, HelpCircle, FileText, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PostType } from "@/types";

const iconMap: Record<PostType, LucideIcon> = {
  message: MessageSquare,
  task: CheckSquare,
  event: Calendar,
  offer: Gift,
  request: HelpCircle,
  blog: FileText,
};

const labelMap: Record<PostType, string> = {
  message: "Messages",
  task: "Tasks",
  event: "Events",
  offer: "Offers",
  request: "Requests",
  blog: "Blog Posts",
};

interface PostTypeItemProps {
  type: PostType;
  isActive: boolean;
  onToggle: () => void;
  onExclusive: () => void;
}

export function PostTypeItem({ type, isActive, onToggle, onExclusive }: PostTypeItemProps) {
  const Icon = iconMap[type];

  return (
    <div
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 pl-7 transition-all group hover:bg-sidebar-accent/50",
        isActive && "bg-sidebar-accent"
      )}
    >
      {/* Icon - click for exclusive */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExclusive();
        }}
        className="relative"
        title="Show only this type"
      >
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:ring-2 hover:ring-primary/50",
            isActive
              ? "bg-primary/20 text-primary"
              : "bg-muted/50 text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        {isActive && (
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>

      {/* Name - click for toggle */}
      <button
        onClick={onToggle}
        className="flex-1 text-left"
      >
        <span
          className={cn(
            "text-sm transition-colors hover:text-primary",
            isActive ? "text-foreground font-medium" : "text-sidebar-foreground"
          )}
        >
          {labelMap[type]}
        </span>
      </button>
    </div>
  );
}
