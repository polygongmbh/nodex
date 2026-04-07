

# Fix: Double-tap requirement on touch devices (tablet/desktop mode)

## Problem

On touch-enabled devices (iPad, touch laptops), interactive elements like sidebar buttons, view navigation tabs, and Kanban card drag handles require two taps: the first tap triggers the CSS `:hover` state, and only the second tap fires the actual click. This is a well-known browser behavior where touch devices simulate hover on first tap when hover-dependent styles are present.

Additionally, the 300ms tap delay (double-tap-to-zoom heuristic) can interfere with drag initiation on Kanban cards.

## Root cause

1. **No `touch-action: manipulation`** is set globally. This CSS property disables double-tap-to-zoom, eliminating the 300ms delay browsers impose on touch taps.
2. **Hover styles apply unconditionally** via Tailwind's `hover:` variant, which does not distinguish between pointer (mouse) and touch devices. Touch browsers "stick" the hover state on first tap, requiring a second tap to actually click.

## Plan

### 1. Add global `touch-action: manipulation` (src/index.css)

In the `@layer base` block, add `touch-action: manipulation` to all interactive elements. This tells the browser to skip the double-tap-to-zoom delay, making single taps respond instantly.

```css
/* Inside the existing * {} rule at line ~172 */
* {
  @apply border-border;
  touch-action: manipulation;
  /* ... existing scrollbar styles ... */
}
```

### 2. Scope Tailwind hover styles to pointer devices (tailwind.config.ts)

Override the `hover` variant in Tailwind to only apply on devices with a fine pointer (mouse/trackpad), using `@media (hover: hover) and (pointer: fine)`. This prevents touch devices from ever entering hover states that cause the "stuck hover / double-tap" behavior.

Add a `future` config key:

```ts
// tailwind.config.ts
export default {
  // ... existing config ...
  future: {
    hoverOnlyWhenSupported: true,
  },
  // ...
} satisfies Config;
```

Tailwind CSS v3.4+ supports `hoverOnlyWhenSupported: true`, which wraps all `hover:` utilities in `@media (hover: hover) and (pointer: fine)`. If on an older v3 without this flag, the alternative is a manual plugin override.

### 3. Verify Tailwind version supports the flag

Check `package.json` for the Tailwind version. If below 3.4, add a small plugin instead that redefines the `hover` variant.

## Files changed

| File | Change |
|---|---|
| `src/index.css` | Add `touch-action: manipulation` to the global `*` rule |
| `tailwind.config.ts` | Add `future: { hoverOnlyWhenSupported: true }` |

## Impact

- All tap interactions (sidebar, view nav, buttons, Kanban cards) will respond on first touch
- Drag-and-drop on touch devices will initiate without needing a "pre-tap"
- Mouse/trackpad hover behavior remains unchanged
- No visual changes on desktop

