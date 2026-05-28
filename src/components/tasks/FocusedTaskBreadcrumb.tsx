import { ReactNode, useMemo } from "react";
import { ArrowLeft, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Post } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { resolvePostsByIdFor } from "@/features/feed-page/stores/posts-store";

interface FocusedTaskBreadcrumbProps {
  posts: Post[];
  focusedTaskId: string | null;
  className?: string;
  rightSlot?: ReactNode;
}

export function FocusedTaskBreadcrumb({
  posts,
  focusedTaskId,
  className,
  rightSlot,
}: FocusedTaskBreadcrumbProps) {
  const { t } = useTranslation("tasks");
  const navigate = useNavigate();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const focusTask = (taskId: string | null) => {
    void dispatchFeedInteraction({ type: "task.focus.change", taskId });
  };
  const path = useMemo(() => {
    if (!focusedTaskId) return [] as Post[];
    // posts is a dep so this re-runs on store changes; the lookup itself
    // reads through the canonical id-map without cloning it.
    const byId = resolvePostsByIdFor(posts);
    const chain: Post[] = [];
    const visited = new Set<string>();
    let current = byId.get(focusedTaskId);

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      if (!current.parentId) break;
      current = byId.get(current.parentId);
    }

    return chain;
  }, [posts, focusedTaskId]);
  const parentFocusId = useMemo(() => {
    if (!focusedTaskId) return null;
    const focusedTask = posts.find((task) => task.id === focusedTaskId);
    return focusedTask?.parentId || null;
  }, [posts, focusedTaskId]);

  const buttonClass = "inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground hover:bg-background/70";

  return (
    <div
      data-onboarding="focused-breadcrumb"
      className={cn(
        "w-full h-12 border-b border-border/80 bg-muted/60 px-2 sm:px-3 flex items-center gap-3 shadow-sm",
        "text-sm font-medium text-foreground/85 whitespace-nowrap",
        className
      )}
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        title={t("breadcrumbs.goBack")}
        className={cn(buttonClass, "gap-1")}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t("breadcrumbs.back")}</span>
      </button>
      <div className="min-w-0 flex flex-1 items-center overflow-hidden">
        <button
          onClick={() => focusTask(null)}
          className={cn(buttonClass, "shrink-0", path.length === 0 && "text-foreground font-semibold")}
          type="button"
          title={t("breadcrumbs.showAllPosts")}
        >
          {t("breadcrumbs.all")}
        </button>
        {path.map((task, index) => (
          <span key={task.id} className="flex max-w-[50%] shrink-0 items-center">
            <span className="shrink-0 text-foreground/50">/</span>
            <button
              onClick={() => focusTask(task.id)}
              className={cn(
                buttonClass,
                "max-w-full shrink-0 truncate text-left",
                index === path.length - 1 && "text-foreground font-semibold"
              )}
              type="button"
              title={formatBreadcrumbLabel(task.content)}
            >
              {formatBreadcrumbLabel(task.content)}
            </button>
          </span>
        ))}
      </div>
      {rightSlot && <div className="ml-auto flex items-center">{rightSlot}</div>}
      <button
        type="button"
        onClick={() => focusTask(parentFocusId)}
        title={t("breadcrumbs.goToParent")}
        className={cn(buttonClass, "gap-1")}
      >
        <ChevronUp className="w-3.5 h-3.5" />
        <span>{t("breadcrumbs.up")}</span>
      </button>
    </div>
  );
}
