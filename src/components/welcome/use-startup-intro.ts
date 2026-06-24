import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

const STARTUP_INTRO_DELAY_MS = 300;

interface UseStartupIntroOptions {
  user: { pubkey?: string } | null | undefined;
  openedWithFocusedTaskRef: MutableRefObject<boolean>;
}

export function useStartupIntro({ user, openedWithFocusedTaskRef }: UseStartupIntroOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [showOnStartup] = useState(() => !openedWithFocusedTaskRef.current && !user);
  const userRef = useRef(user);

  userRef.current = user;

  useEffect(() => {
    if (!showOnStartup) return;
    const id = window.setTimeout(() => {
      if (!userRef.current) {
        setIsOpen(true);
      }
    }, STARTUP_INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [showOnStartup]);

  useEffect(() => {
    if (!user) return;
    setIsOpen(false);
  }, [user]);

  const closeIntro = useCallback(() => setIsOpen(false), []);

  return { isOpen, closeIntro };
}
