import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAuthRoute, resolveAuthRouteStep } from "@/lib/auth-routes";
import { useAuthModalStore } from "@/features/auth/stores/auth-modal-store";

export type AuthModalEntryStep = "choose" | "noas" | "noasSignUp";

export function useAuthModalRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen);
  const setIsAuthModalOpen = useAuthModalStore((s) => s.setIsOpen);
  const [authModalInitialStep, setAuthModalInitialStep] = useState<AuthModalEntryStep | undefined>(undefined);

  const handleOpenAuthModal = useCallback((initialStep?: AuthModalEntryStep) => {
    if (initialStep === "noas" || initialStep === "noasSignUp") {
      navigate(buildAuthRoute(initialStep));
      return;
    }
    setAuthModalInitialStep(initialStep);
    setIsAuthModalOpen(true);
  }, [navigate, setIsAuthModalOpen]);

  const handleCloseAuthModal = useCallback(() => {
    setAuthModalInitialStep(undefined);
    setIsAuthModalOpen(false);
    if (!resolveAuthRouteStep(location.pathname)) return;
    // `/signin` and `/signup` would auto-reopen the modal via the effect below,
    // so we must navigate away. Prefer popping back to the prior page; fall back
    // to root for direct entries (refresh, deep link) where there's no history.
    if (location.key === "default") {
      navigate({ pathname: "/", search: location.search, hash: location.hash }, { replace: true });
    } else {
      navigate(-1);
    }
  }, [location.pathname, location.search, location.hash, location.key, navigate, setIsAuthModalOpen]);

  useEffect(() => {
    const authRouteStep = resolveAuthRouteStep(location.pathname);
    if (!authRouteStep) return;
    setAuthModalInitialStep(authRouteStep);
    setIsAuthModalOpen(true);
  }, [location.pathname, setIsAuthModalOpen]);

  return {
    isAuthModalOpen,
    authModalInitialStep,
    handleOpenAuthModal,
    handleCloseAuthModal,
  };
}
