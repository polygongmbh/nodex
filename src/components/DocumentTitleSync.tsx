import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import { buildDocumentTitle } from "@/lib/document-title";
import type { Post } from "@/types";

interface DocumentTitleSyncProps {
  currentView: ViewType;
  focusedTask: Post | null;
}

/** Keeps the browser tab title in sync with the focused task / current view. */
export function DocumentTitleSync({ currentView, focusedTask }: DocumentTitleSyncProps) {
  const { t } = useTranslation("shell");
  const viewLabel = t(`navigation.views.${currentView}`);
  const focusedTaskContent = focusedTask?.content ?? null;

  // why: focused task / view changed — rewrite document.title so the tab reflects
  // the current context and its host (distinguishes multiple open Nodex instances).
  useEffect(() => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    document.title = buildDocumentTitle({ focusedTaskContent, viewLabel, host });
  }, [focusedTaskContent, viewLabel]);

  return null;
}
