import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProjectsSection } from "./SidebarProjectsSection";
import { makeComment, makeTask } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
});

function renderSection(
  posts: Parameters<typeof SidebarProjectsSection>[0]["posts"],
  focusedTaskId: string | null = null
) {
  return render(
    <SidebarProjectsSection
      posts={posts}
      focusedTaskId={focusedTaskId}
      isExpanded
      onToggle={() => {}}
    />
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
  const subprojectChild = makeTask({
    id: "leaf",
    parentId: "subproject",
    content: "Rewrite intro",
    state: "active",
  });

  it("lists active projects with their subprojects", () => {
    renderSection([project, subproject, subprojectChild]);

    expect(screen.getByText("Release work")).toBeInTheDocument();
    expect(screen.getByText("Docs overhaul")).toBeInTheDocument();
    // Plain subtasks below subprojects only appear while focused.
    expect(screen.queryByText("Rewrite intro")).not.toBeInTheDocument();
  });

  it("focuses a project on click", () => {
    renderSection([project, subproject, subprojectChild]);

    fireEvent.click(screen.getByText("Docs overhaul"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: "subproject",
    });
  });

  it("renders nothing without qualifying projects or a focused post", () => {
    const { container } = renderSection([makeTask({ id: "leaf-only", state: "active" })]);

    expect(container).toBeEmptyDOMElement();
  });

  it("temporarily shows a focused chain whose root is not a listed project", () => {
    const note = makeTask({ id: "note", content: "Loose note", state: "open" });
    const reply = makeComment({ id: "reply", parentId: "note", content: "A reply" });

    renderSection([project, subproject, subprojectChild, note, reply], "reply");

    expect(screen.getByText("Loose note")).toBeInTheDocument();
    expect(screen.getByText("A reply").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
  });

  it("shows the focused post even when no project qualifies at all", () => {
    const note = makeComment({ id: "solo-note", content: "Standalone thought" });

    renderSection([note], "solo-note");

    expect(screen.getByText("Standalone thought").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
  });

  it("highlights the chain containing the focused post", () => {
    renderSection([project, subproject, subprojectChild], "subproject");

    expect(screen.getByText("Release work").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
    expect(screen.getByText("Docs overhaul").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
  });

  it("extends a subproject with temporary entries down to the focused post", () => {
    renderSection([project, subproject, subprojectChild], "leaf");

    const leafRow = screen.getByText("Rewrite intro");
    expect(leafRow.closest("button")).toHaveAttribute("data-current-position", "true");
    expect(screen.getByText("Docs overhaul").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
  });

  it("shows the chain through children that are not subprojects while focused there", () => {
    const openChild = makeTask({
      id: "open-child",
      parentId: "project",
      content: "Backlog grooming",
      state: "open",
    });
    const grandchild = makeTask({
      id: "grandchild",
      parentId: "open-child",
      content: "Sort tickets",
      state: "open",
    });

    const { unmount } = renderSection(
      [project, subproject, subprojectChild, openChild, grandchild],
      "grandchild"
    );

    expect(screen.getByText("Backlog grooming")).toBeInTheDocument();
    expect(screen.getByText("Sort tickets").closest("button")).toHaveAttribute(
      "data-current-position",
      "true"
    );
    unmount();

    // Without focus the same children stay hidden.
    renderSection([project, subproject, subprojectChild, openChild, grandchild]);
    expect(screen.queryByText("Sort tickets")).not.toBeInTheDocument();
  });

  it("clears the focus back to the root when clicking the section's folder icon", () => {
    const { container } = renderSection([project, subproject, subprojectChild], "leaf");

    const iconButton = container
      .querySelector('[data-onboarding="projects-section"]')
      ?.querySelector("button") as HTMLElement;
    fireEvent.click(iconButton);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.focus.change",
      taskId: null,
    });
  });
});
