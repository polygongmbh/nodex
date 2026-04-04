import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "./sonner";

const sonnerModule = vi.hoisted(() => ({
  dismiss: vi.fn(),
  renderToaster: vi.fn(() => null),
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: sonnerModule.dismiss,
  },
  Toaster: sonnerModule.renderToaster,
}));

vi.mock("@/components/theme/ThemeProvider", () => ({
  useThemeMode: () => ({ mode: "light" }),
}));

describe("Sonner toaster", () => {
  it("uses the shared mobile top offset variable for mobile positioning", async () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<Toaster />);

    await waitFor(() => {
      expect(sonnerModule.renderToaster).toHaveBeenLastCalledWith(
        expect.objectContaining({
          position: "top-center",
          mobileOffset: expect.objectContaining({
            top: "calc(var(--mobile-toast-top-offset, 0px) + 12px)",
            left: 12,
            right: 12,
          }),
        }),
        expect.anything()
      );
    });
  });
});
