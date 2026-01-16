/**
 * Typography system for Candle app
 * Defines font families, sizes, weights, and line heights
 */

export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    // Placeholder for custom fonts
    // regular: 'Inter-Regular',
    // medium: 'Inter-Medium',
    // bold: 'Inter-Bold',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  // Text style presets
  styles: {
    heading1: {
      fontSize: 36,
      fontWeight: '700' as const,
      lineHeight: 1.2,
    },
    heading2: {
      fontSize: 30,
      fontWeight: '700' as const,
      lineHeight: 1.2,
    },
    heading3: {
      fontSize: 24,
      fontWeight: '600' as const,
      lineHeight: 1.3,
    },
    heading4: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 1.4,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 1.5,
    },
    bodyLarge: {
      fontSize: 18,
      fontWeight: '400' as const,
      lineHeight: 1.5,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 1.4,
    },
    button: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 1.5,
    },
  },
} as const;

export type Typography = typeof typography;
