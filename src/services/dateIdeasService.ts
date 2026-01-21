/**
 * Date Ideas service
 * Manages date ideas, swipes, matches, and location services
 */

import {Platform, PermissionsAndroid, Alert} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  dateIdeasCollection,
  dateSwipesCollection,
  dateMatchesCollection,
  generateId,
  getTimestamp,
  firebaseFirestore,
} from './firebase';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {getPartnership} from './partnershipService';
import {DateIdea, DateSwipe, DateMatch, Partnership} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';

/**
 * Request location permission
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      // iOS permissions are handled via Info.plist
      // Geolocation API will prompt automatically
      return true;
    } else {
      // Android
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Candle needs access to your location to show date ideas near you.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
}

/**
 * Get current user location
 */
export async function getUserLocation(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.error('Error getting location:', error);
        // Fallback to default location (San Francisco)
        resolve({
          latitude: 37.7749,
          longitude: -122.4194,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      },
    );
  });
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

/**
 * Fetch date ideas with optional filtering
 */
export async function fetchDateIdeas(
  location?: {latitude: number; longitude: number},
  category?: string,
  radiusKm: number = 50,
  limit: number = 20,
): Promise<DateIdea[]> {
  try {
    let query: FirebaseFirestoreTypes.Query = dateIdeasCollection;

    if (category && category !== 'All') {
      query = query.where('category', '==', category);
    }

    const snapshot = await query.limit(limit * 2).get(); // Fetch more to filter by location
    let dateIdeas = snapshot.docs.map(doc => doc.data() as DateIdea);

    // Filter by location if provided
    if (location) {
      dateIdeas = dateIdeas.filter(idea => {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          idea.location.latitude,
          idea.location.longitude,
        );
        return distance <= radiusKm;
      });
    }

    // Limit results
    return dateIdeas.slice(0, limit);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get single date idea by ID
 */
export async function getDateIdea(dateIdeaId: string): Promise<DateIdea | null> {
  try {
    const doc = await dateIdeasCollection.doc(dateIdeaId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as DateIdea;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Swipe on a date idea and check for match
 */
export async function swipeOnDate(
  partnershipId: string,
  userId: string,
  dateIdeaId: string,
  direction: 'left' | 'right',
): Promise<{matched: boolean; match?: DateMatch}> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    const partnerId =
      partnership.userId1 === userId
        ? partnership.userId2
        : partnership.userId1;

    if (!partnerId) {
      throw new FirestoreError('Partner not found', 'not-found');
    }

    // Create swipe document
    const swipeId = generateId();
    const now = new Date().toISOString();
    const swipeData: DateSwipe = {
      id: swipeId,
      partnershipId,
      userId,
      dateIdeaId,
      direction,
      createdAt: now,
    };

    await dateSwipesCollection.doc(swipeId).set(swipeData);

    // Check for match if swiped right
    if (direction === 'right') {
      const partnerSwipeQuery = await dateSwipesCollection
        .where('partnershipId', '==', partnershipId)
        .where('dateIdeaId', '==', dateIdeaId)
        .where('userId', '==', partnerId)
        .where('direction', '==', 'right')
        .limit(1)
        .get();

      if (!partnerSwipeQuery.empty) {
        // Match found! Create match document with deterministic ID for idempotency
        const matchId = `${partnershipId}_${dateIdeaId}`;
        const matchRef = dateMatchesCollection.doc(matchId);

        // Use transaction to ensure idempotency - only create if doesn't exist
        await firebaseFirestore.runTransaction(async transaction => {
          const matchDoc = await transaction.get(matchRef);
          
          if (!matchDoc.exists) {
            const matchData: DateMatch = {
              id: matchId,
              partnershipId,
              dateIdeaId,
              matchedAt: now,
              status: 'new',
            };
            transaction.set(matchRef, matchData);
            return matchData;
          } else {
            // Match already exists, return existing match
            return matchDoc.data() as DateMatch;
          }
        });

        // Fetch the match document to return
        const matchDoc = await matchRef.get();
        const matchData = matchDoc.data() as DateMatch;

        return {matched: true, match: matchData};
      }
    }

    return {matched: false};
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get matches for partnership
 */
export async function getMatches(
  partnershipId: string,
): Promise<(DateMatch & {dateIdea?: DateIdea})[]> {
  try {
    const snapshot = await dateMatchesCollection
      .where('partnershipId', '==', partnershipId)
      .orderBy('matchedAt', 'desc')
      .get();

    const matches = snapshot.docs.map(doc => doc.data() as DateMatch);

    // Populate date idea data
    const matchesWithIdeas = await Promise.all(
      matches.map(async match => {
        const dateIdea = await getDateIdea(match.dateIdeaId);
        return {
          ...match,
          dateIdea: dateIdea || undefined,
        };
      }),
    );

    return matchesWithIdeas;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get user's swipe history
 */
export async function getUserSwipes(
  partnershipId: string,
  userId: string,
): Promise<DateSwipe[]> {
  try {
    const snapshot = await dateSwipesCollection
      .where('partnershipId', '==', partnershipId)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map(doc => doc.data() as DateSwipe);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to matches for real-time updates
 */
export function subscribeToMatches(
  partnershipId: string,
  callback: (matches: (DateMatch & {dateIdea?: DateIdea})[]) => void,
): () => void {
  const unsubscribe = dateMatchesCollection
    .where('partnershipId', '==', partnershipId)
    .orderBy('matchedAt', 'desc')
    .onSnapshot(
      async snapshot => {
        const matches = snapshot.docs.map(doc => doc.data() as DateMatch);

        // Populate date idea data
        const matchesWithIdeas = await Promise.all(
          matches.map(async match => {
            const dateIdea = await getDateIdea(match.dateIdeaId);
            return {
              ...match,
              dateIdea: dateIdea || undefined,
            };
          }),
        );

        callback(matchesWithIdeas);
      },
      error => {
        console.error('Matches subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}

/**
 * Update match status
 */
export async function updateMatchStatus(
  matchId: string,
  status: 'viewed' | 'completed',
  notes?: string,
): Promise<DateMatch> {
  try {
    const updateData: any = {
      status,
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await dateMatchesCollection.doc(matchId).update(updateData);

    const updatedDoc = await dateMatchesCollection.doc(matchId).get();
    return updatedDoc.data() as DateMatch;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}
