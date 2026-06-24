// Dismisses the express splash painted by index.html. The two logo strokes
// slide apart along their diagonal axis while the overlay dissolves and the app
// fades in underneath (see #splash styles in index.html). Driven from main.tsx
// once React has committed its first frame.

// Minimum time the splash stays up so the express icon is actually seen rather
// than flashing for a single frame on fast loads / warm caches.
const MIN_SPLASH_MS = 450;
// Longest dismiss transition in index.html (stroke transform/opacity is 800ms;
// the background fade is shorter). Remove only after this so the glide isn't cut.
const DISMISS_MS = 800;

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
  // Strokes slide apart + overlay dissolves.
  splash.classList.add("splash-hide");

  // Remove on a fixed timeout rather than transitionend: several properties
  // transition here (background-color at 650ms, stroke transform/opacity at
  // 800ms) and the first transitionend would fire at 650ms, cutting the glide.
  window.setTimeout(() => splash.remove(), DISMISS_MS + 150);
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
