import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider, useThemeMode } from "./ThemeProvider";
import { THEME_MODE_STORAGE_KEY } from "@/infrastructure/preferences/theme-preferences-storage";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

class MatchMediaController {
  private listeners = new Set<MatchMediaListener>();
  private isDark = false;

  constructor(initialDark: boolean) {
    this.isDark = initialDark;
  }

  get matches() {
    return this.isDark;
  }

  setDark(nextDark: boolean) {
    this.isDark = nextDark;
    const event = { matches: nextDark } as MediaQueryListEvent;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  createQuery = (query: string): MediaQueryList => {
    const queryList = {
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_eventName, listener) => {
        this.listeners.add(listener as MatchMediaListener);
      },
      removeEventListener: (_eventName, listener) => {
        this.listeners.delete(listener as MatchMediaListener);
      },
      dispatchEvent: () => true,
    };
    Object.defineProperty(queryList, "matches", {
      get: () => this.isDark,
    });
    return queryList as unknown as MediaQueryList;
  };
}

function ThemeControls() {
  const { mode, effectiveTheme, setMode } = useThemeMode();

  return (
    <div>
      <div data-testid="mode">{mode}</div>
      <div data-testid="effective">{effectiveTheme}</div>
      <button onClick={() => setMode("light")}>set-light</button>
      <button onClick={() => setMode("dark")}>set-dark</button>
      <button onClick={() => setMode("auto")}>set-auto</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("restores persisted mode and updates root class", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, "dark");
    const matchMediaController = new MatchMediaController(false);
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(matchMediaController.createQuery);

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(screen.getByTestId("effective")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    matchMediaSpy.mockRestore();
  });

  it("reacts to system changes in auto mode", () => {
    localStorage.removeItem(THEME_MODE_STORAGE_KEY);
    const matchMediaController = new MatchMediaController(false);
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(matchMediaController.createQuery);

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent("auto");
    expect(screen.getByTestId("effective")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => {
      matchMediaController.setDark(true);
    });

    expect(screen.getByTestId("effective")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    matchMediaSpy.mockRestore();
  });

  it("persists mode changes", () => {
    localStorage.removeItem(THEME_MODE_STORAGE_KEY);
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
        <ThemeControls />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("set-light"));
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByText("set-dark"));
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    matchMediaSpy.mockRestore();
  });
});
