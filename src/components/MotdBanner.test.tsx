import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotdBanner } from "./MotdBanner";

describe("MotdBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it("does not render when VITE_NODEX_MOTD is unset", () => {
    vi.stubEnv("VITE_NODEX_MOTD", "");
    render(<MotdBanner />);
    expect(screen.queryByRole("button", { name: /dismiss message/i })).not.toBeInTheDocument();
  });

  it("renders and can be dismissed", () => {
    const motd = "Maintenance tonight at 18:00";
    vi.stubEnv("VITE_NODEX_MOTD", motd);

    render(<MotdBanner />);

    expect(screen.getByText(motd)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss message/i }));
    expect(screen.queryByText(motd)).not.toBeInTheDocument();
  });

  it("dismisses on a short tap on the banner surface", () => {
    const motd = "Maintenance tonight at 18:00";
    vi.stubEnv("VITE_NODEX_MOTD", motd);

    render(<MotdBanner />);

    const surface = screen.getByTestId("motd-banner-surface");
    fireEvent.pointerDown(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
    fireEvent.pointerUp(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 12, clientY: 12, timeStamp: 120 });

    expect(screen.queryByText(motd)).not.toBeInTheDocument();
  });

  it("does not dismiss when text is selected", () => {
    const motd = "Maintenance tonight at 18:00";
    vi.stubEnv("VITE_NODEX_MOTD", motd);
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => motd,
    } as Selection);

    render(<MotdBanner />);

    const surface = screen.getByTestId("motd-banner-surface");
    fireEvent.pointerDown(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
    fireEvent.pointerUp(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 12, clientY: 12, timeStamp: 120 });

    expect(screen.getByText(motd)).toBeInTheDocument();
  });

  it("does not dismiss after a drag gesture", () => {
    const motd = "Maintenance tonight at 18:00";
    vi.stubEnv("VITE_NODEX_MOTD", motd);

    render(<MotdBanner />);

    const surface = screen.getByTestId("motd-banner-surface");
    fireEvent.pointerDown(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
    fireEvent.pointerUp(surface, { button: 0, isPrimary: true, pointerId: 1, clientX: 36, clientY: 10, timeStamp: 120 });

    expect(screen.getByText(motd)).toBeInTheDocument();
  });
});
