import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  OnboardingInitialSection,
  OnboardingSection,
  OnboardingSectionId,
} from "./onboarding-types";
import { getOnboardingAllSteps } from "./onboarding-steps";

interface OnboardingGuideProps {
  isOpen: boolean;
  initialSection: OnboardingInitialSection;
  sections: OnboardingSection[];
  stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]>;
  onClose: () => void;
  onComplete: (lastStep: number) => void;
}

export function OnboardingGuide({
  isOpen,
  initialSection,
  sections,
  stepsBySection,
  onClose,
  onComplete,
}: OnboardingGuideProps) {
  const [activeSection, setActiveSection] = useState<OnboardingInitialSection>(initialSection);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [interactionSatisfied, setInteractionSatisfied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection(initialSection);
    setStepIndex(0);
    setTargetRect(null);
    setInteractionSatisfied(false);
  }, [isOpen, initialSection]);

  const activeSteps = useMemo(() => {
    if (!activeSection) return [];
    if (activeSection === "all") {
      return getOnboardingAllSteps(stepsBySection);
    }
    return stepsBySection[activeSection];
  }, [activeSection, stepsBySection]);

  useEffect(() => {
    if (!isOpen || !activeSection || activeSteps.length === 0) return;

    let nextIndex = stepIndex;
    while (nextIndex < activeSteps.length) {
      const step = activeSteps[nextIndex];
      if (!step.target || document.querySelector(step.target)) break;
      nextIndex += 1;
    }

    if (nextIndex !== stepIndex) {
      if (nextIndex >= activeSteps.length) {
        onClose();
        return;
      }
      setStepIndex(nextIndex);
      return;
    }
  }, [activeSection, activeSteps, isOpen, onClose, stepIndex]);

  useEffect(() => {
    if (!isOpen || !activeSection || activeSteps.length === 0) return;

    const current = activeSteps[stepIndex];
    if (!current) return;

    const target = current.target ? document.querySelector(current.target) as HTMLElement | null : null;
    if (!target) {
      setTargetRect(null);
      setInteractionSatisfied(!current.requiredAction);
      return;
    }

    const previousPosition = target.style.position;
    const previousZIndex = target.style.zIndex;
    const previousOutline = target.style.outline;
    const previousOutlineOffset = target.style.outlineOffset;
    const previousBorderRadius = target.style.borderRadius;
    const previousBoxShadow = target.style.boxShadow;
    const previousTransition = target.style.transition;

    target.style.position = target.style.position || "relative";
    target.style.zIndex = "96";
    target.style.outline = "2px solid hsl(var(--primary))";
    target.style.outlineOffset = "3px";
    target.style.borderRadius = target.style.borderRadius || "10px";
    target.style.boxShadow = "0 0 0 6px hsl(var(--primary) / 0.18)";
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
    } else {
      setInteractionSatisfied(false);
    }

    const onClick = () => setInteractionSatisfied(true);
    const onFocus = () => setInteractionSatisfied(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        setInteractionSatisfied(true);
      }
    };

    if (current.requiredAction === "click-target") {
      target.addEventListener("click", onClick, true);
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
      target.removeEventListener("focusin", onFocus, true);
      target.removeEventListener("keydown", onKeyDown, true);
      target.style.position = previousPosition;
      target.style.zIndex = previousZIndex;
      target.style.outline = previousOutline;
      target.style.outlineOffset = previousOutlineOffset;
      target.style.borderRadius = previousBorderRadius;
      target.style.boxShadow = previousBoxShadow;
      target.style.transition = previousTransition;
    };
  }, [activeSection, activeSteps, isOpen, stepIndex]);

  if (!isOpen) return null;

  const currentStep = activeSteps[stepIndex];
  const isLastStep = stepIndex >= activeSteps.length - 1;
  const showSectionPicker = activeSection === null;
  const nextDisabled = Boolean(currentStep?.requiredAction && !interactionSatisfied);

  const getAnchoredCardStyle = (): React.CSSProperties => {
    if (showSectionPicker || !currentStep || !targetRect) {
      return {
        width: "min(42rem, calc(100vw - 16px))",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed",
        zIndex: 97,
      };
    }
    const cardWidth = 380;
    const gap = 12;
    const left = Math.max(8, Math.min(targetRect.left, window.innerWidth - cardWidth - 8));
    const preferredTop = targetRect.bottom + gap;
    const top =
      preferredTop + 220 > window.innerHeight
        ? Math.max(8, targetRect.top - gap - 220)
        : preferredTop;
    return {
      width: cardWidth,
      maxWidth: "calc(100vw - 16px)",
      left,
      top,
      position: "fixed",
      zIndex: 97,
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

  return (
    <div
      className="fixed inset-0 z-[95] pointer-events-none"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding guide"
        className="pointer-events-auto rounded-xl border border-border bg-card text-card-foreground shadow-xl p-4 sm:p-5"
        style={showSectionPicker ? undefined : getAnchoredCardStyle()}
      >
        {showSectionPicker ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a guide section</h2>
              <p className="text-sm text-muted-foreground">Pick one area to start from step 1.</p>
            </div>
            <div className="grid gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setStepIndex(0);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/60"
                >
                  <div className="font-medium">{section.title}</div>
                  <div className="text-xs text-muted-foreground">{section.description}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : !currentStep ? (
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
              {currentStep.actionPrompt && (
                <p className="text-xs text-primary mt-2">{currentStep.actionPrompt}</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>Skip</Button>
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
    </div>
  );
}
