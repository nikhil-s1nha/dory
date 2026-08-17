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

### As built (2026-08-16) — three things the sketch above did not settle

The column names and types are exactly as written. What the sketch left open, and how 0010 answers it:

1. **`live_activity_instances` has no `environment`.** Deliberate — adding one would force a third
   argument onto `registerActivityUpdateToken`, which the app lane already codes against. So an
   `update`/`end` push infers its gateway from the recipient's most recently updated
   `live_activity_tokens` row (an update token is always issued on a device that also registered a
   push-to-start token), falling back to `'sandbox'`. Because that is an inference and not a
   recorded fact, an update rejected as a dead token is retried once against the other gateway — but
   **only a successful retry counts**; a failed one never overrides the first response's verdict.
2. **The handover trigger also closes the previous owner's live activities**, not just the token
   row. Reassigning the push-to-start token alone is not enough: an activity A started before
   signing out is still on that lock screen and its *update* token still works, so B would see A's
   photos. An instance row carries no device identity, so the rule is conservative — A's live
   instances are ended (and their `update_token` nulled) only when the handover leaves A with **no
   push-to-start token at all**, i.e. this was the only device we knew of for them. An A who still
   has an iPad registered keeps that iPad's activity. The verification script asserts both halves.
3. **`update_token` is nulled, not just `ended_at` stamped**, whenever an activity ends or APNs
   declares its token dead. An ended activity must not stay addressable.

Applied to the cloud project and verified live: `P0001: BUNDLES_ACTIVITY_RLS_OK` from
`supabase/tests/verify_live_activity_rls_cloud.sql`.

## App → DB writes (app lane owns)

`src/domain/activity/repository.ts`:

- `registerPushToStartToken(token: string, environment: 'sandbox' | 'production'): Promise<void>`
  — upsert on `token`. Environment comes from the `aps-environment` entitlement via
  `expo-application`, **never `__DEV__`** (see `src/lib/push.ts`; a Release build installed by Xcode
  is still sandbox, and TestFlight is production — this is the single most breakable line here).
- `registerActivityUpdateToken(activityId: string, token: string): Promise<void>`
- `recordActivityStarted(activityId: string, mediaId: string | null): Promise<void>`
- `recordActivityEnded(activityId: string): Promise<void>`

**ActivityKit's activity id is not available to JS at start time** — expo-widgets surfaces it only
on the push-token event (`PushTokenEvent.activityId`), so `recordActivityStarted` cannot fire when
the activity starts. The row is therefore *born* at the token event: `registerActivityUpdateToken`
upserts `activity_id` + `update_token` together, and `started_at` defaults. The schema and the
dispatch path both tolerate this — **nothing on the backend assumes a row exists just because an
activity was started.** Until the token event fires the recipient looks tokenless and the backend
sends a `start`, which can briefly duplicate an activity; the app should end the spare. (The
alternative — letting a row with a null `update_token` suppress starts — would let one crashed
launch silently disable the feature forever.)

## APNs payload (backend lane owns)

Sent by **`supabase/functions/notify-activity/index.ts`**, a separate function from `notify-partner`.
`notify-partner` keeps its own proven alert path untouched and makes one guarded, fire-and-forget
call into `notify-activity`, so a single send produces both the alert and the activity and a failure
in the activity path cannot reach the alert path. Kill switch: function secret
`NOTIFY_ACTIVITY_DISABLED=1`.

The ES256 signer is **copied**, not extracted into a shared module — raw r‖s, not DER — precisely
because the existing one is proven and a refactor is how that gets broken.

- URL: `https://api{.sandbox}.push.apple.com/3/device/<pushToStartToken | updateToken>`
  — sandbox vs production is read from the token row's `environment` column, never guessed. For an
  update token, see "As built" note 1 above.
- Headers: `apns-topic: com.nikhilsinha.bundles.push-type.liveactivity`,
  `apns-push-type: liveactivity`, `apns-priority: 10`, plus a one-hour `apns-expiration`.

The payload below is the **corrected** one. An earlier draft of this block showed a
`BundlesActivity` attributes-type with a structured content-state; that was wrong (see the
correction above) and is kept nowhere, deliberately — copying it produced a push APNs accepts and
ActivityKit silently drops.

```jsonc
// start
{
  "aps": {
    "timestamp": 1723800000,
    "event": "start",
    "attributes-type": "LiveActivityAttributes",   // the shared expo-widgets struct, always
    "attributes": {},                              // EMPTY, not omitted — see below
    "content-state": {
      "name": "BundlesActivity",                   // expo-widgets' layout routing key
      "props": "{\"kind\":\"photo\",\"title\":\"Alex sent you a photo\",…}"  // STRINGIFIED
    },
    "alert": { "title": "Alex", "body": "sent you a photo" }  // REQUIRED, else iOS drops it
  }
}
// update — same content-state, no attributes, no alert
// end   — { "timestamp": …, "event": "end", "dismissal-date": … } and NO content-state
```

