import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Hash } from "lucide-react";
import { SidebarSection } from "./SidebarSection";

function getSectionButtons() {
  return screen.getAllByRole("button");
}

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

    fireEvent.click(screen.getByRole("button", { expanded: true }));

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

    const [iconButton, , actionButton] = getSectionButtons();

    fireEvent.click(iconButton);
    fireEvent.click(actionButton);

    expect(onIconClick).toHaveBeenCalledTimes(1);
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("applies onboarding data attributes to the section element without an mb-3 wrapper", () => {
    const { container } = render(
      <SidebarSection
        title="People"
        icon={Hash}
        isExpanded
        onToggle={vi.fn()}
        dataOnboarding="people-section"
      >
        <div>Content</div>
      </SidebarSection>
    );

    const section = container.querySelector('[data-onboarding="people-section"]');

    expect(section?.tagName).toBe("SECTION");
    expect(section).not.toHaveClass("mb-3");
    expect(container.querySelector("div.mb-3")).toBeNull();
  });
});
