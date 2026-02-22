export function buildCollapsedPreviewItems<T>(
  items: T[],
  isSelected: (item: T) => boolean,
  maxUnselectedItems: number
): T[] {
  const selectedItems = items.filter(isSelected);
  const unselectedItems = items.filter((item) => !isSelected(item)).slice(0, Math.max(0, maxUnselectedItems));
  return [...selectedItems, ...unselectedItems];
}
