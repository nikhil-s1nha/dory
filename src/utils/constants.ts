/**
 * App-wide constants
 */

export const APP_NAME = 'Candle';
export const APP_VERSION = '1.0.0';
export const BUNDLE_IDENTIFIER = 'com.encore.candleapp';

// API endpoints (to be configured)
export const API_ENDPOINTS = {
  BASE_URL: '', // Will be set via environment variables
  AUTH: '/auth',
  USERS: '/users',
  PARTNERSHIPS: '/partnerships',
  QUESTIONS: '/questions',
  ANSWERS: '/answers',
} as const;

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@candle/auth_token',
  USER_DATA: '@candle/user_data',
  PARTNERSHIP_DATA: '@candle/partnership_data',
} as const;
