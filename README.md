# Bundles

A small iOS app for long-distance couples. Your partner's photo, drawing, or now-playing track
shows up on your home screen through widgets — the whole point is that glancing at your phone feels
like a small connection, without either of you opening an app and scrolling.

Built with Expo (SDK 57) + `expo-widgets`, backed by Supabase. See **[PLAN.md](./PLAN.md)** for the
architecture decision and milestone plan, and **[CHANGELOG.md](./CHANGELOG.md)** for per-milestone
progress and verification.

## Develop

```bash
npm install
npm run ios        # build + run on the iOS simulator
```

## Verify

```bash
npm run lint
npm run typecheck
npm test
```

All three run in CI on every push/PR to `main` (`.github/workflows/ci.yml`).

## Layout

- `src/app/` — screens (expo-router, file-based).
- `src/components/`, `src/hooks/`, `src/constants/` — shared UI, hooks, and config.
- `src/constants/app-group.ts` — the App Group contract shared with the iOS widget extension.
