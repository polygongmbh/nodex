import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeModeToggle } from "./ThemeModeToggle";

describe("ThemeModeToggle", () => {
  it("renders mode options and updates mode", () => {
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));

    render(
      <ThemeProvider>
        <ThemeModeToggle />
      </ThemeProvider>
    );

    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.value).toBe("auto");
    expect(screen.getByText("Auto (System: Light)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "dark" } });
    expect(select.value).toBe("dark");

    matchMediaSpy.mockRestore();
  });
});
