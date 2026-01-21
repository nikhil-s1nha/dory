/**
 * Privacy Settings Service
 * Handles privacy-related operations like data export and account deletion
 */

import {
  firebaseAuth,
  firebaseFirestore,
  firebaseStorage,
  usersCollection,
  partnershipsCollection,
  messagesCollection,
  answersCollection,
  canvasDrawingsCollection,
  countdownsCollection,
  gameScoresCollection,
  photoPromptsCollection,
} from './firebase';
import {Alert} from 'react-native';
import {Share} from 'react-native';

/**
 * Export all user data as JSON
 */
export async function exportUserData(userId: string): Promise<void> {
  try {
    const exportData: any = {
      userId,
      exportedAt: new Date().toISOString(),
      user: null,
      partnerships: [],
      messages: [],
      answers: [],
      canvasDrawings: [],
      countdowns: [],
      gameScores: [],
      photoPrompts: [],
    };

    // Get user data
    const userDoc = await usersCollection.doc(userId).get();
    if (userDoc.exists) {
      exportData.user = userDoc.data();
    }

    // Get partnerships
    const partnershipsQuery = await partnershipsCollection
      .where('userId1', '==', userId)
      .get();
    const partnershipsQuery2 = await partnershipsCollection
      .where('userId2', '==', userId)
      .get();

    const allPartnerships = [
      ...partnershipsQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })),
      ...partnershipsQuery2.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })),
    ];

    exportData.partnerships = allPartnerships;

    // Get all related data for each partnership
    for (const partnership of allPartnerships) {
      const partnershipId = partnership.id;

      // Messages
      const messagesQuery = await messagesCollection
        .where('partnershipId', '==', partnershipId)
        .get();
      exportData.messages.push(
        ...messagesQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );

      // Answers
      const answersQuery = await answersCollection
        .where('partnershipId', '==', partnershipId)
        .where('userId', '==', userId)
        .get();
      exportData.answers.push(
        ...answersQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );

      // Canvas drawings
      const canvasQuery = await canvasDrawingsCollection
        .where('partnershipId', '==', partnershipId)
        .where('createdBy', '==', userId)
        .get();
      exportData.canvasDrawings.push(
        ...canvasQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );

      // Countdowns
      const countdownsQuery = await countdownsCollection
        .where('partnershipId', '==', partnershipId)
        .where('createdBy', '==', userId)
        .get();
      exportData.countdowns.push(
        ...countdownsQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );

      // Game scores
      const gameScoresQuery = await gameScoresCollection
        .where('partnershipId', '==', partnershipId)
        .where('userId', '==', userId)
        .get();
      exportData.gameScores.push(
        ...gameScoresQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );

      // Photo prompts
      const photoPromptsQuery = await photoPromptsCollection
        .where('partnershipId', '==', partnershipId)
        .get();
      exportData.photoPrompts.push(
        ...photoPromptsQuery.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      );
    }

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Share the data (on mobile, this will allow saving to files)
    try {
      await Share.share({
        message: jsonString,
        title: 'Candle Data Export',
      });
    } catch (shareError) {
      // If sharing fails, at least log the data
      console.log('Data export:', jsonString);
      Alert.alert(
        'Export Complete',
        'Your data has been prepared. Please check the console for the JSON data.',
      );
    }
  } catch (error: any) {
    console.error('Error exporting user data:', error);
    throw new Error(`Failed to export data: ${error.message}`);
  }
}

