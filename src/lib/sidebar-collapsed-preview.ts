interface BuildCollapsedPreviewItemsOptions<T> {
  items: T[];
  isSelected: (item: T) => boolean;
  maxItems: number;
  isPinned?: (item: T) => boolean;
  alwaysIncludePinned?: boolean;
}

export function getCollapsedPreviewMaxItems(screenHeight: number): number {
  if (screenHeight >= 960) return 7;
  if (screenHeight >= 800) return 5;
  return 3;
}

export function buildCollapsedPreviewItems<T>({
  items,
  isSelected,
  maxItems,
  isPinned = () => false,
  alwaysIncludePinned = false,
}: BuildCollapsedPreviewItemsOptions<T>): T[] {
  const selectedItems = items.filter(isSelected);
  const pinnedItems = items.filter((item) => !isSelected(item) && isPinned(item));
  const otherItems = items.filter((item) => !isSelected(item) && !isPinned(item));
  const prioritizedItems = [...selectedItems, ...pinnedItems, ...otherItems];
  const visibleItems = prioritizedItems.slice(0, Math.max(0, maxItems));

  if (!alwaysIncludePinned) {
    return visibleItems;
  }

  const visibleSet = new Set<T>(visibleItems);
  for (const item of items) {
    if (isPinned(item)) {
      visibleSet.add(item);
    }
  }

  return prioritizedItems.filter((item) => visibleSet.has(item));
}
