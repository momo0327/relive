import { useWindowDimensions } from 'react-native';

/**
 * Adaptive layout derived from the current window (not the device), so it
 * follows Split View, Stage Manager, rotation and iPhone Duo's outer/inner
 * displays. "Regular" approximates UIKit's regular horizontal size class.
 */
export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const regular = width >= 600;
  const gutter = regular ? 32 : 20;
  const contentWidth = Math.min(width - gutter * 2, 1100);

  // Gallery (masonry): 2 columns on compact widths; on regular widths an even
  // count so a folded iPhone Duo or a split iPad divides the grid cleanly.
  let galleryColumns = 2;
  if (regular) {
    const target = Math.max(4, Math.round(width / 240));
    galleryColumns = target % 2 === 0 ? target : target + 1;
  }

  // Trip cards: one column on compact widths, two or three on wide windows.
  // Large accessibility text gets wider cards.
  const cardMin = fontScale > 1.4 ? 460 : 340;
  const tripColumns = Math.max(1, Math.min(3, Math.floor(contentWidth / cardMin)));

  return {
    width,
    height,
    regular,
    landscape: width > height,
    gutter,
    contentWidth,
    /** Comfortable reading width for forms and text. */
    readableWidth: Math.min(width - gutter * 2, 560),
    galleryColumns,
    tripColumns,
  };
}
