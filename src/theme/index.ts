/**
 * Theme configuration for Candle app
 * Combines colors, typography, and spacing into a unified theme object
 */

import {colors, Colors} from './colors';
import {typography, Typography} from './typography';
import {spacing, Spacing} from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
} as const;

export type Theme = typeof theme;

export {colors, Colors};
export {typography, Typography};
export {spacing, Spacing};

// Theme context type for future use
export interface ThemeContextType {
  theme: Theme;
  colors: Colors;
  typography: Typography;
  spacing: Spacing;
}
