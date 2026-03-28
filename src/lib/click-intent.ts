/**
 * Returns true when the browser has a non-empty text selection,
 * indicating the user dragged to select text rather than clicking.
 * Use in click handlers to avoid navigating on text-select gestures.
 */
export function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return Boolean(sel && sel.toString().trim().length > 0);
}
