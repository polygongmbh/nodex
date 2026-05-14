import { getTaskPrimaryDate, getTaskPriority, isTaskPost } from "@/types";
import { useEffect, useState, type MouseEvent } from "react";
import { ArrowLeft, CalendarClock, ChevronDown, Flag, Link2, RefreshCcw, SmilePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { canAuthorMutate } from "@/domain/content/task-edit-window";
import { canPubkeyUpdateTask } from "@/domain/content/task-permissions";
import { DISPLAY_PRIORITY_OPTIONS, displayPriorityFromStored, storedPriorityFromDisplay } from "@/domain/content/task-priority";
import { TaskDueDateEditorForm } from "@/components/tasks/TaskMetadataEditors";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import type { Task } from "@/types";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😄", "🚀", "👀", "🙏", "🙌", "🛠️", "👎"];

interface FeedTaskMenuProps {
  task: Task;
  currentUserPubkey?: string;
  hasChildren: boolean;
  onReact: (emoji: string) => void;
  onCopyPermalink: () => void;
  onRecompose: () => void;
  onDelete: () => void;
  /** Force the trigger to stay visible (e.g. while the active row is focused). */
  pinned?: boolean;
  className?: string;
}

export function FeedTaskMenu({
  task,
  currentUserPubkey,
  hasChildren,
  onReact,
  onCopyPermalink,
  onRecompose,
  onDelete,
  pinned,
  className,
}: FeedTaskMenuProps) {
  const { t } = useTranslation("tasks");
  const { t: tApp } = useTranslation("app");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"actions" | "react" | "due" | "priority">("actions");
  const [confirm, setConfirm] = useState<"delete" | "recompose" | null>(null);

  useEffect(() => {
    if (!menuOpen) setView("actions");
  }, [menuOpen]);

  const mutationGate = canAuthorMutate({
    task,
    currentUserPubkey,
    hasChildren,
  });
  const canEditTaskMetadata = isTaskPost(task) && canPubkeyUpdateTask(task, currentUserPubkey);
  const currentDisplayPriority = displayPriorityFromStored(getTaskPriority(task));

  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("tasks.actions.openMenu")}
            data-testid={`feed-task-menu-trigger-${task.id}`}
            onClick={stop}
            className={cn(
              "inline-flex h-5 items-center justify-center overflow-hidden rounded-md bg-muted/80 text-muted-foreground",
              "transition-[max-width,opacity,margin] duration-150 ease-out",
              "hover:bg-muted hover:text-foreground",
              pinned || menuOpen
                ? "ml-1 max-w-[20px] opacity-100"
                : "ml-0 max-w-0 opacity-0 group-hover/feed-card:ml-1 group-hover/feed-card:max-w-[20px] group-hover/feed-card:opacity-100 focus-visible:ml-1 focus-visible:max-w-[20px] focus-visible:opacity-100",
              className,
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          {view === "react" ? (
            <div className="flex flex-col gap-1 p-1" data-testid={`feed-task-menu-react-${task.id}`}>
              <BackButton onClick={() => setView("actions")} label={t("tasks.actions.cancel")} />
              <div className="grid grid-cols-5 gap-1">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(emoji);
                      setMenuOpen(false);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-base leading-none hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : view === "due" ? (
            <div className="w-[280px]" data-testid={`feed-task-menu-due-${task.id}`}>
              <div className="px-1 pt-1">
                <BackButton onClick={() => setView("actions")} label={t("tasks.actions.cancel")} />
              </div>
              <TaskDueDateEditorForm
                taskId={task.id}
                dueDate={getTaskPrimaryDate(task)?.date}
                dueTime={getTaskPrimaryDate(task)?.time}
                dateType={getTaskPrimaryDate(task)?.type}
                idPrefix="feed-menu"
                onClose={() => setMenuOpen(false)}
              />
            </div>
          ) : view === "priority" ? (
            <div className="flex flex-col gap-1 p-1" data-testid={`feed-task-menu-priority-${task.id}`}>
              <BackButton onClick={() => setView("actions")} label={t("tasks.actions.cancel")} />
              {DISPLAY_PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const stored = storedPriorityFromDisplay(option);
                    if (typeof stored !== "number") return;
                    void dispatchFeedInteraction({ type: "task.updatePriority", taskId: task.id, priority: stored });
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted",
                    currentDisplayPriority === option && "bg-muted font-medium",
                  )}
                >
                  <span>{tApp(`priorityLevels.${option}`)}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setView("react");
                }}
              >
                <SmilePlus className="mr-2 h-4 w-4" />
                {t("tasks.actions.react")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setMenuOpen(false);
                  onCopyPermalink();
                }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {t("tasks.actions.copyPermalink")}
              </DropdownMenuItem>
              {canEditTaskMetadata ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("due");
                    }}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    {getTaskPrimaryDate(task)?.date
                      ? t("tasks.actions.editDueDate")
                      : t("tasks.actions.setDueDate")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("priority");
                    }}
                  >
                    <Flag className="mr-2 h-4 w-4" />
                    {typeof getTaskPriority(task) === "number"
                      ? t("tasks.actions.editPriority")
                      : t("tasks.actions.setPriority")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {mutationGate.canRecompose || mutationGate.canDelete ? (
                <DropdownMenuSeparator />
              ) : null}
              {mutationGate.canRecompose ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setMenuOpen(false);
                    setConfirm("recompose");
                  }}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {t("tasks.actions.recompose")}
                </DropdownMenuItem>
              ) : null}
              {mutationGate.canDelete ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setMenuOpen(false);
                    setConfirm("delete");
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("tasks.actions.delete")}
                </DropdownMenuItem>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? t("tasks.actions.deleteConfirmTitle")
                : t("tasks.actions.recomposeConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? t("tasks.actions.deleteConfirmBody")
                : t("tasks.actions.recomposeConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tasks.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = confirm;
                setConfirm(null);
                if (pending === "delete") onDelete();
                else if (pending === "recompose") onRecompose();
              }}
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {confirm === "delete"
                ? t("tasks.actions.deleteConfirmAction")
                : t("tasks.actions.recomposeConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 self-start rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="h-3 w-3" />
      {label}
    </button>
  );
}
