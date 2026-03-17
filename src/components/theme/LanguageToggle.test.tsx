import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n, { DEFAULT_LANGUAGE } from "@/lib/i18n/config";
import { LanguageToggle } from "./LanguageToggle";

describe("LanguageToggle", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it("reflects the active i18n language in its accessible label", async () => {
    render(<LanguageToggle />);

    const trigger = screen.getByLabelText(/language/i);
    expect(trigger).toHaveAttribute("title", expect.stringMatching(/English/));

    await i18n.changeLanguage("de");

    await waitFor(() => {
      expect(i18n.resolvedLanguage || i18n.language).toMatch(/^de/);
    });
    expect(trigger).toHaveAttribute("title", expect.stringMatching(/Deutsch/));
  });
});
