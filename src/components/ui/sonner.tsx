import { Toaster as Sonner, toast } from "sonner";
import { useEffect, useState } from "react";
import { useThemeMode } from "@/components/theme/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

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
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const toastElement = target.closest("[data-sonner-toast]");
      if (!toastElement) return;
      toast.dismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <Sonner
      theme={(mode === "auto" ? "system" : mode) as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      richColors
      closeButton
      visibleToasts={2}
      offset={12}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      toastOptions={{
        duration: isMobile ? 1800 : 2800,
        dismissible: true,
        closeButton: true,
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
