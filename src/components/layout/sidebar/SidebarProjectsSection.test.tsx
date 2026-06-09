import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { makeTask } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

function renderSection(posts: Parameters<typeof SidebarProjectsSection>[0]["posts"]) {
  return render(
    <SidebarProjectsSection posts={posts} isExpanded onToggle={() => {}} />
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
});
