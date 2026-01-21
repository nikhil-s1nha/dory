/**
 * Authentication service
 * Handles user authentication with Firebase Auth
 */

import {
  firebaseAuth,
  usersCollection,
  generateId,
  getTimestamp,
  userConverter,
} from './firebase';
import {useAuthStore} from '@store/authSlice';
import {User} from '@utils/types';
import {AuthError, getErrorMessage} from '@utils/errors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {validateReferralCode} from './referralService';

/**
 * Sign up a new user
 */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  try {
    // Create Firebase Auth user
    const userCredential = await firebaseAuth.createUserWithEmailAndPassword(
      email,
      password,
    );
    const firebaseUser = userCredential.user;

    if (!firebaseUser) {
      throw new AuthError('Failed to create user', 'auth/user-creation-failed');
    }

    // Get ID token
    const token = await firebaseUser.getIdToken();

    // Create User document in Firestore
    const userId = generateId();
    const now = new Date().toISOString();
    
    const userData: User = {
      id: userId,
      email,
      name,
      createdAt: now,
      updatedAt: now,
    };

    await usersCollection.doc(userId).set(userData);

    // Check for pending referral code and store it for later use
    const pendingReferralCode = await AsyncStorage.getItem('pendingReferralCode');
    
    if (pendingReferralCode) {
      try {
        // Validate referral code exists and is not expired
        const isValid = await validateReferralCode(pendingReferralCode);
        if (isValid) {
          // Store referral code in user document (temporary field, will be cleared after pairing)
          await usersCollection.doc(userId).update({
            referralId: pendingReferralCode, // Store the referral code for later use
          } as any); // Type assertion for temporary field
        }
      } catch (error) {
        // Don't fail signup if referral lookup fails
        console.error('Error processing referral code:', error);
      }
      // Clear the pending referral code
      await AsyncStorage.removeItem('pendingReferralCode');
    }

    // Update Zustand store
    useAuthStore.getState().setUser(userData);
    useAuthStore.getState().setToken(token);

    return userData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Sign in an existing user
 */
export async function signIn(
  email: string,
  password: string,
): Promise<User> {
  try {
    // Authenticate with Firebase Auth
    const userCredential = await firebaseAuth.signInWithEmailAndPassword(
      email,
      password,
    );
    const firebaseUser = userCredential.user;

    if (!firebaseUser) {
      throw new AuthError('Failed to sign in', 'auth/signin-failed');
    }

    // Get ID token
    const token = await firebaseUser.getIdToken();

    // Fetch User document from Firestore
    const userDoc = await usersCollection
      .where('email', '==', email)
      .limit(1)
      .get();

    if (userDoc.empty) {
      throw new AuthError('User document not found', 'auth/user-not-found');
    }

    const userData = userDoc.docs[0].data() as User;

    // Update Zustand store
    useAuthStore.getState().setUser(userData);
    useAuthStore.getState().setToken(token);

    return userData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseAuth.signOut();
    useAuthStore.getState().logout();
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Reset password
 */
export async function resetPassword(email: string): Promise<void> {
  try {
    await firebaseAuth.sendPasswordResetEmail(email);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  updates: Partial<User>,
): Promise<User> {
  try {
    const userRef = usersCollection.doc(userId);
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await userRef.update(updateData);

    const updatedDoc = await userRef.get();
    const updatedUser = updatedDoc.data() as User;

    // Update Zustand store
    useAuthStore.getState().setUser(updatedUser);

    return updatedUser;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const firebaseUser = firebaseAuth.currentUser;

    if (!firebaseUser) {
      return null;
    }

    // Fetch User document from Firestore
    const userDoc = await usersCollection
      .where('email', '==', firebaseUser.email)
      .limit(1)
      .get();

    if (userDoc.empty) {
      return null;
    }

    return userDoc.docs[0].data() as User;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const userDoc = await usersCollection.doc(userId).get();

    if (!userDoc.exists) {
      return null;
    }

    return userDoc.data() as User;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new AuthError(message, error.code || 'auth/unknown', error);
  }
}

/**
 * Alias for getUserById for backward compatibility
 */
export const getUser = getUserById;

/**
 * Auth state change listener
 */
export function onAuthStateChanged(
  callback: (user: User | null) => void,
): () => void {
  return firebaseAuth.onAuthStateChanged(async firebaseUser => {
    if (firebaseUser) {
      try {
        const user = await getCurrentUser();
        if (user) {
          const token = await firebaseUser.getIdToken();
          useAuthStore.getState().setUser(user);
          useAuthStore.getState().setToken(token);
        }
        callback(user);
      } catch (error) {
        callback(null);
      }
    } else {
      useAuthStore.getState().logout();
      callback(null);
    }
  });
}
