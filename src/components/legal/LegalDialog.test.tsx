import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDialog, resolveLegalContactEmail } from "./LegalDialog";

describe("LegalDialog", () => {
  it("opens imprint dialog", () => {
    render(<LegalDialog triggerLabel="Impressum" />);

    fireEvent.click(screen.getByRole("button", { name: /open imprint and privacy policy/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders a decoded mailto link when mail icon is enabled", () => {
    render(<LegalDialog triggerLabel="Impressum" showMailIcon />);

    const mailLink = screen.getByRole("link", { name: /contact by email/i });
    expect(mailLink).toHaveAttribute("href", `mailto:${resolveLegalContactEmail()}`);
    expect(resolveLegalContactEmail()).toBe("mail@nodex.nexus");
  });
});
