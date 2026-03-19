import type { ComponentProps, ReactNode } from "react";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";

interface FeedPageMobileShellProps {
  mobileLayoutProps: ComponentProps<typeof MobileLayout>;
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  onboardingOverlays: ReactNode;
}

export function FeedPageMobileShell({
  mobileLayoutProps,
  authModalProps,
  onboardingOverlays,
}: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout {...mobileLayoutProps} />
      <NostrAuthModal {...authModalProps} />
      {onboardingOverlays}
    </>
  );
}
