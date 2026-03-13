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
      expect(outerContainer).toHaveClass("motion-sidebar-fold-close");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      }
    }
  });
});
