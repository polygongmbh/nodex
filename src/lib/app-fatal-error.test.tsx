import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppErrorMessage, renderFatalAppError } from "@/lib/app-fatal-error";

describe("app fatal error rendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("normalizes unknown errors into a user-facing message", () => {
    expect(getAppErrorMessage(new Error("Boot failed"))).toBe("Boot failed");
    expect(getAppErrorMessage("Fatal string")).toBe("Fatal string");
    expect(getAppErrorMessage({ reason: "opaque" })).toBe("Unexpected application error");
  });

  it("renders the fatal app error screen into the target container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      renderFatalAppError(container, new Error("Startup blew up"));
    });

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText("Startup blew up")).toBeInTheDocument();
  });

  it("wires the fatal screen actions to navigation", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onReload = vi.fn();
    const onGoHome = vi.fn();

    act(() => {
      renderFatalAppError(container, new Error("Startup blew up"), { onReload, onGoHome });
    });

    fireEvent.click(screen.getByRole("button", { name: /reload app/i }));
    fireEvent.click(screen.getByRole("button", { name: /go to home/i }));

    expect(onReload).toHaveBeenCalled();
    expect(onGoHome).toHaveBeenCalled();
  });
});
