import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskStatusMenu } from "@/components/tasks/task-card/use-task-status-menu";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
} from "@/domain/task-states/task-state-config";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import { cn } from "@/lib/utils";
import { getTaskStatus, getTaskStatusType, type Task } from "@/types";
import type { Person } from "@/types/person";

interface TaskStatusToggleProps {
  task: Task;
  currentUser?: Person;
  people: Person[];
  buttonClassName?: string;
  iconSize?: string;
  focusOnQuickToggle?: boolean;
}

export function TaskStatusToggle({
  task,
  currentUser,
  people,
  buttonClassName,
  iconSize,
  focusOnQuickToggle,
}: TaskStatusToggleProps) {
  const { t } = useTranslation("tasks");
  const { isInteractionBlocked = false, onBlockedInteractionAttempt } = useFeedTaskViewModel();
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatusType(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };
  const {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    currentItemRef,
  } = useTaskStatusMenu({
    task,
    currentUser,
    people,
    isInteractionBlocked,
    onBlockedInteractionAttempt,
    getStatusToggleHint,
    focusOnQuickToggle,
  });
  return (
    <DropdownMenu open={statusMenuOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          {...triggerProps}
          disabled={!canCompleteTask}
          aria-label={t("tasks.actions.setStatus")}
          title={statusButtonTitle}
          className={cn(
            "rounded transition-colors touch-manipulation",
            canCompleteTask ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-60",
            buttonClassName
          )}
        >
          <TaskStateIcon status={getTaskStatus(task)} size={iconSize} />
        </button>
      </DropdownMenuTrigger>
      {canCompleteTask ? (
        <DropdownMenuContent align="start">
          {getTaskStateRegistry().map((state) => {
            const isCurrent = resolveTaskStateFromStatus(task.status).id === state.id;
            return (
              <DropdownMenuItem
                key={state.id}
                ref={isCurrent ? currentItemRef : undefined}
                onClick={(event) => { event.stopPropagation(); dispatchStatusChange(state.id); }}
                className={cn(isCurrent && "font-medium")}
              >
                <TaskStateDefIcon state={state} className="mr-2" />
                <span>{state.label}</span>
                {isCurrent && <Check className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
