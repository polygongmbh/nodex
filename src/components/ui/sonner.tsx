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
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      closeButton
      expand={false}
      visibleToasts={2}
      offset={12}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      toastOptions={{
        duration: isMobile ? 1800 : 2800,
        dismissible: true,
        closeButton: true,
        classNames: {
          toast:
            "group toast cursor-pointer group-[.toaster]:bg-card/95 group-[.toaster]:text-foreground group-[.toaster]:border-border/80 group-[.toaster]:shadow-2xl group-[.toaster]:backdrop-blur-md",
          success:
            "group-[.toaster]:border-success/85 group-[.toaster]:bg-success/40 group-[.toaster]:text-success-foreground",
          info:
            "group-[.toaster]:border-primary/65 group-[.toaster]:bg-primary/30 group-[.toaster]:text-foreground",
          warning:
            "group-[.toaster]:border-warning/70 group-[.toaster]:bg-warning/30 group-[.toaster]:text-foreground",
          error:
            "group-[.toaster]:border-destructive/75 group-[.toaster]:bg-destructive/25 group-[.toaster]:text-foreground",
          description: "group-[.toast]:text-foreground/90",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
