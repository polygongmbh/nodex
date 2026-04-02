import { useTranslation } from "react-i18next";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { cn } from "@/lib/utils";

interface TaskBreadcrumb {
  id: string;
  text: string;
}

interface TaskBreadcrumbRowProps {
  breadcrumbs: TaskBreadcrumb[];
  onFocusTask: (taskId: string) => void;
  className?: string;
  itemClassName?: string;
  separator?: string;
}

export function TaskBreadcrumbRow({
  breadcrumbs,
  onFocusTask,
  className,
  itemClassName,
  separator = "›",
}: TaskBreadcrumbRowProps) {
  const { t } = useTranslation();

  if (breadcrumbs.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1 text-xs text-muted-foreground", className)}>
      {breadcrumbs.map((breadcrumb, index) => (
        <span key={breadcrumb.id} className={cn("flex max-w-[50%] items-center gap-1", itemClassName)}>
          {index > 0 ? <span className="text-muted-foreground/50">{separator}</span> : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFocusTask(breadcrumb.id);
            }}
            className={cn(TASK_INTERACTION_STYLES.hoverLinkText, "max-w-full truncate")}
            title={t("tasks.focusBreadcrumbTitle", { title: breadcrumb.text })}
            aria-label={t("tasks.focusBreadcrumbTitle", { title: breadcrumb.text })}
          >
            {breadcrumb.text}
          </button>
        </span>
      ))}
    </div>
  );
}
