/**
 * Spacing system for Candle app
 * Based on 4px base unit for consistent spacing
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

/**
 * Helper function to get spacing value
 * @param key - Spacing key (xs, sm, md, base, lg, xl, 2xl, 3xl)
 * @returns Spacing value in pixels
 */
export const getSpacing = (key: keyof typeof spacing): number => {
  return spacing[key];
};

export type Spacing = typeof spacing;
