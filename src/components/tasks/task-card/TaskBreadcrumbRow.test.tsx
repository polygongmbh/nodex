import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskBreadcrumbRow } from "./TaskBreadcrumbRow";

describe("TaskBreadcrumbRow", () => {
  it("renders ancestor buttons and forwards focus clicks", () => {
    const onFocusTask = vi.fn();

    render(
      <TaskBreadcrumbRow
        breadcrumbs={[
          { id: "root", text: "Root task" },
          { id: "child", text: "Child task" },
        ]}
        onFocusTask={onFocusTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus task: root task/i }));

    expect(onFocusTask).toHaveBeenCalledWith("root");
    expect(screen.getByRole("button", { name: /focus task: child task/i })).toBeInTheDocument();
  });

  it("renders nothing when there are no breadcrumbs", () => {
    const { container } = render(<TaskBreadcrumbRow breadcrumbs={[]} onFocusTask={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
