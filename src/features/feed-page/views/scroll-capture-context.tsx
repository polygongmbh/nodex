import { createContext, useContext } from "react";

export interface ScrollCaptureHandler {
  getScrollTop: () => number;
  setScrollTop: (scrollTop: number) => void;
}

export type ScrollCaptureRef = { current: ScrollCaptureHandler | null };

const ScrollCaptureContext = createContext<ScrollCaptureRef>({ current: null });

export function ScrollCaptureProvider({
  value,
  children,
}: {
  value: ScrollCaptureRef;
  children: React.ReactNode;
}) {
  return <ScrollCaptureContext.Provider value={value}>{children}</ScrollCaptureContext.Provider>;
}

export function useScrollCapture(): ScrollCaptureRef {
  return useContext(ScrollCaptureContext);
}
