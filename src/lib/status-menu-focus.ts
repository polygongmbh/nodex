export function shouldAutoOpenStatusMenuOnFocus(
  target: HTMLElement,
  hadPointerDownOnTrigger: boolean
): boolean {
  if (hadPointerDownOnTrigger) return false;
  return target.matches(":focus-visible");
}
