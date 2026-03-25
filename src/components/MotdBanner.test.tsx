import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotdBanner } from "./MotdBanner";
import { getMotdDismissStorageKey } from "@/lib/motd";

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
    expect(window.sessionStorage.getItem(getMotdDismissStorageKey(motd))).toBe("1");
  });
});
