import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Hash } from "lucide-react";
import { SidebarSection } from "./SidebarSection";

describe("SidebarSection", () => {
  it("toggles when clicking anywhere on the section header", () => {
    const onToggle = vi.fn();

    render(
      <SidebarSection
        title="Channels"
        icon={Hash}
        isExpanded
        onToggle={onToggle}
      >
        <div>Content</div>
      </SidebarSection>
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse Channels" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not toggle when icon or action controls are clicked", () => {
    const onToggle = vi.fn();
    const onIconClick = vi.fn();
    const onActionClick = vi.fn();

    render(
      <SidebarSection
        title="People"
        icon={Hash}
        isExpanded
        onToggle={onToggle}
        onIconClick={onIconClick}
        action={<button onClick={onActionClick}>Action</button>}
      >
        <div>Content</div>
      </SidebarSection>
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle all people" }));
    fireEvent.click(screen.getByRole("button", { name: "Action" }));

    expect(onIconClick).toHaveBeenCalledTimes(1);
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
