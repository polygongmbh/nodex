import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle, handleDialogOutsideInteraction } from "./dialog";

function DialogHarness({ dismissOnOutsideInteract = true }: { dismissOnOutsideInteract?: boolean }) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dismissOnOutsideInteract={dismissOnOutsideInteract}>
        <DialogTitle>Test Dialog</DialogTitle>
        <DialogDescription>Dialog description</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe("handleDialogOutsideInteraction", () => {
  it("allows outside dismissal when enabled", () => {
    const preventDefault = vi.fn();
    const handler = vi.fn();

    handleDialogOutsideInteraction(true, { preventDefault }, handler);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("blocks outside dismissal when disabled", () => {
    const preventDefault = vi.fn();
    const handler = vi.fn();

    handleDialogOutsideInteraction(false, { preventDefault }, handler);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("closes when the overlay is clicked and outside dismissal is enabled", () => {
    render(<DialogHarness />);

    const closeOverlay = document.querySelector("[data-state='open'].fixed.inset-0");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    if (!closeOverlay) {
      throw new Error("Expected clickable dialog overlay");
    }

    fireEvent.click(closeOverlay);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open when the overlay is clicked and outside dismissal is disabled", () => {
    render(<DialogHarness dismissOnOutsideInteract={false} />);

    const overlay = document.querySelector("[data-state='open'].fixed.inset-0");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    if (!overlay) {
      throw new Error("Expected dialog overlay");
    }

    fireEvent.click(overlay);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
