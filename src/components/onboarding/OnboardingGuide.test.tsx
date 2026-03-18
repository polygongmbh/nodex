import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingGuide } from "./OnboardingGuide";
import type { OnboardingInitialSection, OnboardingSection, OnboardingSectionId, OnboardingStep } from "./onboarding-types";

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

function renderGuide({
  guideProps,
  content,
}: {
  guideProps?: Partial<{
    isOpen: boolean;
    isMobile: boolean;
    manualStart: boolean;
    currentView: "tree" | "feed" | "kanban" | "calendar" | "list";
    uiContextKey: string;
    initialSection: OnboardingInitialSection;
    sections: OnboardingSection[];
    stepsBySection: Record<OnboardingSectionId, OnboardingStep[]>;
    onClose: () => void;
    onComplete: (lastStep: number) => void;
    onActiveSectionChange: (section: OnboardingSectionId | null) => void;
    onStepChange: (step: {
      id: string;
      stepIndex: number;
      stepNumber: number;
      totalSteps: number;
      section: OnboardingInitialSection;
      step: OnboardingStep;
    }) => void;
  }>;
  content?: ReactNode;
}) {
  return render(
    <div>
      {content}
      <OnboardingGuide
        isOpen
        initialSection="navigation"
        sections={sections}
        stepsBySection={baseStepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        {...guideProps}
      />
    </div>
  );
}

async function withMockTargetRect(run: () => void | Promise<void>) {
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
  try {
    await run();
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  }
}

describe("OnboardingGuide breadcrumb transitions", () => {
  it("advances to breadcrumb step after task interaction", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
      renderGuide({
        content: <div data-onboarding="task-list">Task list</div>,
      });

      expect(screen.getByText("Open task context")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Task list"));

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("waits for delayed target mount before rendering highlight", async () => {
    await withMockTargetRect(async () => {
      const { rerender } = renderGuide({
        content: null,
      });

      expect(screen.queryByRole("img", { name: /target indicator/i })).not.toBeInTheDocument();

      rerender(
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

      await waitFor(() => {
        expect(screen.getByRole("img", { name: /target indicator/i })).toBeInTheDocument();
      });
    });
  });

  it("auto-advances to next step when breadcrumb row is no longer visible", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
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
    });
    vi.useRealTimers();
  });

  it("keeps dialog anchored while breadcrumb target disappears before auto-advance", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
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
      const dialogBefore = screen.getByRole("dialog", { name: "Onboarding guide" });
      const topBefore = (dialogBefore as HTMLElement).style.top;
      expect(topBefore).not.toBe("50%");

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
        vi.advanceTimersByTime(120);
      });

      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
      const dialogDuring = screen.getByRole("dialog", { name: "Onboarding guide" });
      expect((dialogDuring as HTMLElement).style.top).toBe(topBefore);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("Next area")).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("auto-advances on initial breadcrumb interaction", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
      render(
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
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText("Next area")).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("does not render breadcrumb recovery prompt when target is unavailable", () => {
    vi.useFakeTimers();
    renderGuide({
      content: <div data-onboarding="task-list">Task list</div>,
    });

    fireEvent.click(screen.getByText("Task list"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText("Breadcrumb is not visible right now")).not.toBeInTheDocument();
    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("auto-focuses the first task when breadcrumb target is unavailable", async () => {
    function BreadcrumbAutoFocusHarness() {
      const [showBreadcrumb, setShowBreadcrumb] = useState(false);
      return (
        <div>
          <div data-onboarding="task-list">
            Task list
            <button type="button" data-task-id="task-1" onClick={() => setShowBreadcrumb(true)}>
              Task 1
            </button>
          </div>
          {showBreadcrumb ? <div data-onboarding="focused-breadcrumb">Breadcrumb row</div> : null}
        </div>
      );
    }

    vi.useFakeTimers();
    await withMockTargetRect(async () => {
      renderGuide({
        content: <BreadcrumbAutoFocusHarness />,
      });

      fireEvent.click(screen.getByText("Task list"));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText("Breadcrumb row")).toBeInTheDocument();
      expect(screen.queryByText("Breadcrumb is not visible right now")).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("auto-focuses a visible global task row when task-list container is missing", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
      const onTaskOpen = vi.fn();
      const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
        navigation: [
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

      render(
        <div>
          <button type="button" data-task-id="task-1" onClick={onTaskOpen}>
            Task 1
          </button>
          <OnboardingGuide
            isOpen
            initialSection="navigation"
            currentView="kanban"
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

      expect(onTaskOpen).toHaveBeenCalledTimes(1);
    });
    vi.useRealTimers();
  });

  it("auto-focuses a clickable descendant in task rows that are wrapper-only containers", async () => {
    vi.useFakeTimers();
    await withMockTargetRect(async () => {
      const onTaskOpen = vi.fn();
      const onStatusClick = vi.fn();
      const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
        navigation: [
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

      render(
        <div>
          <div data-onboarding="task-list">
            <div data-task-id="task-1">
              <button type="button" onClick={onStatusClick}>
                Status
              </button>
              <div title="Focus task" className="cursor-pointer" onClick={onTaskOpen}>
                Task title
              </div>
            </div>
          </div>
          <OnboardingGuide
            isOpen
            initialSection="navigation"
            currentView="list"
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

      expect(onTaskOpen).toHaveBeenCalledTimes(1);
      expect(onStatusClick).toHaveBeenCalledTimes(0);
    });
    vi.useRealTimers();
  });

  it("does not render the generic click hint text", () => {
    renderGuide({
      content: <div data-onboarding="task-list">Task list</div>,
    });

    expect(
      screen.queryByText("Click the highlighted area, or use Next.")
    ).not.toBeInTheDocument();
  });

  it("renders a visual target arrow indicator for targeted steps", () => {
    renderGuide({
      content: <div data-onboarding="task-list">Task list</div>,
    });

    expect(screen.getByRole("img", { name: /target indicator/i })).toBeInTheDocument();
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

  it("auto-advances click-required mobile navigation step when uiContextKey changes", () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, { id: string; title: string; description: string; target?: string; requiredAction?: "click-target" | "focus-target" }[]> = {
      navigation: [
        {
          id: "mobile-navigation-nav",
          title: "Open mobile nav",
          description: "Open nav",
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

    expect(screen.getByText("Open mobile nav")).toBeInTheDocument();

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

  it("does not auto-advance navigation-switcher from uiContextKey change", () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
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
          uiContextKey="feed:abc123"
          initialSection="navigation"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Switch views")).toBeInTheDocument();
    expect(screen.queryByText("Open task context")).not.toBeInTheDocument();
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

  it("advances revisited breadcrumb step on uiContextKey changes when breadcrumb is no longer visible", async () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [
        {
          id: "navigation-focus",
          title: "Open task context",
          description: "Open task context.",
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

    await withMockTargetRect(async () => {
      const { rerender } = render(
        <div>
          <div data-onboarding="task-list">
            <button type="button">Task list</button>
            <button type="button" data-task-id="task-1">Task 1</button>
          </div>
          <div data-onboarding="focused-breadcrumb">Breadcrumb row</div>
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

      fireEvent.click(screen.getByText("Task list"));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Breadcrumb row"));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("Next area")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

      rerender(
        <div>
          <div data-onboarding="task-list">
            <button type="button">Task list</button>
            <button type="button" data-task-id="task-1">Task 1</button>
          </div>
          <div data-onboarding="focused-breadcrumb" style={{ display: "none" }}>Breadcrumb row</div>
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
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("Next area")).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("does not auto-skip channels step after breadcrumb flow", async () => {
    vi.useFakeTimers();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [
        {
          id: "navigation-focus",
          title: "Open task context",
          description: "Open task context.",
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
      filters: [
        {
          id: "filters-relays",
          title: "Relay filters",
          description: "Use relay filters.",
          target: '[data-onboarding="relays-section"]',
          requiredAction: "click-target",
        },
        {
          id: "filters-channels",
          title: "Channel filters",
          description: "Use channel filters.",
          target: '[data-onboarding="channels-section"]',
        },
        {
          id: "filters-next",
          title: "Next filters step",
          description: "Moved forward.",
          target: '[data-onboarding="channels-section"]',
        },
      ],
      compose: [],
    };

    await withMockTargetRect(async () => {
      render(
        <div>
          <div data-onboarding="task-list">Task list</div>
          <div data-onboarding="focused-breadcrumb">Breadcrumb row</div>
          <div data-onboarding="relays-section">Relays</div>
          <div data-onboarding="channels-section">Channels</div>
          <OnboardingGuide
            isOpen
            initialSection="all"
            sections={sections}
            stepsBySection={stepsBySection}
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
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("Relay filters")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Relays"));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("Channel filters")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByText("Channel filters")).toBeInTheDocument();
      expect(screen.queryByText("Next filters step")).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("re-runs breadcrumb auto-focus when revisiting the breadcrumb step", async () => {
    vi.useFakeTimers();
    const onTaskOpen = vi.fn();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [
        {
          id: "navigation-focus",
          title: "Open task context",
          description: "Open task context.",
          target: '[data-onboarding="task-list"]',
          requiredAction: "click-target",
        },
        {
          id: "navigation-breadcrumb",
          title: "Use breadcrumbs",
          description: "Use breadcrumb navigation.",
          target: '[data-onboarding="focused-breadcrumb"]',
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

    await withMockTargetRect(async () => {
      render(
        <div>
          <div data-onboarding="task-list">
            <button type="button" onClick={onTaskOpen}>
              Task list
            </button>
            <button type="button" data-task-id="task-1" onClick={onTaskOpen}>
              Task 1
            </button>
          </div>
          <OnboardingGuide
            isOpen
            initialSection="navigation"
            sections={sections}
            stepsBySection={stepsBySection}
            onClose={vi.fn()}
            onComplete={vi.fn()}
          />
        </div>
      );

      fireEvent.click(screen.getByText("Task list"));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
      const callsBeforeReturn = onTaskOpen.mock.calls.length;

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText("Next area")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onTaskOpen).toHaveBeenCalledTimes(callsBeforeReturn + 1);
    });

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

  it("keeps skip and next immediately available for mobile manual starts without section picker", () => {
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
          isMobile
          manualStart
          initialSection="all"
          sections={sections}
          stepsBySection={stepsBySection}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
  });

  it("keeps Next immediately enabled after navigating back to a required-action step", () => {
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

    fireEvent.click(screen.getByText("Task list"));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Open task context")).toBeInTheDocument();

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);
    expect(screen.getByText("Use breadcrumbs")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("reports selected section context for manual all-steps starts", () => {
    const onActiveSectionChange = vi.fn();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [{ id: "navigation-only", title: "Navigation", description: "Navigation step" }],
      filters: [{ id: "filters-only", title: "Filters", description: "Filters step" }],
      compose: [{ id: "compose-only", title: "Compose", description: "Compose step" }],
    };

    render(
      <OnboardingGuide
        isOpen
        initialSection={null}
        sections={sections}
        stepsBySection={stepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onActiveSectionChange={onActiveSectionChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Compose onboarding section" }));

    expect(onActiveSectionChange).toHaveBeenLastCalledWith("compose");
  });

  it("does not reset selected section context back to null after compose selection", async () => {
    const onActiveSectionChange = vi.fn();
    const stepsBySection: Record<OnboardingSectionId, OnboardingStep[]> = {
      navigation: [{ id: "navigation-only", title: "Navigation", description: "Navigation step" }],
      filters: [{ id: "filters-only", title: "Filters", description: "Filters step" }],
      compose: [{ id: "compose-only", title: "Compose", description: "Compose step" }],
    };

    render(
      <OnboardingGuide
        isOpen
        initialSection={null}
        sections={sections}
        stepsBySection={stepsBySection}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onActiveSectionChange={onActiveSectionChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Compose onboarding section" }));

    await waitFor(() => {
      expect(onActiveSectionChange).toHaveBeenLastCalledWith("compose");
    });
  });

  it("dismisses section picker when clicking outside highlighted panes", () => {
    const onClose = vi.fn();
    render(
      <OnboardingGuide
        isOpen
        initialSection={null}
        sections={sections}
        stepsBySection={baseStepsBySection}
        onClose={onClose}
        onComplete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss guide section picker" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

});
