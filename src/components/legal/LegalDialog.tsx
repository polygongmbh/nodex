import { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LegalSection = "imprint" | "privacy";

interface LegalDialogProps {
  triggerLabel?: string;
  triggerClassName?: string;
  defaultSection?: LegalSection;
  showMailIcon?: boolean;
  mailIconClassName?: string;
}

const MAIL_CHAR_CODES = [109, 97, 105, 108, 64, 110, 111, 100, 101, 120, 46, 110, 101, 120, 117, 115];

function resolveEmailAddress() {
  return String.fromCharCode(...MAIL_CHAR_CODES);
}

export function LegalDialog({
  triggerLabel = "Impressum & Datenschutz",
  triggerClassName,
  defaultSection = "imprint",
  showMailIcon = false,
  mailIconClassName,
}: LegalDialogProps) {
  // Legal copy is intentionally German-only for the current jurisdiction/compliance scope.
  const [section, setSection] = useState<LegalSection>(defaultSection);
  const emailAddress = useMemo(() => resolveEmailAddress(), []);

  return (
    <Dialog>
      <div className="inline-flex items-center gap-1">
        <DialogTrigger asChild>
          <button
            type="button"
            onClick={() => setSection(defaultSection)}
            className={cn(
              "text-xs text-muted-foreground/80 transition-colors hover:text-foreground",
              triggerClassName
            )}
            aria-label="Open imprint and privacy policy"
            title="Impressum und Datenschutzerklärung"
          >
            {triggerLabel}
          </button>
        </DialogTrigger>
        {showMailIcon ? (
          <a
            href={`mailto:${emailAddress}`}
            aria-label="Kontakt per E-Mail"
            title="Kontakt per E-Mail"
            className={cn(
              "inline-flex items-center justify-center rounded p-1 text-muted-foreground/80 transition-colors hover:text-foreground",
              mailIconClassName
            )}
          >
            <Mail className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      <DialogContent className="w-[calc(100%-1rem)] max-w-3xl p-0">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">Rechtliche Hinweise</DialogTitle>
          <DialogDescription>
            Impressum und Datenschutzerklärung für Nodex.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b border-border px-4 py-2 sm:px-6">
          <div className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setSection("imprint")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                section === "imprint" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Impressum
            </button>
            <button
              type="button"
              onClick={() => setSection("privacy")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                section === "privacy" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Datenschutz
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-4 py-3 text-sm sm:px-6 sm:py-4">
          {section === "imprint" ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Anbieterkennzeichnung (Impressum)</h3>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-foreground">Polygon GmbH</p>
                <p>Vertreten durch Geschäftsführer Janek Janetzko</p>
                <p>Handelsregister Coburg HRB 7580</p>
                <p>Bamberger Str. 43</p>
                <p>96215 Lichtenfels</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-foreground">Kontakt</p>
                <p>Bei Fragen zum Dienst oder zu diesen Angaben:</p>
                <a
                  href={`mailto:${emailAddress}`}
                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {emailAddress}
                </a>
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Datenschutzerklärung</h3>
              <p>
                Diese Datenschutzerklärung informiert über die Verarbeitung personenbezogener Daten bei der Nutzung
                der Web-Anwendung Nodex.
              </p>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Verantwortlicher</h4>
                <p>Polygon GmbH, Bamberger Str. 43, 96215 Lichtenfels, Deutschland</p>
                <p>
                  E-Mail:{" "}
                  <a
                    href={`mailto:${emailAddress}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {emailAddress}
                  </a>
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Arten der verarbeiteten Daten</h4>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Kontodaten aus dem Nostr-Kontext (z. B. Public Key, Profilmetadaten)</li>
                  <li>Vom Nutzer erstellte Inhalte (Tasks, Kommentare, Tags, Metadaten)</li>
                  <li>Technische Nutzungsdaten in Browser-Speichern (insbesondere localStorage)</li>
                  <li>Verbindungs- und relaybezogene Daten bei Kommunikation mit Nostr-Relays</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Zwecke und Rechtsgrundlagen</h4>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Bereitstellung der App-Funktionen und Nutzersitzung (Art. 6 Abs. 1 lit. b DSGVO)</li>
                  <li>Stabilität, Missbrauchsabwehr und technische Sicherheit (Art. 6 Abs. 1 lit. f DSGVO)</li>
                  <li>Optionale Funktionen auf Nutzerwunsch, z. B. Präferenzen (Art. 6 Abs. 1 lit. a oder lit. b DSGVO)</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4. Browser-Speicher (localStorage)</h4>
                <p>
                  Nodex nutzt localStorage für technisch notwendige App-Zustände, z. B. Relay-Auswahl, Filter, Drafts,
                  UI-Präferenzen oder Auth-Status. Diese Speicherung dient der vom Nutzer angeforderten Funktion des
                  Dienstes.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">5. Nostr-Relays und Übermittlungen</h4>
                <p>
                  Bei aktiver Nutzung werden Inhalte an ausgewählte Nostr-Relays übermittelt. Diese Relays können in
                  unterschiedlichen Staaten betrieben werden. Verarbeitungen durch Relay-Betreiber erfolgen in eigener
                  Verantwortung.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">6. Speicherdauer</h4>
                <p>
                  Lokale Browser-Daten bleiben bis zur Löschung durch den Nutzer oder bis zur Überschreibung erhalten.
                  An Relays publizierte Nostr-Inhalte können dauerhaft verfügbar bleiben und liegen außerhalb der
                  direkten Löschkontrolle des App-Betreibers.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">7. Empfänger</h4>
                <p>
                  Empfänger können eingesetzte Relay-Betreiber sowie technische Dienstleister für den Betrieb der
                  Web-Anwendung sein. Eine Weitergabe erfolgt nur, soweit dies für den Betrieb erforderlich ist oder
                  eine rechtliche Grundlage besteht.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">8. Betroffenenrechte</h4>
                <p>
                  Es bestehen Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
                  Widerspruch nach den gesetzlichen Voraussetzungen.
                </p>
                <p>
                  Zudem besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde, insbesondere am Sitz des
                  Verantwortlichen.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">9. Änderungen</h4>
                <p>
                  Diese Hinweise können angepasst werden, wenn sich rechtliche oder technische Rahmenbedingungen ändern.
                </p>
              </section>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function resolveLegalContactEmail() {
  return resolveEmailAddress();
}
