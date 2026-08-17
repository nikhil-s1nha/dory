/**
 * Turning database failures into something a person can act on.
 *
 * The pairing screen used to render `e.message` directly, which for a Postgres rejection means a
 * couple staring at `duplicate key value violates unique constraint "couples_member_a_key"`. That
 * string is the *right* diagnosis (this account already occupies slot A of a couple) and the wrong
 * thing to show — it names an implementation detail and suggests nothing to do about it.
 *
 * Pure and client-free so every branch is testable without a database.
 */

/** Postgres/PostgREST failures arrive as a plain object with a `code`, not as an Error subclass. */
interface DatabaseErrorLike {
  code?: unknown;
  message?: unknown;
}

/** A user already occupies the slot being written — for `couples.member_a`, they already paired. */
const UNIQUE_VIOLATION = '23505';
/** RLS refused the write. Almost always a stale or mismatched session rather than a real bug. */
const INSUFFICIENT_PRIVILEGE = '42501';

/** The SQLSTATE of a database rejection, if this is one. */
export function errorCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const code = (e as DatabaseErrorLike).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * True when the write lost a race with a row that already exists. On `couples` this is the
 * member_a unique index: the caller already owns a couple, so "create" was never going to work
 * and the right move is to show them the invite they already have.
 */
export function isUniqueViolation(e: unknown): boolean {
  return errorCode(e) === UNIQUE_VIOLATION;
}

/** True when the request never reached the server — worth saying, and worth retrying. */
export function isNetworkFailure(e: unknown): boolean {
  const message = typeof e === 'object' && e !== null ? (e as DatabaseErrorLike).message : undefined;
  if (typeof message !== 'string') return false;
  return /network request failed|failed to fetch|network error|load failed/i.test(message);
}

/**
 * A message safe to put on screen. `fallback` covers everything we have nothing specific to say
 * about — deliberately *instead of* the raw message, not after it.
 */
export function describePairingError(e: unknown, fallback: string): string {
  if (isUniqueViolation(e)) {
    return "You've already started pairing on this account — your existing code is on its way. Pull up Bundles again if it doesn't appear.";
  }
  if (errorCode(e) === INSUFFICIENT_PRIVILEGE) {
    return "You're not signed in to do that. Sign out and back in, then try again.";
  }
  if (isNetworkFailure(e)) {
    return 'No connection. Check your network and try again.';
  }
  return fallback;
}
