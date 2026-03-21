import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { SidebarHeader } from "@/components/layout/Sidebar";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { DesktopSearchDock, type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher, type ViewType } from "@/components/tasks/ViewSwitcher";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { CompletionFeedbackToggle } from "@/components/theme/CompletionFeedbackToggle";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPageUiConfig } from "./feed-page-ui-config";
import { FeedPageSidebar } from "./FeedPageSidebar";

export interface FeedPageDesktopHeaderConfig {
  currentView: ViewType;
}

export interface FeedPageDesktopContentConfig {
  failedPublishQueueBannerState: ComponentProps<typeof FailedPublishQueueBanner>;
  desktopSwipeHandlers: HTMLAttributes<HTMLDivElement>;
  viewPane: ReactNode;
  searchDockState: Omit<
    ComponentProps<typeof DesktopSearchDock>,
    "onSearchChange" | "onKanbanDepthModeChange"
  >;
}

interface FeedPageDesktopShellProps {
  header: FeedPageDesktopHeaderConfig;
  content: FeedPageDesktopContentConfig;
  shortcutsHelpProps: ComponentProps<typeof KeyboardShortcutsHelp>;
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  onboardingOverlays: ReactNode;
}

export function FeedPageDesktopShell({
  header,
  content,
  shortcutsHelpProps,
  authModalProps,
  onboardingOverlays,
}: FeedPageDesktopShellProps) {
  const { completionSoundEnabled, onToggleCompletionSound } = useFeedPageUiConfig();
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  return (
    <div className="grid app-shell-height overflow-hidden bg-background grid-cols-[auto,1fr] grid-rows-[var(--topbar-height),1fr] [--topbar-height:3rem] sm:[--topbar-height:3.5rem] xl:[--topbar-height:4rem]">
      <SidebarHeader className="h-[var(--topbar-height)]" />
      <div className="border-b border-border px-2 sm:px-3 bg-background/95 backdrop-blur-sm flex items-stretch justify-between gap-2 min-w-0 h-[var(--topbar-height)]">
        <div className="flex-1 min-w-0 h-full">
          <ViewSwitcher
            currentView={header.currentView}
            onViewChange={(view) => {
              void dispatchFeedInteraction({ type: "ui.view.change", view });
            }}
          />
        </div>
        <div className="h-full flex items-center justify-end gap-2 w-auto pl-2">
          <NostrUserMenu
            onSignInClick={() => {
              void dispatchFeedInteraction({ type: "ui.openAuthModal" });
            }}
          />
          <LanguageToggle />
          <CompletionFeedbackToggle
            enabled={completionSoundEnabled}
            onToggle={onToggleCompletionSound}
            className="hidden lg:inline-flex"
          />
          <ThemeModeToggle />
        </div>
      </div>
      <FeedPageSidebar />
      <div className="min-w-0 overflow-hidden flex flex-col" {...content.desktopSwipeHandlers}>
        <FailedPublishQueueBanner {...content.failedPublishQueueBannerState} />
        <div className="min-h-0 flex-1 overflow-hidden">{content.viewPane}</div>
        <DesktopSearchDock
          {...content.searchDockState}
          onSearchChange={(query) => {
            void dispatchFeedInteraction({ type: "ui.search.change", query });
          }}
          onKanbanDepthModeChange={(mode) => {
            void dispatchFeedInteraction({ type: "ui.kanbanDepth.change", mode: mode as KanbanDepthMode });
          }}
        />
      </div>

      <KeyboardShortcutsHelp {...shortcutsHelpProps} />
      <NostrAuthModal {...authModalProps} />
      {onboardingOverlays}
    </div>
  );
}
