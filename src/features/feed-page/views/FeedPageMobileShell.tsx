import type { ComponentProps, ReactNode } from "react";
import {
  MobileLayout,
  type MobileLayoutActions,
  type MobileLayoutComposerState,
  type MobileLayoutPublishState,
  type MobileLayoutViewState,
} from "@/components/mobile/MobileLayout";
import { NostrAuthModal } from "@/components/auth/NostrAuthModal";

export interface FeedPageMobileController {
  viewState: MobileLayoutViewState;
  actions?: MobileLayoutActions;
  composerState?: MobileLayoutComposerState;
  publishState?: MobileLayoutPublishState;
}

interface FeedPageMobileShellProps {
  controller: FeedPageMobileController;
  authModalProps: ComponentProps<typeof NostrAuthModal>;
  onboardingOverlays: ReactNode;
}

export function FeedPageMobileShell({
  controller,
  authModalProps,
  onboardingOverlays,
}: FeedPageMobileShellProps) {
  return (
    <>
      <MobileLayout {...controller} />
      <NostrAuthModal {...authModalProps} />
      {onboardingOverlays}
    </>
  );
}
