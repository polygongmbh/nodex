import type { ComponentProps, ReactNode } from "react";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";

interface FeedPageMobileShellProps {
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  onboardingOverlays: ReactNode;
}

export function FeedPageMobileShell({
  authModalProps,
  onboardingOverlays,
}: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout />
      <NostrAuthModal {...authModalProps} />
      {onboardingOverlays}
    </>
  );
}
