/**
 * Core type definitions for Candle app
 */

import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

/**
 * User model
 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  partnerId?: string;
  profilePicture?: string;
  anniversaryDate?: string;
  referralRewards?: ReferralRewards;
  referralCode?: string; // User's own referral code
  createdAt: string;
  updatedAt: string;
}

/**
 * Partnership model
 */
export interface Partnership {
  id: string;
  userId1: string;
  userId2: string;
  status: 'pending' | 'active' | 'paused';
  anniversaryDate?: string;
  streakCount: number;
  lastActivityDate: string;
  previousStreakCount?: number;
  streakRestoreAvailable?: boolean;
  streakRestoreUsed?: boolean;
  inviteCode?: string;
  skippedQuestionIds?: string[];
  typingUsers?: string[];
  lastCanvasActivityDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Question model
 */
export interface Question {
  id: string;
  text: string;
  category: string;
  type: 'text' | 'voice' | 'photo' | 'multiple_choice' | 'this_or_that';
  deckId: string;
  mediaUrl?: string;
  options?: string[];
  createdAt: string;
}

/**
 * Answer model
 */
export interface Answer {
  id: string;
  questionId: string;
  userId: string;
  partnershipId: string;
  text: string;
  type: 'text' | 'voice' | 'photo';
  mediaUrl?: string;
  isRevealed: boolean;
  reactions?: Reaction[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Navigation types for type-safe routing
 */
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ProfileSetup: undefined;
  Pairing: {code?: string} | undefined;
  AnniversarySetup: undefined;
  OnboardingTutorial: undefined;
};

export type MainTabParamList = {
  Connect: undefined;
  Games: undefined;
  DateIdeas: undefined;
  Photos: undefined;
  Profile: undefined;
  ThumbKisses: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  Settings: undefined;
  QuestionDetail: {questionId?: string; question?: any; answers?: any[]};
  DeckBrowser: undefined;
  QuestionHistory: undefined;
  CanvasEditor: undefined;
  CanvasGallery: undefined;
  PhotoDetail: {promptId: string} | {prompt: PhotoPrompt};
  WhosMoreLikely: undefined;
  Anagrams: undefined;
  WhatYouSaying: undefined;
  FourInARow: undefined;
  DrawDuel: undefined;
  PerfectPair: undefined;
  StickerGenerator: undefined;
  GameLeaderboard: {gameType: string; gameName: string};
  Chat: {questionId?: string; question?: any} | undefined;
  DateIdeaDetail: {dateIdeaId: string} | {dateIdea: DateIdea};
  ThumbKisses: undefined;
  Countdown: undefined;
  Referral: undefined;
};

export type GameParams = {
  gameId: string;
};

export type QuestionParams = {
  questionId: string;
};

export type CountdownParams = {
  countdownId: string;
};

export interface NotificationSettings {
  pushEnabled: boolean;
  dailyPromptReminder: boolean;
  dailyQuestionReminder: boolean;
  streakReminder: boolean;
  partnerActivityNotifications: boolean;
  preferredNotificationTime: string;
}

export interface PrivacySettings {
  dataEncryptionEnabled: boolean;
}

/**
 * Message model
 */
export interface Message {
  id: string;
  partnershipId: string;
  senderId: string;
  content: string;
  type: 'text' | 'photo' | 'voice';
  mediaUrl?: string;
  reactions?: Reaction[];
  questionId?: string;
  deleted?: boolean;
  readReceipts?: Record<string, string>; // userId -> timestamp
  createdAt: string;
  updatedAt: string;
}

/**
 * CanvasDrawing model
 */
export interface CanvasDrawing {
  id: string;
  partnershipId: string;
  drawingData: string;
  thumbnail?: string;
  createdBy: string;
  createdAt: string;
  isCurrent: boolean;
  backgroundColor?: string;
  metadata?: {
    canvasSize?: 'small' | 'medium' | 'large';
    backgroundColor?: string;
    canvasWidth?: number;
    canvasHeight?: number;
  };
}

/**
 * Countdown model
 */
export interface Countdown {
  id: string;
  partnershipId: string;
  title: string;
  targetDate: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GameScore model
 */
export interface GameScore {
  id: string;
  gameType: 'whos_more_likely' | 'anagrams' | 'what_you_saying' | 'four_in_a_row' | 'draw_duel' | 'perfect_pair' | 'sticker_generator';
  partnershipId: string;
  userId: string;
  score: number;
  metadata?: Record<string, any>;
  playedAt: string;
}

/**
 * Game State model for turn-based game state management
 */
export interface GameState {
  id: string;
  partnershipId: string;
  gameType: 'whos_more_likely' | 'anagrams' | 'what_you_saying' | 'four_in_a_row' | 'draw_duel' | 'perfect_pair' | 'sticker_generator';
  currentPlayerId?: string;
  state: WhosMoreLikelyState | AnagramsState | WhatYouSayingState | FourInARowState | DrawDuelState | PerfectPairState | Record<string, any>;
  isActive: boolean;
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Who's More Likely game state
 */
export interface WhosMoreLikelyState {
  currentPromptIndex: number;
  user1Vote?: string;
  user2Vote?: string;
  agreements: number;
  disagreements: number;
  round: number;
  prompts: string[];
}

/**
 * Anagrams game state
 */
export interface AnagramsState {
  currentWordIndex: number;
  user1Score: number;
  user2Score: number;
  user1CurrentWord?: string;
  user2CurrentWord?: string;
  user1TimeRemaining?: number;
  user2TimeRemaining?: number;
  words: Array<{word: string; scrambled: string; hint: string}>;
}

/**
 * What You Saying game state
 */
export interface WhatYouSayingState {
  round: number;
  currentWordIndex: number;
  describerId: string;
  guesserId: string;
  currentWord?: string;
  guess?: string;
  user1Correct: number;
  user2Correct: number;
  timeRemaining?: number;
  words: Array<{word: string; difficulty: string}>;
}

/**
 * Four-in-a-Row game state
 */
export interface FourInARowState {
  board: number[][];
  currentPlayerId: string;
  player1Id: string;
  player2Id: string;
  winnerId?: string;
  isDraw: boolean;
}

/**
 * Draw Duel game state
 */
export interface DrawDuelState {
  round: number;
  currentPromptIndex: number;
  user1Drawing?: string;
  user2Drawing?: string;
  user1Vote?: string;
  user2Vote?: string;
  user1Wins: number;
  user2Wins: number;
  prompts: Array<{prompt: string; difficulty: string}>;
  timeRemaining?: number;
}

/**
 * Perfect Pair game state
 */
export interface PerfectPairState {
  cards: Array<{id: number; emoji: string; isFlipped: boolean; isMatched: boolean}>;
  flippedCards: number[];
  user1Time?: number;
  user2Time?: number;
  user1Moves: number;
  user2Moves: number;
  currentPlayerId: string;
  isComplete: boolean;
  startTime: string; // ISO timestamp when game started
}

/**
 * Reaction model
 */
export interface Reaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

/**
 * PhotoPrompt model
 */
export interface PhotoPrompt {
  id: string;
  partnershipId: string;
  promptText: string;
  promptDate: string;
  user1PhotoUrl?: string;
  user2PhotoUrl?: string;
  user1UploadedAt?: string;
  user2UploadedAt?: string;
  createdAt: string;
}

/**
 * Date Idea model
 */
export interface DateIdea {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  location: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  price?: string;
  duration?: string;
  tags?: string[];
  source?: string;
  eventDate?: string;
  createdAt: string;
}

/**
 * Date Swipe model
 */
export interface DateSwipe {
  id: string;
  partnershipId: string;
  userId: string;
  dateIdeaId: string;
  direction: 'left' | 'right';
  createdAt: string;
}

/**
 * Date Match model
 */
export interface DateMatch {
  id: string;
  partnershipId: string;
  dateIdeaId: string;
  matchedAt: string;
  status: 'new' | 'viewed' | 'completed';
  notes?: string;
}

/**
 * ThumbKiss model
 */
export interface ThumbKiss {
  id: string;
  partnershipId: string;
  userId: string;
  /**
   * Server timestamp preferred (Firestore Timestamp); may be a string for legacy data.
   */
  timestamp: string | FirebaseFirestoreTypes.Timestamp;
  createdAt: string | FirebaseFirestoreTypes.Timestamp;
  /**
   * Optional client timestamp used for local/optimistic UI.
   */
  clientTimestamp?: string;
}

/**
 * Referral model
 */
export interface Referral {
  id: string;
  referrerId: string; // User who sent the referral
  referredUserId?: string; // User who signed up with code
  referralCode: string; // Unique referral code
  status: 'pending' | 'completed' | 'expired';
  rewardType?: 'free_month' | 'premium_feature';
  rewardGranted: boolean;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

/**
 * Referral statistics
 */
export interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  currentReward?: string;
}

/**
 * Referral rewards
 */
export interface ReferralRewards {
  freeMonths: number;
  streakRestores: number;
}

/**
 * Common utility types
 */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ID = string;
