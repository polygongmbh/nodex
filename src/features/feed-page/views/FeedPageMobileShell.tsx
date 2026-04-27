import type { ComponentProps } from "react";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";

interface FeedPageMobileShellProps {
  authModalProps: ComponentProps<typeof NostrAuthModal>;
}

export function FeedPageMobileShell({ authModalProps }: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout />
      <NostrAuthModal {...authModalProps} />
    </>
  );
}