Two consequences that are easy to get wrong:

- The 4 KB content-state ceiling applies to the **stringified** `props`, which is larger than the
  object form because of escaping. Measure the string, not the object.
- `imageFile` in `props` is a bare **filename**. The app resolves it to an absolute `file://` URI
  before handing it to the layout, because `@expo/ui`'s ImageView loads via `URL(string:)` and a
  schemeless name silently renders nothing. The wire shape stays a filename; the resolution is the
  app's job.

`attributes` is `{}` rather than absent: APNs requires the key on a `start` event, and the shared
`LiveActivityAttributes` struct declares no fields, so `{}` is the only value that both satisfies
APNs and decodes. There is consequently nowhere for `coupleId` to live; it is **not currently sent
at all**. If the activity needs it, it goes inside the stringified `props` — say so and both lanes
change together.

`end` carries no `content-state` on purpose: we would have to invent one, and a state the Swift
struct cannot decode makes iOS drop the push, leaving the activity stuck on the lock screen — the
exact opposite of the intent. `dismissal-date` in the present removes it now; without it an ended
activity lingers for up to four hours.

Prune on 410 / `BadDeviceToken` exactly as the existing push path does: a dead push-to-start token
deletes its `live_activity_tokens` row; a dead update token closes its `live_activity_instances` row
(`ended_at` set, `update_token` nulled) rather than deleting it.

### Calling it

```jsonc
{ "mediaItemId": "<uuid>" }                     // start, or update if the recipient already has one
{ "mediaItemId": "<uuid>", "event": "start" }   // force
{ "mediaItemId": "<uuid>", "event": "update" }  // force
{ "event": "end" }                              // end every live activity of the partner's
```

The only caller-supplied identity is a media id, and it must belong to the caller; couple, recipient
and sender name are re-derived server-side, so this cannot push an activity onto a stranger's
partner's lock screen. Reply is
`{ "event": "start"|"update"|"end"|"none", "sent": n, "failed": n, "pruned": n }` — `"none"` means
nobody was addressable, which is a normal 200 because the caller is fire-and-forget. Unauthenticated
is 401; a malformed body or a non-uuid media id is 400; someone else's media id is 404.

`kind: "music"` is not reachable from this function — it takes a media id, and now-playing has no
`media_items` row. Music activities are the app's to start and update locally.

### Two APNs keys, selected by `environment` (resolved 2026-08-17)

**Neither of the project's APNs auth keys is universal.** Measured against real APNs, both
directions:

| key | sandbox gateway | production gateway |
|---|---|---|
| `APNS_KEY_P8` (original) | works | `403 BadEnvironmentKeyInToken` |
| `APNS_KEY_P8_PRODUCTION` (`8323H4JG5F`) | `403 BadEnvironmentKeyInToken` | works |

So the **key is as environment-specific as the host is**, and both functions now select them
together. Four secrets: `APNS_KEY_P8`/`APNS_KEY_ID` (sandbox), `APNS_KEY_P8_PRODUCTION`/
`APNS_KEY_ID_PRODUCTION` (production), plus the shared `APNS_TEAM_ID`.

Three properties worth not breaking:

- **Host and key come from one argument.** `postToApns(environment, …)` derives both; neither is
  passed in separately, so they cannot drift apart. Pairing them wrongly *is* the 403.
- **The JWT cache is per environment, not global.** One shared slot would hand the second
  environment whichever key's JWT was minted first — and only after the 50-minute window turned
  over, which is a miserable bug to find later.
- **The cross-gateway retry swaps the key too.** Retrying the other host with the first host's key
  is a guaranteed 403, which would make the retry decorative. It still may only *improve* an
  outcome, never override the first verdict.

`notify-partner`'s live behaviour is unchanged: every install today is a sandbox build, so it still
signs sandbox rows with `APNS_KEY_P8` and still posts to the sandbox host, byte for byte as before.
What changes is that a production row — which previously failed outright — now works, so **TestFlight
is no longer dead on arrival.**

Confirmed by a controlled probe (2026-08-16): the same key, token and body sent seconds apart
returned `403 BadEnvironmentKeyInToken` on production and `400 BadDeviceToken` on sandbox. The same
probe run also established that **APNs validates the device token before the topic, the push type
and the body** — a stripped payload, a 5,212-byte payload, a foreign topic and a wrong push type all
returned an identical `BadDeviceToken`. So nothing in the envelope above is *confirmed* by a probe
without a real device token; it is only un-refuted. Treat the topic, the push type, `attributes: {}`
and the stringified `props` as unproven until they run against real hardware.

## Ordering problem, and who solves it

The image must be in the App Group **before** the activity renders, but push-to-start wakes the app
only at push time. Resolution: the activity's first frame renders the text state (`imageFile: null`)
and the app, once awake, downloads into the App Group and calls `update` locally with the filename.
The app lane owns this; the backend lane just sends the text-only start payload.
