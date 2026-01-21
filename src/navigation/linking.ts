/**
 * Deep linking configuration for React Navigation
 * Handles URL schemes and invite code deep links
 */

import {Linking} from 'react-native';
import {LinkingOptions} from '@react-navigation/native';
import type {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
  MainTabParamList,
} from '@utils/types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['candle://', 'https://candle.app'],
  config: {
    screens: {
      Auth: {
        screens: {
          Pairing: {
            path: 'invite/:code',
            parse: {
              code: (code: string) => code,
            },
          },
        } as any,
      },
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Connect: {
                path: 'connect',
              },
              Games: {
                path: 'games',
              },
              DateIdeas: {
                path: 'date-ideas',
              },
              Photos: {
                path: 'photos',
              },
              Profile: {
                path: 'profile',
              },
            } as any,
          },
          Settings: {
            path: 'settings',
          },
          QuestionDetail: {
            path: 'questions/:questionId',
            parse: {
              questionId: (questionId: string) => questionId,
            },
          },
          DeckBrowser: {
            path: 'decks',
          },
          QuestionHistory: {
            path: 'questions/history',
          },
          // Add widget deep link routes
          CanvasEditor: {
            path: 'canvas',
          },
          Countdown: {
            path: 'countdown',
          },
          Photos: {
            path: 'photos',
          },
          Referral: {
            path: 'referral/:code?',
            parse: {
              code: (code: string) => code,
            },
          },
        } as any,
      },
    },
  },
  async getInitialURL() {
    // Check if app was opened from a deep link
    const url = await Linking.getInitialURL();
    return url;
  },
  subscribe(listener) {
    // Listen to incoming links from deep linking
    const onReceiveURL = ({url}: {url: string}) => {
      listener(url);
    };

    // Listen to URLs opened while app is running
    const subscription = Linking.addEventListener('url', onReceiveURL);

    return () => {
      subscription.remove();
    };
  },
};
