import { Toaster as Sonner, toast } from "sonner";
import { useEffect, useState } from "react";
import { useThemeMode } from "@/components/theme/ThemeProvider";
import { MOBILE_TOAST_TOP_OFFSET_CSS_VAR } from "@/components/mobile/use-mobile-toast-offset";

type ToasterProps = React.ComponentProps<typeof Sonner>;
const MOBILE_TOAST_TOP_OFFSET = `calc(var(${MOBILE_TOAST_TOP_OFFSET_CSS_VAR}, 0px) + 12px)`;
const MOBILE_TOAST_OFFSET = {
  top: MOBILE_TOAST_TOP_OFFSET,
  right: 12,
  bottom: 12,
  left: 12,
} as const;

const Toaster = ({ ...props }: ToasterProps) => {
  const { mode } = useThemeMode();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);
    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const toastElement = target?.closest("[data-sonner-toast]");
      if (!toastElement) return;
      const hasSelection = Boolean(window.getSelection?.()?.toString().trim());
      if (hasSelection) return;
      toast.dismiss();
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <Sonner
      theme={(mode === "auto" ? "system" : mode) as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      richColors
      closeButton
      swipeDirections={[]}
      visibleToasts={2}
      offset={isMobile ? MOBILE_TOAST_OFFSET : 12}
      mobileOffset={{ top: MOBILE_TOAST_TOP_OFFSET, left: 12, right: 12 }}
      toastOptions={{
        duration: isMobile ? 1800 : 2800,
        // dismissible: true,
        closeButton: true,
        style: {
          userSelect: "text",
          WebkitUserSelect: "text",
          touchAction: "auto",
        },
        actionButtonStyle: {
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          border: "1px solid hsl(var(--primary) / 0.35)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
