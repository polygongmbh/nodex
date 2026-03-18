import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { getOnboardingSections } from "@/components/onboarding/onboarding-sections";
import { getOnboardingStepsBySection } from "@/components/onboarding/onboarding-steps";
import type { OnboardingInitialSection, OnboardingSectionId } from "@/components/onboarding/onboarding-types";
import { loadOnboardingState, markOnboardingCompleted } from "@/lib/onboarding-state";
import { shouldAutoStartOnboarding } from "@/lib/onboarding-autostart";
import { getOnboardingBehaviorGateId, shouldForceComposeForGuide } from "@/lib/onboarding-guide";
import {
  isFilterResetStep,
  isNavigationFocusStep,
  shouldForceFeedAndResetFiltersOnStep,
} from "@/lib/onboarding-step-rules";
import { mapPeopleSelection, setAllChannelFilters } from "@/domain/content/filter-state-utils";
import type { Channel, Person, Relay } from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface UseIndexOnboardingOptions {
  user: { pubkey?: string } | null | undefined;
  isMobile: boolean;
  currentView: ViewType;
  channels: Channel[];
  relays: Relay[];
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  shouldForceAuthAfterOnboarding: boolean;
  ensureGuideDataAvailable: () => void;
  setCurrentView: (view: ViewType) => void;
  setFocusedTaskId: (taskId: string | null) => void;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  t: TFunction;
}

