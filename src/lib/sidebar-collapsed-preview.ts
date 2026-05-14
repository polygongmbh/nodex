interface BuildCollapsedPreviewItemsOptions<T> {
  items: T[];
  isSelected: (item: T) => boolean;
  maxItems: number;
  isPinned?: (item: T) => boolean;
  alwaysIncludePinned?: boolean;
  isAlwaysIncluded?: (item: T) => boolean;
}

const COLLAPSED_PREVIEW_ROW_HEIGHT_PX = 80;
const COLLAPSED_PREVIEW_RESERVED_HEIGHT_PX = 360;
const COLLAPSED_PREVIEW_MIN_VISIBLE = 4;

export function getCollapsedPreviewMaxItems(screenHeight: number): number {
  const fits = Math.floor(
    (screenHeight - COLLAPSED_PREVIEW_RESERVED_HEIGHT_PX) / COLLAPSED_PREVIEW_ROW_HEIGHT_PX
  );
  return Math.max(COLLAPSED_PREVIEW_MIN_VISIBLE, fits);
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
