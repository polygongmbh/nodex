import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppViewFallback } from "@/components/app/AppViewFallback";
import * as appFatalErrorModule from "@/lib/app-fatal-error";

describe("AppViewFallback", () => {
  it("renders a visible shell fallback with a reload action", () => {
    const reloadSpy = vi.spyOn(appFatalErrorModule, "reloadAppWithCacheBypass").mockImplementation(() => {});

    render(<AppViewFallback />);

    expect(screen.getByText(/loading view/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reload app/i }));
    expect(reloadSpy).toHaveBeenCalled();
  });
});
