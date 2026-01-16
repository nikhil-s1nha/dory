/**
 * Custom error types for Firebase operations
 */

export class FirebaseError extends Error {
  code: string;
  originalError?: any;

  constructor(message: string, code: string, originalError?: any) {
    super(message);
    this.name = 'FirebaseError';
    this.code = code;
    this.originalError = originalError;
  }
}

export class AuthError extends FirebaseError {
  constructor(message: string, code: string, originalError?: any) {
    super(message, code, originalError);
    this.name = 'AuthError';
  }
}

export class FirestoreError extends FirebaseError {
  constructor(message: string, code: string, originalError?: any) {
    super(message, code, originalError);
    this.name = 'FirestoreError';
  }
}

export class StorageError extends FirebaseError {
  constructor(message: string, code: string, originalError?: any) {
    super(message, code, originalError);
    this.name = 'StorageError';
  }
}

/**
 * Maps Firebase error codes to user-friendly messages
 */
export function getErrorMessage(error: any): string {
  if (error instanceof FirebaseError) {
    return error.message;
  }

  const code = error?.code || error?.error?.code || 'unknown';
  const message = error?.message || 'An unexpected error occurred';

  switch (code) {
    // Auth errors
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';

    // Firestore errors
    case 'permission-denied':
      return 'You do not have permission to perform this action.';
    case 'unavailable':
      return 'Service is temporarily unavailable. Please try again.';
    case 'not-found':
      return 'The requested resource was not found.';
    case 'already-exists':
      return 'This resource already exists.';
    case 'failed-precondition':
      return 'Operation failed due to a precondition.';
    case 'aborted':
      return 'Operation was aborted.';
    case 'out-of-range':
      return 'Operation is out of valid range.';
    case 'unimplemented':
      return 'This operation is not implemented.';
    case 'internal':
      return 'An internal error occurred.';
    case 'deadline-exceeded':
      return 'Operation timed out. Please try again.';

    // Storage errors
    case 'storage/unauthorized':
      return 'You do not have permission to access this file.';
    case 'storage/canceled':
      return 'Upload was canceled.';
    case 'storage/unknown':
      return 'An unknown storage error occurred.';
    case 'storage/invalid-argument':
      return 'Invalid file or path provided.';
    case 'storage/not-found':
      return 'File not found.';
    case 'storage/quota-exceeded':
      return 'Storage quota exceeded.';

    default:
      return message;
  }
}
