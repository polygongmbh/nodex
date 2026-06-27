import type { ComponentProps } from "react";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";
import type { Post } from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface FeedPageMobileShellProps {
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  posts: Post[];
  focusedTaskId: string | null;
  currentView: ViewType;
  isOnboardingOpen: boolean;
  activeOnboardingStepId: string | null;
}

export function FeedPageMobileShell({
  authModalProps,
  posts,
  focusedTaskId,
  currentView,
  isOnboardingOpen,
  activeOnboardingStepId,
}: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout
        posts={posts}
        focusedTaskId={focusedTaskId}
        currentView={currentView}
        isOnboardingOpen={isOnboardingOpen}
        activeOnboardingStepId={activeOnboardingStepId}
      />
      <NostrAuthModal {...authModalProps} />
    </>
  );
}
