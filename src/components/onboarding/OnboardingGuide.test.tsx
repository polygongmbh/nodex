import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingGuide } from "./OnboardingGuide";
import type { OnboardingSection, OnboardingSectionId, OnboardingStep } from "./onboarding-types";

const sections: OnboardingSection[] = [
  { id: "navigation", title: "Navigation", description: "Navigation help" },
  { id: "filters", title: "Filters", description: "Filter help" },
  { id: "compose", title: "Compose", description: "Compose help" },
];

const baseStepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
  navigation: [
    {
      id: "navigation-focus",
      title: "Open task context",
      description: "Open a task context.",
      target: '[data-onboarding="task-list"]',
      requiredAction: "click-target",
    },
    {
      id: "navigation-breadcrumb",
      title: "Use breadcrumbs",
      description: "Use breadcrumb navigation.",
      target: '[data-onboarding="focused-breadcrumb"]',
      requiredAction: "click-target",
    },
    {
      id: "navigation-next",
      title: "Next area",
      description: "Moved forward.",
      target: '[data-onboarding="task-list"]',
    },
  ],
  filters: [],
  compose: [],
};

describe("OnboardingGuide breadcrumb transitions", () => {
  it("advances to breadcrumb step after task interaction", () => {
    vi.useFakeTimers();
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        width: 320,
        height: 40,
        top: 0,
        left: 0,
        right: 320,
        bottom: 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText("Open task context")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Task list"));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });

  it("auto-advances to next step when breadcrumb row is no longer visible", () => {
    vi.useFakeTimers();
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        width: 320,
        height: 40,
        top: 0,
        left: 0,
        right: 320,
        bottom: 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <div data-onboarding="focused-breadcrumb">Breadcrumb row</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByText("Task list"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Breadcrumb row"));

    rerender(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <div data-onboarding="focused-breadcrumb" style={{ display: "none" }}>
          Breadcrumb row
        </div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Next area")).toBeInTheDocument();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });

  it("does not render the generic click hint text", () => {
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(
      screen.queryByText("Click the highlighted area, or use Next.")
    ).not.toBeInTheDocument();
  });

  it("renders a visual target arrow indicator for targeted steps", () => {
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByTestId("onboarding-target-arrow")).toBeInTheDocument();
  });

  it("keeps skip disabled for a few seconds on first step", () => {
    vi.useFakeTimers();
    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    const skipButton = screen.getByRole("button", { name: "Skip" });
    expect(skipButton).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(skipButton).toBeEnabled();
    vi.useRealTimers();
  });

  it("reports step metadata when current step changes", () => {
    const onStepChange = vi.fn();
    const stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string }[]> = {
      navigation: [{ id: "navigation-step", title: "Nav", description: "Nav step" }],
      filters: [{ id: "filters-step", title: "Filters", description: "Filters step" }],
      compose: [{ id: "compose-step", title: "Compose", description: "Compose step" }],
    };

    render(
      <OnboardingGuide
        isOpen
        initialSection="all"
        sections={sections}
        stepsBySection={stepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onStepChange={onStepChange}
      />
    );

    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "navigation-step",
        stepNumber: 1,
        totalSteps: 3,
        section: "all",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onStepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "filters-step",
        stepNumber: 2,
        totalSteps: 3,
        section: "all",
      })
    );
  });

  it("rebinds highlighted target when ui context changes", () => {
    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Tree list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="tree:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    const treeTarget = screen.getByText("Tree list");
    expect(treeTarget.getAttribute("style") || "").toContain("outline:");

    rerender(
      <div>
        <div data-onboarding="task-list">Feed list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="feed:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={baseStepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    const feedTarget = screen.getByText("Feed list");
    expect(feedTarget.getAttribute("style") || "").toContain("outline:");
  });

  it("auto-advances click-required navigation steps when uiContextKey changes", () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string; requiredAction?: "click-target" | "focus-target" }[]> = {
      navigation: [
        {
          id: "navigation-switcher",
          title: "Switch views",
          description: "Switch view",
          target: '[data-onboarding="task-list"]',
          requiredAction: "click-target",
        },
        {
          id: "navigation-focus",
          title: "Open task context",
          description: "Open task",
          target: '[data-onboarding="task-list"]',
          requiredAction: "click-target",
        },
      ],
      filters: [],
      compose: [],
    };

    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Tree list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="tree:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText("Switch views")).toBeInTheDocument();

    rerender(
      <div>
        <div data-onboarding="task-list">Feed list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="feed:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Open task context")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not auto-advance navigation-focus from uiContextKey change alone", () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string; requiredAction?: "click-target" | "focus-target" }[]> = {
      navigation: [
        {
          id: "navigation-focus",
          title: "Open task context",
          description: "Open task",
          target: '[data-onboarding="task-list"]',
          requiredAction: "click-target",
        },
        {
          id: "navigation-breadcrumb",
          title: "Use breadcrumbs",
          description: "Use breadcrumb navigation.",
          target: '[data-onboarding="focused-breadcrumb"]',
          requiredAction: "click-target",
        },
      ],
      filters: [],
      compose: [],
    };

    const { rerender } = render(
      <div>
        <div data-onboarding="task-list">Tree list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="tree:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    rerender(
      <div>
        <div data-onboarding="task-list">Feed list</div>
        <OnboardingGuide
          isOpen
          uiContextKey="feed:"
          initialSection="navigation"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText("Open task context")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("starts manual section picks on global step numbering and allows back to earlier global steps", () => {
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [
        { id: "navigation-step-1", title: "Navigation 1", description: "Navigation step 1" },
        { id: "navigation-step-2", title: "Navigation 2", description: "Navigation step 2" },
      ],
      filters: [
        { id: "filters-step-1", title: "Filters 1", description: "Filters step 1" },
      ],
      compose: [
        { id: "compose-step-1", title: "Compose 1", description: "Compose step 1" },
        { id: "compose-step-2", title: "Compose 2", description: "Compose step 2" },
      ],
    };

    render(
      <OnboardingGuide
        isOpen
        initialSection={null}
        sections={sections}
        stepsBySection={stepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Compose onboarding section" }));

    expect(screen.getByText("Compose 1")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Filters 1")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
  });

  it("keeps skip and next immediately available for manual guide starts", () => {
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [
        {
          id: "navigation-required",
          title: "Navigation required",
          description: "Needs click",
          target: '[data-onboarding="task-list"]',
          requiredAction: "click-target",
        },
      ],
      filters: [],
      compose: [],
    };

    render(
      <div>
        <div data-onboarding="task-list">Task list</div>
        <OnboardingGuide
          isOpen
          initialSection={null}
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Navigation onboarding section" }));

    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
  });

});
