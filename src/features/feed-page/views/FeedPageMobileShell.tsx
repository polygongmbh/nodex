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
}

export function FeedPageMobileShell({ authModalProps, posts, focusedTaskId, currentView }: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout posts={posts} focusedTaskId={focusedTaskId} currentView={currentView} />
      <NostrAuthModal {...authModalProps} />
    </>
  );
}
