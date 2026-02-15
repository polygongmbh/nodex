export function shouldAutoOpenStatusMenuOnFocus(target: HTMLElement): boolean {
  return target.matches(":focus-visible");
}
