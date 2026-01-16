/**
 * Core type definitions for Candle app
 */

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
  inviteCode?: string;
  skippedQuestionIds?: string[];
  typingUsers?: string[];
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

export type MainTabParamList = {
  Connect: undefined;
  Games: undefined;
  DateIdeas: undefined;
  Photos: undefined;
  Profile: undefined;
};

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
  gameType: 'whos_more_likely' | 'anagrams' | 'what_you_saying' | 'four_in_a_row' | 'draw_duel' | 'perfect_pair';
  partnershipId: string;
  userId: string;
  score: number;
  metadata?: Record<string, any>;
  playedAt: string;
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
 * Common utility types
 */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ID = string;