export function useIndexOnboarding({
  user,
  isMobile,
  currentView,
  channels,
  relays,
  openedWithFocusedTaskRef,
  shouldForceAuthAfterOnboarding,
  ensureGuideDataAvailable,
  setCurrentView,
  setFocusedTaskId,
  setSearchQuery,
  setActiveRelayIds,
  setChannelFilterStates,
  setPeople,
  setIsAuthModalOpen,
  t,
}: UseIndexOnboardingOptions) {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingIntroOpen, setIsOnboardingIntroOpen] = useState(false);
  const [onboardingInitialSection, setOnboardingInitialSection] = useState<OnboardingInitialSection>(null);
  const [onboardingManualStart, setOnboardingManualStart] = useState(false);
  const [activeOnboardingSection, setActiveOnboardingSection] = useState<OnboardingSectionId | null>(null);
  const [activeOnboardingStepId, setActiveOnboardingStepId] = useState<string | null>(null);
  const [composeGuideActivationSignal, setComposeGuideActivationSignal] = useState(0);
  const lastHandledOnboardingStepRef = useRef<string | null>(null);
  const shouldOpenAuthAfterGuideExitRef = useRef(false);
  const startedSignedOutRef = useRef(!user);
  const handledStartupIntroRef = useRef(false);

  const onboardingSections = useMemo(
    () => getOnboardingSections(isMobile, currentView, t),
    [currentView, isMobile, t]
  );
  const onboardingStepsBySection = useMemo(
    () => getOnboardingStepsBySection(isMobile, currentView, t),
    [currentView, isMobile, t]
  );

  const queueOnboardingIntro = useCallback((
    manualStart: boolean,
    initialSection: OnboardingInitialSection,
    showIntro = true
  ) => {
    setOnboardingManualStart(manualStart);
    setOnboardingInitialSection(initialSection);
    setActiveOnboardingSection(null);
    setIsOnboardingIntroOpen(showIntro);
    setIsOnboardingOpen(!showIntro);
  }, []);

  const handleStartOnboardingTour = useCallback(() => {
    ensureGuideDataAvailable();
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(true);
  }, [ensureGuideDataAvailable]);

  const handleOpenGuide = useCallback(() => {
    ensureGuideDataAvailable();
    const initialSectionForOpen: OnboardingInitialSection = isMobile ? "all" : null;
    setOnboardingManualStart(true);
    setOnboardingInitialSection(initialSectionForOpen);
    setActiveOnboardingSection(null);
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(true);
  }, [ensureGuideDataAvailable, isMobile]);

  const handleCloseGuide = useCallback(() => {
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
    const shouldOpenAuth = shouldOpenAuthAfterGuideExitRef.current || shouldForceAuthAfterOnboarding;
    shouldOpenAuthAfterGuideExitRef.current = false;
    if (shouldOpenAuth) {
      setIsAuthModalOpen(true);
    }
  }, [setIsAuthModalOpen, shouldForceAuthAfterOnboarding]);

  const handleCompleteGuide = useCallback((lastStep: number) => {
    markOnboardingCompleted(lastStep);
    if (shouldForceAuthAfterOnboarding) {
      shouldOpenAuthAfterGuideExitRef.current = true;
    }
  }, [shouldForceAuthAfterOnboarding]);

  useEffect(() => {
    if (handledStartupIntroRef.current) return;
    handledStartupIntroRef.current = true;
    if (!startedSignedOutRef.current) return;

    const onboardingState = loadOnboardingState();
    if (shouldAutoStartOnboarding({
      onboardingCompleted: onboardingState.completed,
      openedWithFocusedTask: openedWithFocusedTaskRef.current,
    }) && !user) {
      queueOnboardingIntro(false, "all", !user);
    }
  }, [openedWithFocusedTaskRef, queueOnboardingIntro, user]);

  useEffect(() => {
    if (!user) return;
    setIsOnboardingIntroOpen(false);
    setIsOnboardingOpen(false);
    setActiveOnboardingSection(null);
  }, [user]);

  useEffect(() => {
    if (!isOnboardingOpen) {
      lastHandledOnboardingStepRef.current = null;
      setActiveOnboardingStepId(null);
    }
  }, [isOnboardingOpen]);

  const handleOnboardingStepChange = useCallback((payload: {
    id: string;
    stepNumber: number;
  }) => {
    setActiveOnboardingStepId(payload.id);

    const stepKey = getOnboardingBehaviorGateId(payload.id);
    if (lastHandledOnboardingStepRef.current === stepKey) return;
    lastHandledOnboardingStepRef.current = stepKey;

    if (shouldForceFeedAndResetFiltersOnStep(payload.id, isMobile)) {
      setCurrentView("feed");
      setFocusedTaskId(null);
      setSearchQuery("");
      setActiveRelayIds(new Set());
      setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      return;
    }

    if (isNavigationFocusStep(payload.id)) {
      setCurrentView("feed");
      return;
    }
    if (!isFilterResetStep(payload.id)) return;

    setFocusedTaskId(null);
    setSearchQuery("");
    setActiveRelayIds(new Set());
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [channels, isMobile, relays, setActiveRelayIds, setChannelFilterStates, setCurrentView, setFocusedTaskId, setPeople, setSearchQuery]);

  const handleOnboardingActiveSectionChange = useCallback((section: OnboardingSectionId | null) => {
    setActiveOnboardingSection(section);
    const isDedicatedViewGuide = !isMobile && (currentView === "kanban" || currentView === "calendar");
    if (section === "compose" && !isDedicatedViewGuide) {
      setComposeGuideActivationSignal((previous) => previous + 1);
    }
    if (!isMobile && section === "compose" && !isDedicatedViewGuide && currentView !== "feed") {
      setCurrentView("feed");
    }
  }, [currentView, isMobile, setCurrentView]);

  const forceShowComposeForGuide = shouldForceComposeForGuide({
    isOnboardingOpen,
    activeOnboardingStepId,
    isMobile,
    currentView,
  });

  return {
    isOnboardingOpen,
    isOnboardingIntroOpen,
    onboardingInitialSection,
    onboardingManualStart,
    activeOnboardingSection,
    activeOnboardingStepId,
    onboardingSections,
    onboardingStepsBySection,
    forceShowComposeForGuide,
    composeGuideActivationSignal,
    handleStartOnboardingTour,
    handleOpenGuide,
    handleCloseGuide,
    handleCompleteGuide,
    handleOnboardingStepChange,
    handleOnboardingActiveSectionChange,
  };
}
