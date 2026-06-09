import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { FeedViewStateProvider } from "@/features/feed-page/views/feed-view-state-context";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import { makeTask } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

function renderSection(
  posts: Parameters<typeof SidebarProjectsSection>[0]["posts"],
  { currentView = "feed", focusedTaskId = null }: { currentView?: ViewType; focusedTaskId?: string | null } = {}
) {
  return render(
    <FeedViewStateProvider
      value={{
        currentView,
        displayDepthMode: "leaves",
        isSidebarFocused: false,
        isOnboardingOpen: false,
        activeOnboardingStepId: null,
        isManageRouteActive: false,
        canCreateContent: true,
        profileCompletionPromptSignal: 0,
      }}
    >
      <SidebarProjectsSection
        posts={posts}
        focusedTaskId={focusedTaskId}
        isExpanded
        onToggle={() => {}}
      />
    </FeedViewStateProvider>
  );
}

describe("SidebarProjectsSection", () => {
  const project = makeTask({ id: "project", content: "Release work", state: "active" });
  const subproject = makeTask({
    id: "subproject",
    parentId: "project",
    content: "Docs overhaul",
    state: "active",
  });
  const subprojectChild = makeTask({ id: "leaf", parentId: "subproject", state: "open" });

  it("lists active projects with their subprojects", () => {
    renderSection([project, subproject, subprojectChild]);

    expect(screen.getByText("Release work")).toBeInTheDocument();
    expect(screen.getByText("Docs overhaul")).toBeInTheDocument();
  });

  it("focuses a project on click", () => {
    renderSection([project, subproject, subprojectChild]);

    fireEvent.click(screen.getByText("Docs overhaul"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "subproject",
    });
  });

  it("renders nothing without qualifying projects", () => {
    const { container } = renderSection([makeTask({ id: "leaf-only", state: "active" })]);

    expect(container).toBeEmptyDOMElement();
  });

  it("highlights the chain containing the focused post in the home view", () => {
    renderSection([project, subproject, subprojectChild], {
      currentView: "home",
      focusedTaskId: "leaf",
    });

    expect(screen.getByText("Release work").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
    expect(screen.getByText("Docs overhaul").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
  });

  it("does not mark the current position outside the home view", () => {
    renderSection([project, subproject, subprojectChild], {
      currentView: "feed",
      focusedTaskId: "leaf",
    });

    expect(screen.getByText("Release work").closest("button")).not.toHaveAttribute(
      "data-current-position"
    );
  });
});
