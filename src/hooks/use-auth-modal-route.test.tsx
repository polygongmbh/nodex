import { render, screen, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useAuthModalRoute } from "./use-auth-modal-route";

function Harness() {
  const location = useLocation();
  const {
    isAuthModalOpen,
    authModalInitialStep,
    handleOpenAuthModal,
    handleCloseAuthModal,
  } = useAuthModalRoute();

  return (
    <>
      <output data-testid="pathname">{location.pathname}</output>
      <output data-testid="is-open">{String(isAuthModalOpen)}</output>
      <output data-testid="step">{authModalInitialStep ?? "undefined"}</output>
      <button onClick={() => handleOpenAuthModal("noas")}>open-signin</button>
      <button onClick={() => handleOpenAuthModal("noasSignUp")}>open-signup</button>
      <button onClick={() => handleOpenAuthModal()}>open-chooser</button>
      <button onClick={handleCloseAuthModal}>close</button>
    </>
  );
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Harness />} />
        <Route path="/feed" element={<Harness />} />
        <Route path="/signin" element={<Harness />} />
        <Route path="/signup" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("useAuthModalRoute", () => {
  it("opens the sign-in modal directly from /signin", () => {
    renderAt("/signin");

    expect(screen.getByTestId("pathname")).toHaveTextContent("/signin");
    expect(screen.getByTestId("is-open")).toHaveTextContent("true");
    expect(screen.getByTestId("step")).toHaveTextContent("noas");
  });

  it("opens the sign-up modal directly from /signup", () => {
    renderAt("/signup");

    expect(screen.getByTestId("pathname")).toHaveTextContent("/signup");
    expect(screen.getByTestId("is-open")).toHaveTextContent("true");
    expect(screen.getByTestId("step")).toHaveTextContent("noasSignUp");
  });

  it("navigates onboarding-style sign-up opens to /signup", () => {
    renderAt("/feed");

    act(() => screen.getByRole("button", { name: "open-signup" }).click());

    expect(screen.getByTestId("pathname")).toHaveTextContent("/signup");
    expect(screen.getByTestId("is-open")).toHaveTextContent("true");
    expect(screen.getByTestId("step")).toHaveTextContent("noasSignUp");
  });

  it("keeps generic chooser opens on the current route", () => {
    renderAt("/feed");

    act(() => screen.getByRole("button", { name: "open-chooser" }).click());

    expect(screen.getByTestId("pathname")).toHaveTextContent("/feed");
    expect(screen.getByTestId("is-open")).toHaveTextContent("true");
    expect(screen.getByTestId("step")).toHaveTextContent("undefined");
  });

  it("returns auth-route closes to /feed", () => {
    renderAt("/signup");

    act(() => screen.getByRole("button", { name: "close" }).click());

    expect(screen.getByTestId("pathname")).toHaveTextContent("/feed");
    expect(screen.getByTestId("is-open")).toHaveTextContent("false");
    expect(screen.getByTestId("step")).toHaveTextContent("undefined");
  });
});
