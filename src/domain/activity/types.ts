/**
 * The Live Activity's shared shapes, copied verbatim from `docs/live-activity-contract.md`.
 *
 * This file is the app-side source of truth that the `notify-partner` Edge Function mirrors, so
 * neither lane may rename a field here without changing the contract first.
 */

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
