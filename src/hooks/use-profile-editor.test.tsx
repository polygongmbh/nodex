import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProfileEditor, type Nip05ValidationResult } from "./use-profile-editor";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function ProfileEditorHarness() {
  const {
    fields: {
      username,
      displayName,
    },
    fieldActions: {
      setUsername,
      setDisplayName,
    },
  } = useProfileEditor({
    t: ((key: string) => key) as never,
    updateUserProfile: vi.fn(async () => true),
    publishEvent: vi.fn(async () => ({ success: true })),
  });

  return (
    <div>
      <input
        aria-label="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <input
        aria-label="Display name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />
    </div>
  );
}

describe("useProfileEditor", () => {
  it("auto-fills the username from display name while the username is empty", () => {
    render(<ProfileEditorHarness />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Jörg Müller_test" } });

    expect(screen.getByLabelText("Username")).toHaveValue("jorg-muller_test");
  });

  it("keeps auto-filled username in sync until the user edits the username manually", () => {
    render(<ProfileEditorHarness />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alice Example" } });
    expect(screen.getByLabelText("Username")).toHaveValue("alice-example");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alice Example Jr" } });
    expect(screen.getByLabelText("Username")).toHaveValue("alice-example-jr");

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "custom-user" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alice Example Sr" } });

    expect(screen.getByLabelText("Username")).toHaveValue("custom-user");
  });

  it("re-populates the username after it is cleared and the display name changes again", () => {
    render(<ProfileEditorHarness />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alice Example" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alice Example Two" } });

    expect(screen.getByLabelText("Username")).toHaveValue("alice-example-two");
  });

  it("exposes the validateNip05 error message when verification errors out", async () => {
    vi.useFakeTimers();
    try {
      const validateNip05 = vi.fn(
        async (): Promise<Nip05ValidationResult> => ({ status: "error", message: "DNS lookup failed" }),
      );

      function VerifyHarness() {
        const {
          fieldActions: { setNip05 },
          validation: { nip05VerifyStatus, nip05VerifyErrorDetail },
        } = useProfileEditor({
          t: ((key: string) => key) as never,
          updateUserProfile: vi.fn(async () => true),
          publishEvent: vi.fn(async () => ({ success: true })),
          validateNip05,
        });
        return (
          <div>
            <input aria-label="Nip05" onChange={(e) => setNip05(e.target.value)} />
            <span data-testid="status">{nip05VerifyStatus}</span>
            <span data-testid="detail">{nip05VerifyErrorDetail ?? ""}</span>
          </div>
        );
      }

      render(<VerifyHarness />);
      fireEvent.change(screen.getByLabelText("Nip05"), { target: { value: "alice@example.com" } });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(validateNip05).toHaveBeenCalledWith("alice@example.com");
      expect(screen.getByTestId("status").textContent).toBe("error");
      expect(screen.getByTestId("detail").textContent).toBe("DNS lookup failed");
    } finally {
      vi.useRealTimers();
    }
  });
});
