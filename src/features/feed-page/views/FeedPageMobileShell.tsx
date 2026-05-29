import type { ComponentProps } from "react";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";
import type { Post } from "@/types";

interface FeedPageMobileShellProps {
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  posts: Post[];
  focusedTaskId: string | null;
}

export function FeedPageMobileShell({ authModalProps, posts, focusedTaskId }: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout posts={posts} focusedTaskId={focusedTaskId} />
      <NostrAuthModal {...authModalProps} />
    </>
  );
}
