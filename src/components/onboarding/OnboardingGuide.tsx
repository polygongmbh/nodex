import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Eye, Filter, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OnboardingInitialSection,
  OnboardingSection,
  OnboardingSectionId,
  OnboardingStep,
} from "./onboarding-types";
import { getOnboardingAllSteps } from "./onboarding-steps";

interface OnboardingGuideProps {
  isOpen: boolean;
  isMobile?: boolean;
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

export function OnboardingGuide({
  isOpen,
  isMobile = false,
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
  const [pickerRects, setPickerRects] = useState<Partial<Record<OnboardingSectionId, RectBox>>>({});
  const autoAdvancedStepIdsRef = useRef<Set<string>>(new Set());

  const isTargetVisible = (selector: string): boolean => {
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(target);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  };

  const advanceStep = (stepId: string) => {
    if (autoAdvancedStepIdsRef.current.has(stepId)) return;
    autoAdvancedStepIdsRef.current.add(stepId);
    const timeout = window.setTimeout(() => {
      const lastStep = stepIndex >= activeSteps.length - 1;
      if (lastStep) {
        onComplete(stepIndex);
        onClose();
        return;
      }
      setStepIndex((prev) => Math.min(prev + 1, activeSteps.length - 1));
    }, 220);
    return () => window.clearTimeout(timeout);
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection(initialSection);
    setStepIndex(0);
    setTargetRect(null);
    setInteractionSatisfied(false);
    setInteractionTimedOut(false);
    setSkipDelayElapsed(false);
    autoAdvancedStepIdsRef.current.clear();
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeSection === null || activeSection === "all") {
      onActiveSectionChange?.(null);
      return;
    }
    onActiveSectionChange?.(activeSection);
  }, [activeSection, isOpen, onActiveSectionChange]);

  const activeSteps = useMemo(() => {
    if (!activeSection) return [];
    if (activeSection === "all") {
      return getOnboardingAllSteps(stepsBySection);
    }
    return stepsBySection[activeSection];
  }, [activeSection, stepsBySection]);

  useEffect(() => {
    if (!isOpen || !activeSection) return;
    if (activeSteps.length === 0) return;
    if (stepIndex > activeSteps.length - 1) {
      setStepIndex(0);
    }
  }, [activeSection, activeSteps.length, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || !activeSection || activeSteps.length === 0) return;

    const current = activeSteps[stepIndex];
    if (!current) return;

    const target = current.target ? document.querySelector(current.target) as HTMLElement | null : null;
    if (!target) {
      setTargetRect(null);
      setInteractionSatisfied(!current.requiredAction);
      setInteractionTimedOut(false);
      return;
    }

    const isBreadcrumbStep =
      current.id === "navigation-breadcrumb" || current.id === "mobile-navigation-breadcrumb";
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
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    if (!current.requiredAction) {
      setInteractionSatisfied(true);
      setInteractionTimedOut(false);
    } else {
      setInteractionSatisfied(false);
      setInteractionTimedOut(false);
    }

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
  }, [activeSection, activeSteps, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step?.requiredAction) return;
    if (!interactionSatisfied) return;
    if (autoAdvancedStepIdsRef.current.has(step.id)) return;

