# Live Activity — the app↔backend contract

Two lanes build against this file: the **app** side (`widgets/bundles-activity.tsx`, the hook, the
repository) and the **backend** side (migration + `notify-partner`). Neither lane may change a name
in here unilaterally — if something is wrong, say so and get the contract changed first. This exists
because the App Group seam (`src/constants/app-group.ts`) proved its worth in Phase B: a written
seam is what let the widget and the app be built and fixed independently.

## Why push-to-start is the architecture

The partner sends a photo while your phone is in your pocket. Nothing is running. iOS 17.2+
push-to-start wakes the app with enough background runtime to start the activity, and it lands on
the lock screen. The app never has to be open. This is the whole point of the feature, and it is a
different mechanism from `Activity.request()` (foreground-only), which is what the previous M7 pass
evaluated and rejected.

## ActivityKit facts that constrain the design

- **Content state must be < 4 KB.** Never put image bytes in it. Images travel the way the widget's
  already do: downscaled to `WIDGET_RENDER_MAX_DIMENSION` (600px), written into the App Group by
  the app, and referenced **by filename**. The activity reads the file from the shared container.
- A `start` push **must** carry an `alert` payload, or iOS drops it.
- Push updates are budget-limited per hour. Send one on a real event (new item, track change,
  play/pause), never on a timer. `hasMeaningfulChange` in `src/domain/spotify/nowplaying.ts` is the
  existing precedent for this and should be reused, not reinvented.
- Tokens rotate. A `pushToStartToken` can change at any time; a per-activity `updateToken` is
  issued per activity and dies with it. Both must be upserted, never assumed stable.

## Shared shapes (TypeScript is the source of truth)

Both lanes code against these exact names. The app defines them in
`src/domain/activity/types.ts`; the Edge Function mirrors them.

```ts
/** Immutable for the life of the activity. */
export type BundlesActivityAttributes = {
  coupleId: string;
};

/** Mutable, re-sent on every update. Must serialize to < 4 KB. */
export type BundlesActivityContentState = {
  kind: 'photo' | 'drawing' | 'music';
  /** Line one, e.g. "Alex sent you a photo" / track title. */
  title: string;
  /** Line two, e.g. artist, or "" when unused. */
  subtitle: string;
  /** Filename inside the App Group ExpoWidgets/ dir. null for a text-only state. */
  imageFile: string | null;
  /** Same deep link the widget uses: bundles://media/<id>, bundles://draw?base=<id>, bundles://music */
  deepLink: string;
  /** Epoch ms the item was sent, for staleness display. */
  sentAt: number;
};
```

The activity name registered with `createLiveActivity` is **`BundlesActivity`**.

### ⚠️ Correction (2026-08-16) — how expo-widgets actually shapes the APNs payload

The first draft of this contract assumed `attributes-type: "BundlesActivity"` and a structured
`content-state`. **That is wrong**, and it was caught by reading
`node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift` rather than by assuming.

expo-widgets declares **one shared** `struct LiveActivityAttributes` for every activity in the app,
with a `ContentState` of exactly two string fields — `name` and `props`. `name` is the routing key
that selects which registered layout renders; `props` is the **JSON-stringified** payload, not a
nested object. So:

- `attributes-type` is **`LiveActivityAttributes`** — the same value for every activity, forever.
- `content-state` is `{ "name": "BundlesActivity", "props": "<stringified BundlesActivityContentState>" }`.
- **`BundlesActivityAttributes` is not expressible.** The shared attributes struct has no custom
  fields, so `coupleId` cannot ride along as an attribute. If the activity needs it, it goes inside
  the stringified `props`.

`BundlesActivityContentState` above is still the right shape — it just travels as a string.

## Database (backend lane owns)

Migration `supabase/migrations/0010_live_activity_tokens.sql`.

```
live_activity_tokens
  token         text primary key         -- the push-to-start token
  user_id       uuid not null            -- owner; RLS: owner-only, same shape as push_tokens
  environment   text not null            -- 'sandbox' | 'production'
  created_at    timestamptz default now()
  updated_at    timestamptz default now()

live_activity_instances
  activity_id   text primary key         -- ActivityKit's id
  user_id       uuid not null
  update_token  text                     -- null until the token event fires
  media_id      uuid                     -- what it is currently showing, nullable
  started_at    timestamptz default now()
  ended_at      timestamptz              -- null while live
```

Both tables are **owner-only** under RLS — a partner must not read them. Dispatch is service-role,
exactly like `push_tokens`. Reuse `0008_push_tokens.sql`'s device-handover trigger pattern so a
second account signing in on the same phone takes ownership instead of inheriting alerts.

Verification sentinel: `BUNDLES_ACTIVITY_RLS_OK`, following the `supabase-ops` skill.

## App → DB writes (app lane owns)

`src/domain/activity/repository.ts`:

- `registerPushToStartToken(token: string, environment: 'sandbox' | 'production'): Promise<void>`
  — upsert on `token`. Environment comes from the `aps-environment` entitlement via
  `expo-application`, **never `__DEV__`** (see `src/lib/push.ts`; a Release build installed by Xcode
  is still sandbox, and TestFlight is production — this is the single most breakable line here).
- `registerActivityUpdateToken(activityId: string, token: string): Promise<void>`
- `recordActivityStarted(activityId: string, mediaId: string | null): Promise<void>`
- `recordActivityEnded(activityId: string): Promise<void>`

## APNs payload (backend lane owns)

Sent by `notify-partner` **in addition to** the existing visible alert, not instead of it.

- URL: `https://api{.sandbox}.push.apple.com/3/device/<pushToStartToken | updateToken>`
  — sandbox vs production is read from the token row's `environment` column, never guessed.
- Headers: `apns-topic: com.nikhilsinha.bundles.push-type.liveactivity`,
  `apns-push-type: liveactivity`, `apns-priority: 10`.
- Reuse the existing cached ES256 JWT signer in `notify-partner/index.ts` — raw r‖s, not DER. That
  code is already proven against real APNs; do not write a second signer.

```jsonc
{
  "aps": {
    "timestamp": 1723800000,
    "event": "start",                    // "start" | "update" | "end"
    "content-state": { /* BundlesActivityContentState */ },
    "attributes-type": "BundlesActivity",
    "attributes": { "coupleId": "…" },   // start only
    "alert": {                           // REQUIRED on start, else iOS drops it
      "title": "Alex",
      "body": "sent you a photo"
    }
  }
}
```

Prune a token on 410 / `BadDeviceToken` exactly as the existing push path does.

## Ordering problem, and who solves it

The image must be in the App Group **before** the activity renders, but push-to-start wakes the app
only at push time. Resolution: the activity's first frame renders the text state (`imageFile: null`)
and the app, once awake, downloads into the App Group and calls `update` locally with the filename.
The app lane owns this; the backend lane just sends the text-only start payload.
