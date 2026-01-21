/**
 * Form validation utilities
 * Provides validation functions for auth forms
 */

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  message?: string;
} {
  if (!password || password.length < 6) {
    return {
      valid: false,
      message: 'Password must be at least 6 characters',
    };
  }
  return {valid: true};
}

/**
 * Validate name (non-empty, at least 2 characters)
 */
export function validateName(name: string): boolean {
  return name.trim().length >= 2;
}

/**
 * Validate invite code (6 digits)
 */
export function validateInviteCode(code: string): boolean {
  const codeRegex = /^\d{6}$/;
  return codeRegex.test(code.trim());
}
