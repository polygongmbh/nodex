import type { ComponentProps, ReactNode } from "react";
import { SidebarHeader } from "@/components/layout/Sidebar";
import { FailedPublishQueueBannerContainer } from "./FailedPublishQueueBannerContainer";
import { DesktopSearchDock } from "@/components/tasks/DesktopSearchDock";
import { ViewSwitcher } from "@/components/tasks/ViewSwitcher";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { NostrAuthModal, NostrUserMenu } from "@/components/auth/NostrAuthModal";
import { ThemeModeToggle } from "@/components/theme/ThemeModeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedViewState } from "./feed-view-state-context";
import { FeedPageSidebar } from "./FeedPageSidebar";
import { DesktopViewsPane } from "./DesktopViewsPane";

interface DesktopAppShellProps {
  shortcutsHelpProps: ComponentProps<typeof KeyboardShortcutsHelp>;
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  onboardingOverlays: ReactNode;
}

export function DesktopAppShell({
  shortcutsHelpProps,
  authModalProps,
  onboardingOverlays,
}: DesktopAppShellProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const {
    currentView,
    desktopSwipeHandlers,
  } = useFeedViewState();

  return (
    <div className="grid app-shell-height overflow-hidden bg-background grid-cols-[auto,1fr] grid-rows-[var(--topbar-height),1fr] [--topbar-height:3.5rem] xl:[--topbar-height:4rem]">
      <SidebarHeader className="h-[var(--topbar-height)]" />
      <div className="border-b border-border px-3 bg-background/95 backdrop-blur-sm flex items-stretch justify-between gap-1.5 min-w-0 h-[var(--topbar-height)]">
        <div className="flex-1 min-w-0 h-full">
          <ViewSwitcher currentView={currentView} />
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
      <FeedPageSidebar />
      <div className="min-w-0 overflow-hidden flex flex-col" {...desktopSwipeHandlers}>
        <FailedPublishQueueBannerContainer />
        <div className="min-h-0 flex-1 overflow-hidden">
          <DesktopViewsPane />
        </div>
        <DesktopSearchDock />
      </div>

      <KeyboardShortcutsHelp {...shortcutsHelpProps} />
      <NostrAuthModal {...authModalProps} />
      {onboardingOverlays}
    </div>
  );
}
