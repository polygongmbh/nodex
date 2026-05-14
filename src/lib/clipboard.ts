/**
 * Copy text to the clipboard, with a best-effort textarea+execCommand
 * fallback for browsers/contexts where the async Clipboard API is
 * unavailable (e.g. non-secure HTTP origins on mobile).
 *
 * Must be invoked synchronously from a user gesture for the fallback to
 * work on Safari/iOS.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn("[clipboard] async writeText failed, trying fallback", error);
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // Off-screen, but still in the rendered tree so selection works.
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch (error) {
    console.warn("[clipboard] legacy copy failed", error);
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
