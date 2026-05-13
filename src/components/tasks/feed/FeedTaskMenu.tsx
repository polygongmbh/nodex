import { useState, type MouseEvent } from "react";
import { Link2, MoreHorizontal, RefreshCcw, SmilePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "recompose" | null>(null);

  const mutationGate = canAuthorMutate({
    task,
    currentUserPubkey,
    hasChildren,
  });

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
              "inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-opacity",
              "hover:bg-muted hover:text-foreground",
              pinned || menuOpen ? "opacity-100" : "opacity-0 group-hover/feed-card:opacity-100 focus-visible:opacity-100",
              className,
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          <Popover open={reactionOpen} onOpenChange={setReactionOpen}>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setReactionOpen(true);
                }}
              >
                <SmilePlus className="mr-2 h-4 w-4" />
                {t("tasks.actions.react")}
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="start"
              className="w-auto p-2"
              onClick={stop}
            >
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(emoji);
                      setReactionOpen(false);
                      setMenuOpen(false);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-base leading-none hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
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
