/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Parallel work happens in git worktrees under .claude/worktrees/, which sit inside the repo
  // root. Without this, jest discovers every worktree's copy of the suite and reports a multiple
  // of the real test count — and a red test in someone else's half-finished branch surfaces as a
  // failure here. modulePathIgnorePatterns (not just testPathIgnorePatterns) is what stops the
  // duplicate-module warnings too.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/worktrees/'],
  modulePathIgnorePatterns: ['/\\.claude/worktrees/'],
};
