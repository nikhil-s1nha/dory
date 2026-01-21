/**
 * Firebase service module
 * Provides centralized Firebase initialization and helper functions
 */

import app from '@react-native-firebase/app';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import storage, {FirebaseStorageTypes} from '@react-native-firebase/storage';
import {config} from '@utils/config';
import {
  User,
  Partnership,
  Question,
  Answer,
  Message,
  CanvasDrawing,
  Countdown,
  GameScore,
  PhotoPrompt,
  GameState,
  DateIdea,
  DateSwipe,
  DateMatch,
  ThumbKiss,
  Referral,
} from '@utils/types';

// Initialize Firebase app (auto-initialized from native config, but verify)
if (!app().apps.length) {
  // If not auto-initialized, initialize with config from environment
  // Note: React Native Firebase typically auto-initializes from native config files
  // This is a fallback if needed
  console.warn('Firebase app not auto-initialized. Check native configuration files.');
}

// Verify Firebase configuration is available
const firebaseApp = app();
if (!firebaseApp.options.projectId && config.FIREBASE_PROJECT_ID) {
  console.warn('Firebase config may not be properly loaded from native files.');
}

// Enable offline persistence
firestore().settings({
  persistence: true,
});

// Export Firebase instances
export const firebaseAuth = auth();
export const firebaseFirestore = firestore();
export const firebaseStorage = storage();

// Collection references with type safety
export const usersCollection = firebaseFirestore.collection(
  'users',
) as FirebaseFirestoreTypes.CollectionReference<User>;

export const partnershipsCollection = firebaseFirestore.collection(
  'partnerships',
) as FirebaseFirestoreTypes.CollectionReference<Partnership>;

export const questionsCollection = firebaseFirestore.collection(
  'questions',
) as FirebaseFirestoreTypes.CollectionReference<Question>;

export const answersCollection = firebaseFirestore.collection(
  'answers',
) as FirebaseFirestoreTypes.CollectionReference<Answer>;

export const messagesCollection = firebaseFirestore.collection(
  'messages',
) as FirebaseFirestoreTypes.CollectionReference<Message>;

export const canvasDrawingsCollection = firebaseFirestore.collection(
  'canvasDrawings',
) as FirebaseFirestoreTypes.CollectionReference<CanvasDrawing>;

export const countdownsCollection = firebaseFirestore.collection(
  'countdowns',
) as FirebaseFirestoreTypes.CollectionReference<Countdown>;

export const gameScoresCollection = firebaseFirestore.collection(
  'gameScores',
) as FirebaseFirestoreTypes.CollectionReference<GameScore>;

export const photoPromptsCollection = firebaseFirestore.collection(
  'photoPrompts',
) as FirebaseFirestoreTypes.CollectionReference<PhotoPrompt>;

export const gameStatesCollection = firebaseFirestore.collection(
  'gameStates',
) as FirebaseFirestoreTypes.CollectionReference<GameState>;

export const dateIdeasCollection = firebaseFirestore.collection(
  'dateIdeas',
) as FirebaseFirestoreTypes.CollectionReference<DateIdea>;

export const dateSwipesCollection = firebaseFirestore.collection(
  'dateSwipes',
) as FirebaseFirestoreTypes.CollectionReference<DateSwipe>;

export const dateMatchesCollection = firebaseFirestore.collection(
  'dateMatches',
) as FirebaseFirestoreTypes.CollectionReference<DateMatch>;

export const thumbKissesCollection = firebaseFirestore.collection(
  'thumbKisses',
) as FirebaseFirestoreTypes.CollectionReference<ThumbKiss>;

export const referralsCollection = firebaseFirestore.collection(
  'referrals',
) as FirebaseFirestoreTypes.CollectionReference<Referral>;

/**
 * Helper function to get Firestore server timestamp
 */
export function getTimestamp(): FirebaseFirestoreTypes.FieldValue {
  return firestore.FieldValue.serverTimestamp();
}

/**
 * Helper function to generate a new document ID
 */
