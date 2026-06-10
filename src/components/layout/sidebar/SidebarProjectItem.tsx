import { CornerDownRight, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TaskPost } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface SidebarProjectItemProps {
  task: TaskPost;
  /** Nesting level; 0 = top-level project, each level indents one step. */
  depth?: number;
  /** Temporary chain entry shown only because it leads to the focused post. */
  isTemporary?: boolean;
  /** Marks the project chain containing the focused post. */
  isCurrentPosition?: boolean;
}

/** One project row in the sidebar's Projects section; clicking focuses the task. */
export function SidebarProjectItem({
  task,
  depth = 0,
  isTemporary = false,
  isCurrentPosition = false,
}: SidebarProjectItemProps) {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const label = formatBreadcrumbLabel(task.content);
  const Icon = isTemporary ? CornerDownRight : FolderOpen;

  return (
    <SidebarFilterRow
      itemId={`project-${task.id}`}
      className={cn(
        "relative gap-2 py-1.5",
        isCurrentPosition && "bg-sidebar-accent"
      )}
      style={depth > 0 ? { paddingLeft: `${1.625 + depth * 0.875}rem` } : undefined}
    >
      <Icon
        className={cn(
          "w-4 h-4 flex-shrink-0 transition-colors",
          isCurrentPosition
            ? "text-primary"
            : "text-channel-neutral group-hover:text-sidebar-foreground"
        )}
      />
      <button
        data-current-position={isCurrentPosition || undefined}
        onClick={() => {
          void dispatchFeedInteraction({ type: "task.focus.change", taskId: task.id });
        }}
        className="flex flex-1 min-w-0 items-center text-left"
        title={t("sidebar.projects.openProject", { name: label })}
      >
        <span
          className={cn(
            "block max-w-full truncate text-sm transition-colors hover:text-primary",
            isCurrentPosition ? "text-primary font-medium" : "text-sidebar-foreground"
          )}
        >
          {label}
        </span>
      </button>
    </SidebarFilterRow>
  );
}
