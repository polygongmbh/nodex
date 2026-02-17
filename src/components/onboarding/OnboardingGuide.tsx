import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Eye, Filter, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OnboardingInitialSection,
  OnboardingSection,
  OnboardingSectionId,
  OnboardingStep,
} from "./onboarding-types";
import { getOnboardingAllSteps } from "./onboarding-steps";
import {
  isComposeGuideStep,
  isNavigationBreadcrumbStep,
  isNavigationFocusStep,
} from "@/lib/onboarding-step-rules";

interface OnboardingGuideProps {
  isOpen: boolean;
  isMobile?: boolean;
  uiContextKey?: string;
  initialSection: OnboardingInitialSection;
  sections: OnboardingSection[];
  stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]>;
  onClose: () => void;
  onComplete: (lastStep: number) => void;
  onActiveSectionChange?: (section: OnboardingSectionId | null) => void;
  onStepChange?: (step: {
    id: string;
    stepIndex: number;
    stepNumber: number;
    totalSteps: number;
    section: OnboardingInitialSection;
    step: OnboardingStep;
  }) => void;
}

interface RectBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GUIDE_ACTION_TIMEOUT_MS = 5000;

function renderGuideTextWithItalics(text: string) {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={`${part}-${index}`} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function OnboardingGuide({
  isOpen,
  isMobile = false,
  uiContextKey,
  initialSection,
  sections,
  stepsBySection,
  onClose,
  onComplete,
  onActiveSectionChange,
  onStepChange,
}: OnboardingGuideProps) {
  const [activeSection, setActiveSection] = useState<OnboardingInitialSection>(initialSection);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [interactionSatisfied, setInteractionSatisfied] = useState(false);
  const [interactionTimedOut, setInteractionTimedOut] = useState(false);
  const [skipDelayElapsed, setSkipDelayElapsed] = useState(false);
  const [isManualSession, setIsManualSession] = useState(false);
  const [manualSelectedSection, setManualSelectedSection] = useState<OnboardingSectionId | null>(null);
  const [pickerRects, setPickerRects] = useState<Partial<Record<OnboardingSectionId, RectBox>>>({});
  const [guideCardSize, setGuideCardSize] = useState({ width: 380, height: 320 });
  const guideCardRef = useRef<HTMLDivElement | null>(null);
  const manualSelectedSectionRef = useRef<OnboardingSectionId | null>(null);
  const autoAdvancedStepIdsRef = useRef<Set<string>>(new Set());
  const pendingAutoAdvanceStepIdsRef = useRef<Set<string>>(new Set());
  const stepEntryContextKeyRef = useRef<{ stepId: string; contextKey?: string } | null>(null);
  const previousStepIdRef = useRef<string | null>(null);
  const backUnlockedStepIdsRef = useRef<Set<string>>(new Set());

  const getBestVisibleTarget = useCallback((selector: string): HTMLElement | null => {
    const matches = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (matches.length === 0) return null;

    const visibleMatches = matches.filter((target) => {
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(target);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return true;
    });

    if (visibleMatches.length === 0) return matches[0] ?? null;
    if (visibleMatches.length === 1) return visibleMatches[0] ?? null;

    let best = visibleMatches[0];
    let bestArea = 0;
    for (const target of visibleMatches) {
      const rect = target.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const overlapHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea > bestArea) {
        best = target;
        bestArea = overlapArea;
      }
    }

    return best;
  }, []);

  const isTargetVisible = useCallback((selector: string): boolean => {
    const target = getBestVisibleTarget(selector);
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(target);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }, [getBestVisibleTarget]);

  const allSteps = useMemo(() => getOnboardingAllSteps(stepsBySection), [stepsBySection]);

  const getFirstStepIndexForSection = (sectionId: OnboardingSectionId): number => {
    const sectionSteps = stepsBySection[sectionId] ?? [];
    if (sectionSteps.length === 0) return 0;
    const firstSectionStepId = sectionSteps[0].id;
    const globalIndex = allSteps.findIndex((step) => step.id === firstSectionStepId);
    return globalIndex >= 0 ? globalIndex : 0;
  };

  const activeSteps = useMemo(() => {
    if (!activeSection) return [];
    if (activeSection === "all") return allSteps;
    return stepsBySection[activeSection];
  }, [activeSection, allSteps, stepsBySection]);

  const advanceStep = useCallback((stepId: string) => {
    if (autoAdvancedStepIdsRef.current.has(stepId)) return;
    if (pendingAutoAdvanceStepIdsRef.current.has(stepId)) return;
    pendingAutoAdvanceStepIdsRef.current.add(stepId);
    const timeout = window.setTimeout(() => {
      pendingAutoAdvanceStepIdsRef.current.delete(stepId);
      autoAdvancedStepIdsRef.current.add(stepId);
      const lastStep = stepIndex >= activeSteps.length - 1;
      if (lastStep) {
        onComplete(stepIndex);
        onClose();
        return;
      }
      setStepIndex((prev) => Math.min(prev + 1, activeSteps.length - 1));
    }, isManualSession ? 0 : 220);
    return () => {
      window.clearTimeout(timeout);
      pendingAutoAdvanceStepIdsRef.current.delete(stepId);
    };
  }, [activeSteps.length, isManualSession, onClose, onComplete, stepIndex]);

  useEffect(() => {
    if (!isOpen) return;
    setIsManualSession(initialSection === null);
    setManualSelectedSection(null);
    manualSelectedSectionRef.current = null;
    setActiveSection(initialSection);
    setStepIndex(0);
    setTargetRect(null);
    setInteractionSatisfied(false);
    setInteractionTimedOut(false);
    setSkipDelayElapsed(false);
    autoAdvancedStepIdsRef.current.clear();
    pendingAutoAdvanceStepIdsRef.current.clear();
    previousStepIdRef.current = null;
    backUnlockedStepIdsRef.current.clear();
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeSection === null || activeSection === "all") {
      onActiveSectionChange?.(manualSelectedSection ?? manualSelectedSectionRef.current);
      return;
    }
    onActiveSectionChange?.(activeSection);
  }, [activeSection, isOpen, manualSelectedSection, onActiveSectionChange]);

  useEffect(() => {
    if (!isOpen || !activeSection) return;
    if (activeSteps.length === 0) return;
    if (stepIndex > activeSteps.length - 1) {
      setStepIndex(0);
    }
  }, [activeSection, activeSteps.length, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step) return;
    const entry = stepEntryContextKeyRef.current;
    if (entry?.stepId === step.id) return;
    stepEntryContextKeyRef.current = { stepId: step.id, contextKey: uiContextKey };
  }, [activeSection, activeSteps, isOpen, stepIndex, uiContextKey]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step) return;
    if (previousStepIdRef.current === step.id) return;
    previousStepIdRef.current = step.id;

    setInteractionTimedOut(false);
    setInteractionSatisfied(!step.requiredAction);
  }, [activeSection, activeSteps, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || !activeSection || activeSteps.length === 0) return;

    const current = activeSteps[stepIndex];
    if (!current) return;

    const target = current.target ? getBestVisibleTarget(current.target) : null;
    if (!target) {
      setTargetRect(null);
      return;
    }

    const isBreadcrumbStep = isNavigationBreadcrumbStep(current.id);
    const previousOutline = target.style.outline;
    const previousOutlineOffset = target.style.outlineOffset;
    const previousBoxShadow = target.style.boxShadow;
    const previousTransition = target.style.transition;
    const previousBackgroundColor = target.style.backgroundColor;
    const previousBorderRadius = target.style.borderRadius;

    target.style.outline = isBreadcrumbStep ? "3px solid hsl(var(--primary))" : "2px solid hsl(var(--primary))";
    target.style.outlineOffset = isBreadcrumbStep ? "4px" : "3px";
    target.style.boxShadow = isBreadcrumbStep
      ? "0 0 0 8px hsl(var(--primary) / 0.28)"
      : "0 0 0 6px hsl(var(--primary) / 0.18)";
    if (isBreadcrumbStep) {
      target.style.backgroundColor = "hsl(var(--primary) / 0.12)";
      target.style.borderRadius = "0.5rem";
    }
    target.style.transition = "outline-color 120ms ease";

    if ("scrollIntoView" in target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    const updateRect = () => {
      setTargetRect(target.getBoundingClientRect());
    };

    updateRect();
    const remeasureTimeouts = [80, 200, 360].map((delay) =>
      window.setTimeout(updateRect, delay)
    );
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    const onClick = () => setInteractionSatisfied(true);
    const onFocus = () => setInteractionSatisfied(true);
    const onPointerDown = () => setInteractionSatisfied(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        setInteractionSatisfied(true);
      }
    };

    if (current.requiredAction === "click-target") {
      target.addEventListener("click", onClick, true);
      target.addEventListener("pointerdown", onPointerDown, true);
      target.addEventListener("keydown", onKeyDown, true);
    }
    if (current.requiredAction === "focus-target") {
      target.addEventListener("focusin", onFocus, true);
      target.addEventListener("keydown", onKeyDown, true);
    }

    return () => {
      remeasureTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      target.removeEventListener("click", onClick, true);
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("focusin", onFocus, true);
      target.removeEventListener("keydown", onKeyDown, true);
      target.style.outline = previousOutline;
      target.style.outlineOffset = previousOutlineOffset;
      target.style.boxShadow = previousBoxShadow;
      target.style.transition = previousTransition;
      target.style.backgroundColor = previousBackgroundColor;
      target.style.borderRadius = previousBorderRadius;
    };
  }, [activeSection, activeSteps, getBestVisibleTarget, interactionSatisfied, isOpen, stepIndex, uiContextKey]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step?.requiredAction) return;
    if (!interactionSatisfied) return;
    if (autoAdvancedStepIdsRef.current.has(step.id)) return;

    return advanceStep(step.id);
  }, [activeSection, activeSteps, advanceStep, interactionSatisfied, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step) return;

    const isFocusStep = isNavigationFocusStep(step.id);
    const isBreadcrumbStep = isNavigationBreadcrumbStep(step.id);
    if (!isFocusStep && !isBreadcrumbStep) return;
    if (!interactionSatisfied) return;

    let cleanupAdvance: (() => void) | undefined;
    const evaluate = () => {
      const breadcrumbVisible = isTargetVisible('[data-onboarding="focused-breadcrumb"]');
      if (isFocusStep && breadcrumbVisible) {
        cleanupAdvance = advanceStep(step.id);
      }
      if (isBreadcrumbStep && !breadcrumbVisible) {
        cleanupAdvance = advanceStep(step.id);
      }
    };

    evaluate();
    const interval = window.setInterval(evaluate, 180);
    return () => {
      window.clearInterval(interval);
      cleanupAdvance?.();
    };
  }, [activeSection, activeSteps, advanceStep, interactionSatisfied, isOpen, isTargetVisible, stepIndex, uiContextKey]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    if (!uiContextKey) return;
    const step = activeSteps[stepIndex];
    if (!step) return;
    if (step.requiredAction !== "click-target") return;
    if (autoAdvancedStepIdsRef.current.has(step.id)) return;

    const contextDrivenStepIds = new Set([
      "navigation-switcher",
      "mobile-navigation-nav",
    ]);
    if (!contextDrivenStepIds.has(step.id)) return;

    const entry = stepEntryContextKeyRef.current;
    if (!entry || entry.stepId !== step.id) return;
    if (!entry.contextKey) return;
    if (entry.contextKey === uiContextKey) return;

    return advanceStep(step.id);
  }, [activeSection, activeSteps, advanceStep, isOpen, stepIndex, uiContextKey]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step?.requiredAction) {
      setInteractionTimedOut(false);
      return;
    }
    if (interactionSatisfied) {
      setInteractionTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setInteractionTimedOut(true);
    }, GUIDE_ACTION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [activeSection, activeSteps, interactionSatisfied, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    if (isManualSession) {
      setSkipDelayElapsed(true);
      return;
    }
    if (stepIndex !== 0) {
      setSkipDelayElapsed(true);
      return;
    }

    setSkipDelayElapsed(false);
    const timeout = window.setTimeout(() => {
      setSkipDelayElapsed(true);
    }, GUIDE_ACTION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [activeSection, isManualSession, isOpen, stepIndex]);

  const currentStep = activeSteps[stepIndex];
  const isLastStep = stepIndex >= activeSteps.length - 1;
  const showSectionPicker = activeSection === null;
  const isBackUnlockedStep = Boolean(currentStep && backUnlockedStepIdsRef.current.has(currentStep.id));
  const nextDisabled = isManualSession
    ? false
    : Boolean(currentStep?.requiredAction && !interactionSatisfied && !interactionTimedOut && !isBackUnlockedStep);
  const skipDisabled = stepIndex === 0 && !skipDelayElapsed;

  useEffect(() => {
    if (!isOpen) return;
    if (!currentStep) return;

    onStepChange?.({
      id: currentStep.id,
      stepIndex,
      stepNumber: stepIndex + 1,
      totalSteps: activeSteps.length,
      section: activeSection,
      step: currentStep,
    });
  }, [activeSection, activeSteps.length, currentStep, isOpen, onStepChange, stepIndex]);

  const getPickerSelectors = useCallback((sectionId: OnboardingSectionId): string[] => {
    if (isMobile) {
      switch (sectionId) {
        case "navigation":
          return ['[data-onboarding="mobile-nav"]'];
        case "filters":
          return ['[data-onboarding="mobile-filters"]'];
        case "compose":
          return ['[data-onboarding="mobile-combined-box"]', '[data-onboarding="compose-input"]'];
      }
    }

    switch (sectionId) {
      case "navigation":
        return ['[data-onboarding="view-switcher"]', '[data-onboarding="focused-breadcrumb"]'];
      case "filters":
        return ["aside", '[data-onboarding="channels-section"]'];
      case "compose":
        return ['[data-onboarding="focused-compose"]', '[data-onboarding="compose-input"]'];
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isOpen || !showSectionPicker) return;

    const measurePickerRects = () => {
      const nextRects: Partial<Record<OnboardingSectionId, RectBox>> = {};

      const measureSection = (sectionId: OnboardingSectionId) => {
        const selectors = getPickerSelectors(sectionId);
        const elements = selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
        ) as HTMLElement[];
        if (elements.length === 0) return;

        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;

        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          left = Math.min(left, rect.left);
          top = Math.min(top, rect.top);
          right = Math.max(right, rect.right);
          bottom = Math.max(bottom, rect.bottom);
        }

        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
          return;
        }

        const padding = 2;
        nextRects[sectionId] = {
          left: Math.max(0, left - padding),
          top: Math.max(0, top - padding),
          width: Math.max(40, right - left + padding * 2),
          height: Math.max(40, bottom - top + padding * 2),
        };
      };

      measureSection("navigation");
      measureSection("filters");
      measureSection("compose");
      setPickerRects(nextRects);
    };

    measurePickerRects();
    window.addEventListener("resize", measurePickerRects);
    window.addEventListener("scroll", measurePickerRects, true);
    return () => {
      window.removeEventListener("resize", measurePickerRects);
      window.removeEventListener("scroll", measurePickerRects, true);
    };
  }, [getPickerSelectors, isOpen, showSectionPicker]);

  useEffect(() => {
    if (!isOpen || showSectionPicker) return;

    const measure = () => {
      const rect = guideCardRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setGuideCardSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    measure();
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && guideCardRef.current) {
      resizeObserver = new ResizeObserver(() => measure());
      resizeObserver.observe(guideCardRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
    };
  }, [currentStep?.id, isOpen, showSectionPicker]);

  const getAnchoredCardStyle = (): React.CSSProperties => {
    if (showSectionPicker) {
      return {
        width: "min(42rem, calc(100vw - 16px))",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed",
        zIndex: 130,
      };
    }
    if (!currentStep || !targetRect) {
      return {
        width: "min(42rem, calc(100vw - 16px))",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed",
        zIndex: 130,
      };
    }
    const isComposeGuidanceStep = isComposeGuideStep(currentStep.id);
    const isHashtagContentStep = currentStep.id === "filters-hashtag-content";
    const maxStepCardWidth = Math.min(isMobile ? window.innerWidth - 16 : 520, window.innerWidth - 16);
    const minStepCardWidth = Math.min(280, maxStepCardWidth);
    const cardWidth = Math.max(
      minStepCardWidth,
      Math.min(guideCardSize.width || 380, maxStepCardWidth)
    );
    const measuredHeight = guideCardSize.height || 0;
    const cardHeightEstimate = Math.max(
      isComposeGuidanceStep ? 300 : 260,
      measuredHeight
    );
    const gap = isComposeGuidanceStep ? 40 : isHashtagContentStep ? 28 : 24;
    const viewportPadding = 8;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const maxLeft = Math.max(viewportPadding, window.innerWidth - cardWidth - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - cardHeightEstimate - viewportPadding);
    const toCandidate = (left: number, top: number) => ({
      left: clamp(left, viewportPadding, maxLeft),
      top: clamp(top, viewportPadding, maxTop),
    });
    const targetClearance = isComposeGuidanceStep ? 24 : 12;
    const safeTarget = {
      left: targetRect.left - targetClearance,
      top: targetRect.top - targetClearance,
      right: targetRect.right + targetClearance,
      bottom: targetRect.bottom + targetClearance,
    };
    const overlapArea = (left: number, top: number) => {
      const right = left + cardWidth;
      const bottom = top + cardHeightEstimate;
      const overlapX = Math.max(0, Math.min(right, safeTarget.right) - Math.max(left, safeTarget.left));
      const overlapY = Math.max(0, Math.min(bottom, safeTarget.bottom) - Math.max(top, safeTarget.top));
      return overlapX * overlapY;
    };
    const centeredLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    const centeredTop = targetRect.top + targetRect.height / 2 - cardHeightEstimate / 2;
    const belowTop = targetRect.bottom + gap;
    const aboveTop = targetRect.top - cardHeightEstimate - gap;
    const rightLeft = targetRect.right + gap;
    const leftLeft = targetRect.left - cardWidth - gap;

    if (isHashtagContentStep) {
      return {
        width: cardWidth,
        maxWidth: "calc(100vw - 16px)",
        left: clamp(centeredLeft, viewportPadding, maxLeft),
        top: clamp(belowTop, viewportPadding, maxTop),
        position: "fixed",
        zIndex: 130,
      };
    }

    const candidates = [
      toCandidate(centeredLeft, belowTop),
      toCandidate(targetRect.left, belowTop),
      toCandidate(targetRect.right - cardWidth, belowTop),
      toCandidate(centeredLeft, aboveTop),
      toCandidate(rightLeft, centeredTop),
      toCandidate(leftLeft, centeredTop),
    ];

    let bestCandidate = candidates[0];
    let bestOverlap = overlapArea(bestCandidate.left, bestCandidate.top);
    for (const candidate of candidates) {
      const area = overlapArea(candidate.left, candidate.top);
      if (area === 0) {
        bestCandidate = candidate;
        bestOverlap = 0;
        break;
      }
      if (area < bestOverlap) {
        bestCandidate = candidate;
        bestOverlap = area;
      }
    }

    return {
      width: cardWidth,
      maxWidth: "calc(100vw - 16px)",
      left: bestCandidate.left,
      top: bestCandidate.top,
      position: "fixed",
      zIndex: 130,
    };
  };

  const getTargetArrowStyle = (): React.CSSProperties => {
    if (!targetRect) return {};

    const arrowSize = 24;
    const left = Math.max(8, Math.min(window.innerWidth - arrowSize - 8, targetRect.left + targetRect.width / 2 - arrowSize / 2));
    const top = Math.max(8, targetRect.top - (arrowSize + 8));

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  };

  const handleNext = () => {
    if (nextDisabled) return;
    if (isLastStep) {
      onComplete(stepIndex);
      onClose();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setStepIndex((prev) => {
      const nextIndex = Math.max(0, prev - 1);
      const nextStep = activeSteps[nextIndex];
      if (nextStep) {
        backUnlockedStepIdsRef.current.add(nextStep.id);
      }
      return nextIndex;
    });
  };

  const getSectionIcon = (sectionId: OnboardingSectionId) => {
    switch (sectionId) {
      case "navigation":
        return <Eye className="h-5 w-5 text-primary" />;
      case "filters":
        return <Filter className="h-5 w-5 text-primary" />;
      case "compose":
        return <PenSquare className="h-5 w-5 text-primary" />;
      default:
        return <Eye className="h-5 w-5 text-primary" />;
    }
  };

  const handleSectionStart = (sectionId: OnboardingSectionId) => {
    manualSelectedSectionRef.current = sectionId;
    onActiveSectionChange?.(sectionId);
    setManualSelectedSection(sectionId);
    setActiveSection("all");
    setStepIndex(getFirstStepIndexForSection(sectionId));
  };

  const renderPickerHelperBar = (mobile: boolean) => (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 pointer-events-auto rounded-xl border border-border bg-card/85 backdrop-blur-md px-4 py-2.5 shadow-lg",
        mobile
          ? "bottom-4 z-[131] w-[calc(100vw-1rem)]"
          : "bottom-4 z-[130] max-w-2xl w-[calc(100vw-2rem)]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-medium text-foreground/90">
          Pick one highlighted area to begin its guide.
        </p>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );

  const getPickerPaneStyle = (sectionId: OnboardingSectionId): React.CSSProperties => {
    const measured = pickerRects[sectionId];
    if (measured) {
      const inset = Math.min(18, Math.max(8, Math.min(measured.width, measured.height) * 0.05));
      return {
        left: measured.left + inset,
        top: measured.top + inset,
        width: Math.max(96, measured.width - inset * 2),
        height: Math.max(72, measured.height - inset * 2),
      };
    }

    if (isMobile) {
      switch (sectionId) {
        case "navigation":
          return { left: "0%", top: "0%", width: "100%", height: "20%" };
        case "filters":
          return { left: "0%", top: "20%", width: "100%", height: "18%" };
        case "compose":
          return { left: "0%", top: "38%", width: "100%", height: "62%" };
      }
    }

    switch (sectionId) {
      case "navigation":
        return { left: "16%", top: "0%", width: "84%", height: "15%" };
      case "filters":
        return { left: "0%", top: "0%", width: "16%", height: "100%" };
      case "compose":
        return { left: "16%", top: "15%", width: "84%", height: "85%" };
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] pointer-events-none"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      {showSectionPicker && (
        <button
          type="button"
          className="absolute inset-0 z-[121] pointer-events-auto"
          aria-label="Dismiss guide section picker"
          onClick={onClose}
        />
      )}
      {showSectionPicker ? (
        <>
          {isMobile ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose guide section"
              className="absolute left-2 right-2 bottom-20 z-[130] pointer-events-auto rounded-xl border border-border bg-card/90 backdrop-blur-md text-card-foreground shadow-xl p-4"
            >
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Choose a guide section</h2>
                <div className="space-y-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => handleSectionStart(section.id)}
                      className="w-full flex items-start gap-2 rounded-lg border border-border bg-background/60 hover:bg-primary/10 px-3 py-2 text-left transition-colors"
                      aria-label={`Start ${section.title} onboarding section`}
                    >
                      {getSectionIcon(section.id)}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{section.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {renderGuideTextWithItalics(section.description)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionStart(section.id)}
                  style={getPickerPaneStyle(section.id)}
                  className="absolute z-[125] pointer-events-auto rounded-[999px] border border-primary/55 bg-primary/10 hover:bg-primary/20 transition-all duration-200 text-left p-5 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_38px_hsl(var(--primary)/0.24)] backdrop-blur-[1px]"
                  aria-label={`Start ${section.title} onboarding section`}
                  title={`${section.title}: ${section.description}`}
                >
                  <span className="inline-flex items-start gap-2 rounded-xl bg-card/80 backdrop-blur-md px-3 py-2 border border-border shadow-sm">
                    {getSectionIcon(section.id)}
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">{section.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {renderGuideTextWithItalics(section.description)}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              {renderPickerHelperBar(false)}
            </>
          )}
          {isMobile && (
            renderPickerHelperBar(true)
          )}
        </>
      ) : (
        <>
          {currentStep?.target && targetRect && (
            <div
              aria-hidden="true"
              data-testid="onboarding-target-arrow"
              className="absolute z-[129] pointer-events-none"
              style={getTargetArrowStyle()}
            >
              <div className="rounded-full bg-primary text-primary-foreground shadow-md p-1.5 animate-bounce">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>
          )}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Onboarding guide"
            ref={guideCardRef}
            className="pointer-events-auto rounded-xl border border-border bg-card/75 backdrop-blur-md text-card-foreground shadow-xl p-4 sm:p-5"
            style={getAnchoredCardStyle()}
          >
            {!currentStep ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">No onboarding steps available</h2>
                <div className="flex justify-end">
                  <Button onClick={onClose}>Close</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Step {stepIndex + 1} of {activeSteps.length}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{currentStep.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {renderGuideTextWithItalics(currentStep.description)}
                  </p>
                  {currentStep.actionPrompt && (
                    <p className="text-xs text-primary/90 mt-2">
                      {renderGuideTextWithItalics(currentStep.actionPrompt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={skipDisabled}>Skip</Button>
                    <Button variant="outline" onClick={handleBack} disabled={stepIndex === 0}>
                      Back
                    </Button>
                  </div>
                  <Button onClick={handleNext} disabled={nextDisabled}>
                    {isLastStep ? "Finish" : "Next"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
