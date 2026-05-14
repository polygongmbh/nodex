interface BuildCollapsedPreviewItemsOptions<T> {
  items: T[];
  isSelected: (item: T) => boolean;
  maxItems: number;
  isPinned?: (item: T) => boolean;
  alwaysIncludePinned?: boolean;
  isAlwaysIncluded?: (item: T) => boolean;
}

export function getCollapsedPreviewMaxItems(screenHeight: number): number {
  if (screenHeight >= 900) return 8;
  if (screenHeight >= 720) return 6;
  return 4;
}

export function buildCollapsedPreviewItems<T>({
  items,
  isSelected,
  maxItems,
  isPinned = () => false,
  alwaysIncludePinned = false,
  isAlwaysIncluded = () => false,
}: BuildCollapsedPreviewItemsOptions<T>): T[] {
  const selectedItems = items.filter(isSelected);
  const alwaysItems = items.filter((item) => !isSelected(item) && isAlwaysIncluded(item));
  const pinnedItems = items.filter(
    (item) => !isSelected(item) && !isAlwaysIncluded(item) && isPinned(item)
  );
  const otherItems = items.filter(
    (item) => !isSelected(item) && !isAlwaysIncluded(item) && !isPinned(item)
  );
  const prioritizedItems = [...selectedItems, ...alwaysItems, ...pinnedItems, ...otherItems];
  const visibleItems = prioritizedItems.slice(0, Math.max(0, maxItems));

  const hasAlwaysIncluded = alwaysItems.length > 0;
  if (!alwaysIncludePinned && !hasAlwaysIncluded) {
    return visibleItems;
  }

  const visibleSet = new Set<T>(visibleItems);
  for (const item of items) {
    if ((alwaysIncludePinned && isPinned(item)) || isAlwaysIncluded(item)) {
      visibleSet.add(item);
    }
  }

  return prioritizedItems.filter((item) => visibleSet.has(item));
}
