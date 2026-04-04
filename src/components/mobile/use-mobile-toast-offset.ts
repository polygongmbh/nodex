import { useLayoutEffect } from "react";

export const MOBILE_TOAST_TOP_OFFSET_CSS_VAR = "--mobile-toast-top-offset";

const MOBILE_NAV_HEIGHT_PX = 56;
const MOBILE_BREADCRUMB_HEIGHT_PX = 40;

interface UseMobileToastOffsetOptions {
  hasBreadcrumbOffset: boolean;
}

export function useMobileToastOffset({ hasBreadcrumbOffset }: UseMobileToastOffsetOptions) {
  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const offset = MOBILE_NAV_HEIGHT_PX + (hasBreadcrumbOffset ? MOBILE_BREADCRUMB_HEIGHT_PX : 0);

    root.style.setProperty(MOBILE_TOAST_TOP_OFFSET_CSS_VAR, `${offset}px`);

    return () => {
      root.style.removeProperty(MOBILE_TOAST_TOP_OFFSET_CSS_VAR);
    };
  }, [hasBreadcrumbOffset]);
}