/**
 * Delete user account and all associated data
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  try {
    // Get user partnerships
    const partnershipsQuery = await partnershipsCollection
      .where('userId1', '==', userId)
      .get();
    const partnershipsQuery2 = await partnershipsCollection
      .where('userId2', '==', userId)
      .get();

    const allPartnerships = [
      ...partnershipsQuery.docs,
      ...partnershipsQuery2.docs,
    ];

    // Delete all related data for each partnership
    for (const partnershipDoc of allPartnerships) {
      const partnershipId = partnershipDoc.id;
      const partnershipData = partnershipDoc.data();

      // Delete messages
      const messagesQuery = await messagesCollection
        .where('partnershipId', '==', partnershipId)
        .get();
      const messageBatch = firebaseFirestore.batch();
      messagesQuery.docs.forEach(doc => {
        messageBatch.delete(doc.ref);
      });
      await messageBatch.commit();

      // Delete answers
      const answersQuery = await answersCollection
        .where('partnershipId', '==', partnershipId)
        .where('userId', '==', userId)
        .get();
      const answerBatch = firebaseFirestore.batch();
      answersQuery.docs.forEach(doc => {
        answerBatch.delete(doc.ref);
      });
      await answerBatch.commit();

      // Delete canvas drawings
      const canvasQuery = await canvasDrawingsCollection
        .where('partnershipId', '==', partnershipId)
        .where('createdBy', '==', userId)
        .get();
      const canvasBatch = firebaseFirestore.batch();
      canvasQuery.docs.forEach(doc => {
        canvasBatch.delete(doc.ref);
      });
      await canvasBatch.commit();

      // Delete countdowns
      const countdownsQuery = await countdownsCollection
        .where('partnershipId', '==', partnershipId)
        .where('createdBy', '==', userId)
        .get();
      const countdownBatch = firebaseFirestore.batch();
      countdownsQuery.docs.forEach(doc => {
        countdownBatch.delete(doc.ref);
      });
      await countdownBatch.commit();

      // Delete game scores
      const gameScoresQuery = await gameScoresCollection
        .where('partnershipId', '==', partnershipId)
        .where('userId', '==', userId)
        .get();
      const gameScoreBatch = firebaseFirestore.batch();
      gameScoresQuery.docs.forEach(doc => {
        gameScoreBatch.delete(doc.ref);
      });
      await gameScoreBatch.commit();

      // Update or delete partnership
      if (partnershipData.userId1 === userId) {
        // User is user1, update partnership to remove user1
        await partnershipDoc.ref.update({
          userId1: '',
          status: 'paused',
        });
      } else if (partnershipData.userId2 === userId) {
        // User is user2, update partnership to remove user2
        await partnershipDoc.ref.update({
          userId2: '',
          status: 'paused',
        });
      }
    }

    // Delete user settings
    const settingsRef = firebaseFirestore
      .collection('users')
      .doc(userId)
      .collection('settings');
    const settingsQuery = await settingsRef.get();
    const settingsBatch = firebaseFirestore.batch();
    settingsQuery.docs.forEach(doc => {
      settingsBatch.delete(doc.ref);
    });
    await settingsBatch.commit();

    // Read user document and extract profilePicture before deleting
    const userDoc = await usersCollection.doc(userId).get();
    const userData = userDoc.data();
    const profilePicturePath = userData?.profilePicture;

    // Delete user's profile picture from storage if exists
    if (profilePicturePath) {
      try {
        // Extract path from URL and delete
        const pathMatch = profilePicturePath.match(/\/o\/(.+)\?/);
        if (pathMatch) {
          const decodedPath = decodeURIComponent(pathMatch[1]);
          await firebaseStorage.ref(decodedPath).delete();
        }
      } catch (storageError) {
        console.warn('Error deleting profile picture from storage:', storageError);
        // Continue with account deletion even if storage deletion fails
      }
    }

    // Delete user document after reading and cleaning up storage
    await usersCollection.doc(userId).delete();

    // Delete Firebase Auth user
    const currentUser = firebaseAuth.currentUser;
    if (currentUser && currentUser.uid === userId) {
      await currentUser.delete();
    }
  } catch (error: any) {
    console.error('Error deleting user account:', error);
    throw new Error(`Failed to delete account: ${error.message}`);
  }
}

/**
 * Unpair from partnership
 */
export async function unpairPartnership(partnershipId: string): Promise<void> {
  try {
    const partnershipDoc = await partnershipsCollection.doc(partnershipId).get();
    if (!partnershipDoc.exists) {
      throw new Error('Partnership not found');
    }

    const partnershipData = partnershipDoc.data();
    if (!partnershipData) {
      throw new Error('Partnership data not found');
    }

    // Update partnership status to paused
    await partnershipsCollection.doc(partnershipId).update({
      status: 'paused',
      updatedAt: firebaseFirestore.FieldValue.serverTimestamp(),
    });

    // Optionally, you could also clear userId1 and userId2
    // For now, we'll just pause the partnership
  } catch (error: any) {
    console.error('Error unpairing partnership:', error);
    throw new Error(`Failed to unpair partnership: ${error.message}`);
  }
}