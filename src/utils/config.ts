/**
 * Environment configuration
 * Provides typed access to environment variables
 */

import Config from 'react-native-config';

interface AppConfig {
  API_BASE_URL: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_STORAGE_BUCKET: string;
  FIREBASE_MESSAGING_SENDER_ID: string;
  FIREBASE_APP_ID: string;
}

export const config: AppConfig = {
  API_BASE_URL: Config.API_BASE_URL || '',
  ENVIRONMENT: (Config.ENVIRONMENT as 'development' | 'staging' | 'production') || 'development',
  FIREBASE_API_KEY: Config.FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: Config.FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: Config.FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: Config.FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: Config.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: Config.FIREBASE_APP_ID || '',
};
