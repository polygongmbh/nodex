import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuestPrivateKeyRow } from "./GuestPrivateKeyRow";

describe("GuestPrivateKeyRow", () => {
  it("renders the shared guest backup copy and actions", () => {
    const onToggleShow = vi.fn();
    const onCopy = vi.fn();

    render(
      <GuestPrivateKeyRow
        value="nsec1guestprivatekey"
        showKey={false}
        onToggleShow={onToggleShow}
        onCopy={onCopy}
      />
    );

    expect(screen.getByText(/backup private key/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show private key/i }));
    expect(onToggleShow).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /copy private key/i }));
    expect(onCopy).toHaveBeenCalled();
  });
});
