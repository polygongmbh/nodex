import type { ComponentProps } from "react";
import { SidebarHeader } from "@/components/layout/sidebar/SidebarHeader";
import { FailedPublishQueueBannerContainer } from "./FailedPublishQueueBannerContainer";
import { DesktopSearchDock } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher, isSingleViewMode } from "@/components/tasks/ViewSwitcher";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { FeedPageSidebar, type FeedSidebarState } from "./FeedPageSidebar";
import { DesktopViewsPane } from "./DesktopViewsPane";
import type { Post } from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface DesktopAppShellProps {
  shortcutsHelpProps: ComponentProps<typeof KeyboardShortcutsHelp>;
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  posts: Post[];
  focusedTaskId: string | null;
  currentView: ViewType;
  sidebarController: FeedSidebarState;
}

export function DesktopAppShell({
  shortcutsHelpProps,
  authModalProps,
  posts,
  focusedTaskId,
  currentView,
  sidebarController,
}: DesktopAppShellProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  return (
    <div className="grid app-shell-height overflow-hidden bg-background grid-cols-[auto,1fr] grid-rows-[var(--topbar-height),1fr] [--topbar-height:3.5rem] xl:[--topbar-height:4rem]">
      <SidebarHeader className="h-[var(--topbar-height)]" />
      <div className="border-b border-border px-3 bg-background/95 backdrop-blur-sm flex items-stretch justify-between gap-1.5 min-w-0 h-[var(--topbar-height)]">
        <div className="flex-1 min-w-0 h-full">
          {!isSingleViewMode && <ViewSwitcher currentView={currentView} />}
        </div>
        <div className="h-full flex items-center justify-end gap-1 lg:gap-1.5 w-auto">
          <NostrUserMenu
            onSignInClick={() => {
              void dispatchFeedInteraction({ type: "ui.openAuthModal" });
            }}
          />
          <LanguageToggle />
          <ThemeModeToggle />
        </div>
      </div>
      <FeedPageSidebar {...sidebarController} />
      <div className="min-w-0 overflow-hidden flex flex-col">
        <FailedPublishQueueBannerContainer />
        <div className="min-h-0 flex-1 overflow-hidden">
          <DesktopViewsPane posts={posts} focusedTaskId={focusedTaskId} currentView={currentView} />
        </div>
        <DesktopSearchDock focusedTaskId={focusedTaskId} currentView={currentView} />
      </div>

      <KeyboardShortcutsHelp {...shortcutsHelpProps} />
      <NostrAuthModal {...authModalProps} />
    </div>
  );
}
