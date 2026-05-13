import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ProfileEditorFields } from "./ProfileEditorFields";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const noopActions = {
  setUsername: vi.fn(),
  setDisplayName: vi.fn(),
  setPicture: vi.fn(),
  setNip05: vi.fn(),
  setAbout: vi.fn(),
};

const noopFields = {
  username: "",
  displayName: "",
  picture: "",
  nip05: "",
  about: "",
};

const idleValidation = {
  usernameHint: null,
  isUsernameHintError: false,
  nip05VerifyStatus: "idle" as const,
};

describe("ProfileEditorFields", () => {
  it("surfaces the upload error message from the noas client in the toast description", async () => {
    const onNoasPictureUpload = vi.fn(async () => ({ error: "File too large (max 5MB)" }));

    render(
      <ProfileEditorFields
        fields={noopFields}
        validation={idleValidation}
        fieldActions={noopActions}
        t={(key) => key}
        onNoasPictureUpload={onNoasPictureUpload}
      />
    );

    const file = new File(["x"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onNoasPictureUpload).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "auth.profile.pictureUploadFailed",
        { description: "File too large (max 5MB)" },
      ),
    );
  });

  it("shows nip05 error detail under the verify hint when verification errors out", () => {
    render(
      <ProfileEditorFields
        fields={noopFields}
        validation={{
          ...idleValidation,
          nip05VerifyStatus: "error",
          nip05VerifyErrorDetail: "DNS lookup failed",
        }}
        fieldActions={noopActions}
        t={(key) => key}
      />
    );

    expect(screen.getByText("auth.profile.nip05VerifyError")).toBeInTheDocument();
    expect(screen.getByText("DNS lookup failed")).toBeInTheDocument();
  });
});
