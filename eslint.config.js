// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Node globals used by the release tooling. Listed explicitly rather than pulled from the
// `globals` package: that is a transitive dep of eslint, not one of ours, and package.json
// must not grow a dependency for a lint config.
const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
};

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run in Deno (Supabase), not the app — different globals/imports; linted there.
    ignores: ["dist/*", "supabase/functions/**", ".claude/worktrees/**"],
  },
  {
    // Release tooling runs in Node, never in the RN runtime.
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module", globals: nodeGlobals },
  },
  {
    // Expo config plugins are loaded by prebuild as CommonJS.
    files: ["plugins/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...nodeGlobals, require: "readonly", module: "writable", exports: "writable" },
    },
  },
]);