export function generateId(): string {
  return firebaseFirestore.collection('_temp').doc().id;
}

/**
 * Upload file to Cloud Storage
 */
export async function uploadFile(
  uri: string,
  path: string,
): Promise<string> {
  try {
    const reference = firebaseStorage.ref(path);
    await reference.putFile(uri);
    const downloadURL = await reference.getDownloadURL();
    return downloadURL;
  } catch (error: any) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Delete file from Cloud Storage
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    const reference = firebaseStorage.ref(path);
    await reference.delete();
  } catch (error: any) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Type converters for Firestore serialization/deserialization
 */
export const userConverter: FirebaseFirestoreTypes.FirestoreDataConverter<User> =
  {
    toFirestore: (user: User): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...user};
      // Convert undefined to null for Firestore
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): User => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as User;
    },
  };

export const partnershipConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Partnership> =
  {
    toFirestore: (
      partnership: Partnership,
    ): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...partnership};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Partnership => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Partnership;
    },
  };

export const questionConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Question> =
  {
    toFirestore: (question: Question): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...question};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Question => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Question;
    },
  };

export const answerConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Answer> =
  {
    toFirestore: (answer: Answer): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...answer};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Answer => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Answer;
    },
  };

export const messageConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Message> =
  {
    toFirestore: (message: Message): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...message};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Message => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Message;
    },
  };

export const canvasDrawingConverter: FirebaseFirestoreTypes.FirestoreDataConverter<CanvasDrawing> =
  {
    toFirestore: (
      drawing: CanvasDrawing,
    ): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...drawing};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): CanvasDrawing => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as CanvasDrawing;
    },
  };

export const countdownConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Countdown> =
  {
    toFirestore: (
      countdown: Countdown,
    ): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...countdown};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Countdown => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Countdown;
    },
  };

export const gameScoreConverter: FirebaseFirestoreTypes.FirestoreDataConverter<GameScore> =
  {
    toFirestore: (score: GameScore): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...score};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): GameScore => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as GameScore;
    },
  };

export const photoPromptConverter: FirebaseFirestoreTypes.FirestoreDataConverter<PhotoPrompt> =
  {
    toFirestore: (
      prompt: PhotoPrompt,
    ): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...prompt};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): PhotoPrompt => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as PhotoPrompt;
    },
  };

export const gameStateConverter: FirebaseFirestoreTypes.FirestoreDataConverter<GameState> =
  {
    toFirestore: (gameState: GameState): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...gameState};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): GameState => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as GameState;
    },
  };

export const dateIdeaConverter: FirebaseFirestoreTypes.FirestoreDataConverter<DateIdea> =
  {
    toFirestore: (dateIdea: DateIdea): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...dateIdea};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): DateIdea => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as DateIdea;
    },
  };

export const dateSwipeConverter: FirebaseFirestoreTypes.FirestoreDataConverter<DateSwipe> =
  {
    toFirestore: (dateSwipe: DateSwipe): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...dateSwipe};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): DateSwipe => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as DateSwipe;
    },
  };

export const dateMatchConverter: FirebaseFirestoreTypes.FirestoreDataConverter<DateMatch> =
  {
    toFirestore: (dateMatch: DateMatch): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...dateMatch};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): DateMatch => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as DateMatch;
    },
  };

export const thumbKissConverter: FirebaseFirestoreTypes.FirestoreDataConverter<ThumbKiss> =
  {
    toFirestore: (thumbKiss: ThumbKiss): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...thumbKiss};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): ThumbKiss => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as ThumbKiss;
    },
  };

export const referralConverter: FirebaseFirestoreTypes.FirestoreDataConverter<Referral> =
  {
    toFirestore: (referral: Referral): FirebaseFirestoreTypes.DocumentData => {
      const data: any = {...referral};
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      return data;
    },
    fromFirestore: (
      snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot,
    ): Referral => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
      } as Referral;
    },
  };
