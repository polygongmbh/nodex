import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import * as appFatalErrorModule from "@/lib/app-fatal-error";

function ThrowingChild() {
  throw new Error("Exploded during render");
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a helpful fallback screen when a child crashes", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText("Exploded during render")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to home/i })).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("reloads the app with a cache-bypass marker when requested", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadSpy = vi.spyOn(appFatalErrorModule, "reloadAppWithCacheBypass").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /reload app/i }));

    expect(reloadSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
