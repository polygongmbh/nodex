import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";

function ControlledNoasAuthForm({
  onLogin = vi.fn(async () => true),
  onNoasHostUrlChange,
  initialUsername = "",
  initialPassword = "",
  initialNoasHostUrl = "https://noas.example.com",
  error,
  allowDirectHostEdit = false,
}: {
  onLogin?: Parameters<typeof NoasAuthForm>[0]["onLogin"];
  onNoasHostUrlChange?: (value: string) => void;
  initialUsername?: string;
  initialPassword?: string;
  initialNoasHostUrl?: string;
  error?: string;
  allowDirectHostEdit?: boolean;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const [noasHostUrl, setNoasHostUrl] = useState(initialNoasHostUrl);
  const [isEditingHostUrl, setIsEditingHostUrl] = useState(false);

  return (
    <NoasAuthForm
      onLogin={onLogin}
      onSignUp={vi.fn()}
      onBack={vi.fn()}
      username={username}
      password={password}
      isEditingHostUrl={isEditingHostUrl}
      allowDirectHostEdit={allowDirectHostEdit}
      isLoading={false}
      error={error}
      noasHostUrl={noasHostUrl}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onNoasHostUrlChange={(value) => {
        setNoasHostUrl(value);
        onNoasHostUrlChange?.(value);
      }}
      onToggleHostEdit={() => setIsEditingHostUrl((current) => !current)}
    />
  );
}

describe("Noas auth forms", () => {
  it("shows a more options button on the sign-in form", () => {
    render(
      <ControlledNoasAuthForm />
    );

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
    expect(screen.queryByText(/your keys are encrypted/i)).not.toBeInTheDocument();
  });

  it("edits the noas host in the username row only after enabling the pencil control", () => {
    const onNoasHostUrlChange = vi.fn();

    render(<ControlledNoasAuthForm onNoasHostUrlChange={onNoasHostUrlChange} />);

    const hostInput = screen.getByLabelText(/^host$/i);
    expect(hostInput).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    expect(hostInput).not.toHaveAttribute("readonly");

    fireEvent.change(hostInput, { target: { value: "custom.noas.example" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example");
  });

  it("preserves the port in the displayed and edited noas host", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <ControlledNoasAuthForm
        onNoasHostUrlChange={onNoasHostUrlChange}
        initialNoasHostUrl="https://custom.noas.example:8443"
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("custom.noas.example:8443");

    fireEvent.click(screen.getByRole("button", { name: /edit noas host/i }));
    fireEvent.change(hostInput, { target: { value: "other.noas.example:9443" } });

    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://other.noas.example:9443");
  });

  it("shows an unlocked empty host field without the pencil control when direct host edit is allowed", () => {
    const onNoasHostUrlChange = vi.fn();

    render(
      <ControlledNoasAuthForm
        allowDirectHostEdit
        initialNoasHostUrl=""
        onNoasHostUrlChange={onNoasHostUrlChange}
      />
    );

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput.value).toBe("");
    expect(hostInput).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /edit noas host/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/advanced only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/only change this if you know what you're doing/i)).not.toBeInTheDocument();

    fireEvent.change(hostInput, { target: { value: "custom.noas.example" } });
    expect(onNoasHostUrlChange).toHaveBeenCalledWith("https://custom.noas.example");
  });

  it("submits matching noas auth url and nip05 domain", async () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} initialNoasHostUrl="https://custom.noas.example" />);

    const usernameInput = screen.getByLabelText(/^username$/i);
    fireEvent.change(usernameInput, { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.submit(usernameInput.closest("form") as HTMLFormElement);

    expect(onLogin).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://custom.noas.example",
    });
  });

  it("validates sign-in username with sign-up rules before submitting", () => {
    const onLogin = vi.fn(async () => true);

    render(<ControlledNoasAuthForm onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "ab" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/username must be 3-32 characters/i)).toBeInTheDocument();
  });

  it("shows only one sign-in error message when submit failure also returns a parent error", async () => {
    const onLogin = vi.fn(async () => false);
    const parentError = "Noas sign-in failed. Please check your username and password.";

    render(
      <ControlledNoasAuthForm
        onLogin={onLogin}
        initialUsername="alice"
        initialPassword="password123"
        error={parentError}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(screen.getAllByText(parentError)).toHaveLength(1);
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("shows a more options button on the sign-up form", () => {
    render(
      <NoasSignUpForm
        onSignUp={vi.fn(async () => true)}
        onSignIn={vi.fn()}
        onBack={vi.fn()}
        username=""
        password=""
        isEditingHostUrl={false}
        isLoading={false}
        noasHostUrl="https://noas.example.com"
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onToggleHostEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
    expect(screen.getByText(/your keys are encrypted/i)).toBeInTheDocument();
  });
});
