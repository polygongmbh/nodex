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

  it("uses measured height animation for full-collapse mode", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 144,
    });

    try {
      render(
        <SidebarSection
          title="Feeds"
          icon={Hash}
          isExpanded
          animationMode="fullCollapse"
          onToggle={vi.fn()}
        >
          <div>Relay Content</div>
        </SidebarSection>
      );

      const outerContainer = screen.getByText("Relay Content").parentElement?.parentElement as HTMLElement;
      expect(outerContainer.style.height).toBe("144px");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      }
    }
  });

  it("preserves measured preview height when collapsed in preview-collapse mode", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 72,
    });

    try {
      render(
        <SidebarSection
          title="People"
          icon={Hash}
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div>Preview Content</div>
        </SidebarSection>
      );

      const outerContainer = screen.getByText("Preview Content").parentElement?.parentElement as HTMLElement;
      expect(outerContainer.style.height).toBe("72px");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      }
    }
  });
});
