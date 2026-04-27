import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAuthRoute, resolveAuthRouteStep } from "@/lib/auth-routes";

export type AuthModalEntryStep = "choose" | "noas" | "noasSignUp";

export function useAuthModalRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialStep, setAuthModalInitialStep] = useState<AuthModalEntryStep | undefined>(undefined);

  const handleOpenAuthModal = useCallback((initialStep?: AuthModalEntryStep) => {
    if (initialStep === "noas" || initialStep === "noasSignUp") {
      navigate(buildAuthRoute(initialStep));
      return;
    }
    setAuthModalInitialStep(initialStep);
    setIsAuthModalOpen(true);
  }, [navigate]);

  const handleCloseAuthModal = useCallback(() => {
    setAuthModalInitialStep(undefined);
    setIsAuthModalOpen(false);
    if (resolveAuthRouteStep(location.pathname)) {
      navigate({ pathname: "/feed", search: location.search, hash: location.hash }, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const authRouteStep = resolveAuthRouteStep(location.pathname);
    if (!authRouteStep) return;
    setAuthModalInitialStep(authRouteStep);
    setIsAuthModalOpen(true);
  }, [location.pathname]);

  return {
    isAuthModalOpen,
    authModalInitialStep,
    setIsAuthModalOpen,
    handleOpenAuthModal,
    handleCloseAuthModal,
  };
}
