import { useTranslation } from "react-i18next";
import { Paperclip, Calendar } from "lucide-react";

interface ComposeExtrasMenuProps {
  open: boolean;
  uploadEnabled?: boolean;
  onAttachMedia: () => void;
  onAttachEvent: () => void;
  onClose: () => void;
}

/**
 * Timeline-only popover anchored to the compose "extras" button, mirroring the
 * send-options row styling. Offers attaching media or an event; the event turns
 * the message into a NIP-52 calendar post.
 */
export function ComposeExtrasMenu({
  open,
  uploadEnabled = true,
  onAttachMedia,
  onAttachEvent,
  onClose,
}: ComposeExtrasMenuProps) {
  const { t } = useTranslation("composer");
  if (!open) return null;
  return (
    <>
      {/* Tap-catcher to dismiss on outside press (visual-only app, no a11y target). */}
      <div className="fixed inset-0 z-[115]" onClick={onClose} />
      <div className="absolute bottom-full left-0 mb-1.5 flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg z-[116] min-w-[11rem]">
        {uploadEnabled && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onAttachMedia();
            }}
            className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left hover:bg-muted"
            data-testid="compose-attach-media"
          >
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            {t("composer.extras.attachMedia")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onClose();
            onAttachEvent();
          }}
          className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left hover:bg-muted"
          data-testid="compose-attach-event"
        >
          <Calendar className="w-4 h-4 text-muted-foreground" />
          {t("composer.extras.attachEvent")}
        </button>
      </div>
    </>
  );
}
