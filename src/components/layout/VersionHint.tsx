import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";
import { APP_CHANGELOG } from "@/lib/changelog";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface VersionHintProps {
  className?: string;
  showChangelogLabel?: boolean;
}

export function VersionHint({ className, showChangelogLabel = false }: VersionHintProps) {
  const { t } = useTranslation();
  const version = APP_VERSION || "0.0.0";
  const releases = APP_CHANGELOG.slice(0, 16);
  const openChangelogLabel = t("version.openChangelogAria", { version });
  const buttonText = showChangelogLabel
    ? t("version.hintWithChangelog", { version })
    : `v${version}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-xs text-muted-foreground/80 transition-colors hover:text-foreground",
            className
          )}
          title={openChangelogLabel}
          aria-label={openChangelogLabel}
        >
          {buttonText}
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1rem)] max-w-3xl p-0">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">Nodex Changelog</DialogTitle>
          <DialogDescription>
            Version history and release highlights.
          </DialogDescription>
        </DialogHeader>
        <DialogScrollBody className="max-h-[75vh]" innerClassName="px-4 py-3 sm:px-6 sm:py-4">
          <div className="space-y-4">
            {releases.map((release) => (
              <article key={`${release.version}-${release.date || "undated"}`} className="rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
                <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">v{release.version}</h3>
                  {release.date ? (
                    <p className="text-xs text-muted-foreground">{release.date}</p>
                  ) : null}
                </header>
                {release.summary ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">{release.summary}</p>
                ) : null}
                <div className="mt-2.5 space-y-2.5">
                  {release.sections.map((section, index) => (
                    <section key={`${release.version}-section-${index}`}>
                      {section.title ? (
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
                          {section.title}
                        </h4>
                      ) : null}
                      <ul className={cn("mt-1 space-y-1.5 text-sm text-foreground/90", !section.title && "mt-0")}>
                        {section.items.map((item, itemIndex) => (
                          <li key={`${release.version}-${index}-${itemIndex}`} className="flex gap-2">
                            <span className="mt-[0.47rem] h-1 w-1 rounded-full bg-primary/80 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </DialogScrollBody>
      </DialogContent>
    </Dialog>
  );
}
