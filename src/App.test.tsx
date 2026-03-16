import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/nostr/ndk-context", () => ({
  NDKProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./pages/Index", () => ({
  default: () => <div data-testid="index-page">Index</div>,
}));

vi.mock("./pages/NotFound", () => ({
  default: () => <div data-testid="not-found-page">Not found</div>,
}));

describe("App routes", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders Index for /signin", () => {
    window.history.pushState({}, "", "/signin");

    render(<App />);

    expect(screen.getByTestId("index-page")).toBeInTheDocument();
  });

  it("renders Index for /signup", () => {
    window.history.pushState({}, "", "/signup");

    render(<App />);

    expect(screen.getByTestId("index-page")).toBeInTheDocument();
  });
});
