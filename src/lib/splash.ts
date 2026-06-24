// Dismisses the express splash painted by index.html. The icon zooms in while
// the overlay fades out and the app fades in underneath (see #splash styles in
// index.html). Driven from main.tsx once React has committed its first frame.

// Minimum time the splash stays up so the express icon is actually seen rather
// than flashing for a single frame on fast loads / warm caches.
const MIN_SPLASH_MS = 450;
// How long the dismiss transition runs in index.html (opacity/transform 700ms).
const DISMISS_MS = 700;

const splashShownAt =
  typeof performance !== "undefined" ? performance.now() : 0;

let dismissed = false;

function runDismiss(): void {
  if (dismissed) return;
  dismissed = true;

  const root = document.documentElement;
  const splash = document.getElementById("splash");

  // App fades in (removes html.app-loading → #root opacity 1).
  root.classList.remove("app-loading");

  if (!splash) return;
  // Icon zooms + overlay fades.
  splash.classList.add("splash-hide");

  const remove = () => splash.remove();
  splash.addEventListener("transitionend", remove, { once: true });
  // Fallback removal in case transitionend never fires (e.g. tab backgrounded).
  window.setTimeout(remove, DISMISS_MS + 200);
}

/**
 * Schedule the splash dismiss. Waits for the next paint and the minimum display
 * time, whichever is later, so the app is visible behind the fade.
 */
export function dismissSplash(): void {
  const elapsed =
    typeof performance !== "undefined" ? performance.now() - splashShownAt : MIN_SPLASH_MS;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);

  // Double rAF ensures the app's first frame has painted before we fade it in.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(runDismiss, wait);
    });
  });
}