    return advanceStep(step.id);
  }, [activeSection, activeSteps, interactionSatisfied, isOpen, onClose, onComplete, stepIndex]);

  useEffect(() => {
    if (!isOpen || activeSection === null) return;
    const step = activeSteps[stepIndex];
    if (!step) return;

    const isFocusStep = step.id === "navigation-focus" || step.id === "mobile-navigation-focus";
    const isBreadcrumbStep =
      step.id === "navigation-breadcrumb" || step.id === "mobile-navigation-breadcrumb";
    if (!isFocusStep && !isBreadcrumbStep) return;

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
  }, [activeSection, activeSteps, isOpen, stepIndex]);

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
    if (stepIndex !== 0) {
      setSkipDelayElapsed(true);
      return;
    }

    setSkipDelayElapsed(false);
    const timeout = window.setTimeout(() => {
      setSkipDelayElapsed(true);
    }, GUIDE_ACTION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [activeSection, isOpen, stepIndex]);

  const currentStep = activeSteps[stepIndex];
  const isLastStep = stepIndex >= activeSteps.length - 1;
  const showSectionPicker = activeSection === null;
  const nextDisabled = Boolean(currentStep?.requiredAction && !interactionSatisfied && !interactionTimedOut);
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

  const getPickerSelectors = (sectionId: OnboardingSectionId): string[] => {
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
  };

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
  }, [isMobile, isOpen, showSectionPicker]);

  const getAnchoredCardStyle = (): React.CSSProperties => {
    if (showSectionPicker || !currentStep || !targetRect) {
      return {
        width: "min(42rem, calc(100vw - 16px))",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed",
        zIndex: 130,
      };
    }
    const cardWidth = 380;
    const gap = 24;
    const left = Math.max(8, Math.min(targetRect.left, window.innerWidth - cardWidth - 8));
    const preferredTop = targetRect.bottom + gap;
    const top =
      preferredTop + 240 > window.innerHeight
        ? Math.max(8, targetRect.top - gap - 240)
        : preferredTop;
    const overlapsTarget =
      top < targetRect.bottom &&
      top + 240 > targetRect.top &&
      left < targetRect.right &&
      left + cardWidth > targetRect.left;
    const shiftedLeft = Math.max(8, targetRect.left - cardWidth - gap);
    const shiftedRight = Math.min(window.innerWidth - cardWidth - 8, targetRect.right + gap);
    const finalLeft = overlapsTarget
      ? (shiftedRight + cardWidth <= window.innerWidth - 8 ? shiftedRight : shiftedLeft)
      : left;
    return {
      width: cardWidth,
      maxWidth: "calc(100vw - 16px)",
      left: finalLeft,
      top,
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
    setStepIndex((prev) => Math.max(0, prev - 1));
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

  const getSectionAreaLabel = (sectionId: OnboardingSectionId) => {
    switch (sectionId) {
      case "navigation":
        return "View tabs and breadcrumb";
      case "filters":
        return "Sidebar / filter controls";
      case "compose":
        return "Compose panel";
      default:
        return "Interface";
    }
  };

  const getPickerPaneStyle = (sectionId: OnboardingSectionId): React.CSSProperties => {
    const measured = pickerRects[sectionId];
    if (measured) {
      return {
        left: measured.left,
        top: measured.top,
        width: measured.width,
        height: measured.height,
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
      {showSectionPicker ? (
        <>
          {isMobile ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose guide section"
              className="pointer-events-auto rounded-xl border border-border bg-card/75 backdrop-blur-md text-card-foreground shadow-xl p-4"
              style={getAnchoredCardStyle()}
            >
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Choose a guide section</h2>
                <p className="text-xs text-muted-foreground">Pick an area to start mobile guidance.</p>
                <div className="space-y-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => {
                        setActiveSection(section.id);
                        setStepIndex(0);
                      }}
                      className="w-full flex items-start gap-2 rounded-lg border border-border bg-background/60 hover:bg-primary/10 px-3 py-2 text-left transition-colors"
                      aria-label={`Start ${section.title} onboarding section`}
                    >
                      {getSectionIcon(section.id)}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{section.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{section.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] pointer-events-auto rounded-xl border border-border bg-card/75 backdrop-blur-md px-4 py-3 shadow-lg max-w-xl w-[calc(100vw-2rem)]">
                <h2 className="text-base font-semibold">Choose an interface area</h2>
                <p className="text-xs text-muted-foreground mt-1">Click a highlighted region to start focused guidance.</p>
              </div>

              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setStepIndex(0);
                  }}
                  style={getPickerPaneStyle(section.id)}
                  className="absolute z-[125] pointer-events-auto rounded-none border-2 border-primary/50 bg-primary/10 hover:bg-primary/20 transition-colors text-left p-3"
                  aria-label={`Start ${section.title} onboarding section`}
                  title={`${section.title}: ${section.description}`}
                >
                  <span className="inline-flex items-start gap-2 rounded-md bg-card/75 backdrop-blur-md px-2 py-1 border border-border shadow-sm">
                    {getSectionIcon(section.id)}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{section.title}</span>
                      <span className="block text-[11px] text-muted-foreground">{getSectionAreaLabel(section.id)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}

          <div className="absolute bottom-4 right-4 z-[130] pointer-events-auto">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
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
                  <p className="text-sm text-muted-foreground mt-1">{currentStep.description}</p>
                  <p className="text-xs text-primary mt-2">
                    Click the highlighted area, or use Next.
                  </p>
                  {currentStep.actionPrompt && (
                    <p className="text-xs text-primary/90 mt-1">{currentStep.actionPrompt}</p>
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
