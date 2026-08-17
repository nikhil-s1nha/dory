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
  //
  // Anchored to <rootDir>, and it must stay anchored. These patterns are matched against absolute
  // paths, so a bare '/\.claude/worktrees/' also matches the rootDir of a run started *inside* a
  // worktree — which ignores that worktree's own suite and reports "No files found", i.e. the gate
  // becomes unrunnable in exactly the place parallel lanes work. Anchoring keeps the intent (skip
  // worktrees nested *below* this checkout) without the self-match.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
};
