import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TaskPost } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface SidebarProjectItemProps {
  task: TaskPost;
  /** Subprojects are indented one level under their parent project. */
  isSubproject?: boolean;
}

/** One project row in the sidebar's Projects section; clicking focuses the task. */
export function SidebarProjectItem({ task, isSubproject = false }: SidebarProjectItemProps) {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const label = formatBreadcrumbLabel(task.content);

  return (
    <SidebarFilterRow
      itemId={`project-${task.id}`}
      className={cn("relative gap-2 py-1.5", isSubproject && "pl-10 lg:pl-11")}
    >
      <FolderOpen className="w-4 h-4 flex-shrink-0 text-channel-neutral group-hover:text-sidebar-foreground transition-colors" />
      <button
        onClick={() => {
          void dispatchFeedInteraction({ type: "task.focus.change", taskId: task.id });
        }}
        className="flex flex-1 min-w-0 items-center text-left"
        title={t("sidebar.projects.openProject", { name: label })}
      >
        <span className="block max-w-full truncate text-sm text-sidebar-foreground transition-colors hover:text-primary">
          {label}
        </span>
      </button>
    </SidebarFilterRow>
  );
}
