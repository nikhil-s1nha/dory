// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run in Deno (Supabase), not the app — different globals/imports; linted there.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
