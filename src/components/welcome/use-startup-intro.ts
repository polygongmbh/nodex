import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

const STARTUP_INTRO_DELAY_MS = 300;

interface UseStartupIntroOptions {
  user: { pubkey?: string } | null | undefined;
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
  onStartTour: () => void;
}

export function useStartupIntro({ user, openedWithFocusedTaskRef, onStartTour }: UseStartupIntroOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [showOnStartup] = useState(() => !openedWithFocusedTaskRef.current && !user);

  useEffect(() => {
    if (!showOnStartup || user) return;
    const id = window.setTimeout(() => setIsOpen(true), STARTUP_INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [showOnStartup, user]);

  useEffect(() => {
    if (!user) return;
    setIsOpen(false);
  }, [user]);

  const onStartTourRef = useRef(onStartTour);
  onStartTourRef.current = onStartTour;

  const handleStartTour = useCallback(() => {
    setIsOpen(false);
    onStartTourRef.current();
  }, []);

  const closeIntro = useCallback(() => setIsOpen(false), []);

  return { isOpen, handleStartTour, closeIntro };
}
