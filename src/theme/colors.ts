/**
 * Color palette for Candle app
 * Warm, playful color scheme with support for various UI states
 */

export const colors = {
  // Primary colors
  primary: '#FF6B6B',
  primaryDark: '#EE5A5A',
  primaryLight: '#FF8E8E',

  // Secondary colors
  secondary: '#4ECDC4',
  secondaryDark: '#3FB3AB',
  secondaryLight: '#6EDDD5',

  // Accent colors
  accent: '#FFE66D',
  accentDark: '#FFD93D',
  accentLight: '#FFF4A3',

  // Background colors
  background: '#FFF8F0',
  backgroundDark: '#F5EDE0',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Text colors
  text: '#2C3E50',
  textSecondary: '#7F8C8D',
  textLight: '#95A5A6',
  textInverse: '#FFFFFF',

  // State colors
  success: '#51CF66',
  error: '#FF6B6B',
  warning: '#FFD43B',
  info: '#4ECDC4',

  // Border and divider colors
  border: '#E9ECEF',
  divider: '#DEE2E6',
} as const;

export type Colors = typeof colors;
