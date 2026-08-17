/**
 * The App Group container is the single contract between the app and the widget
 * extension, and the seam that keeps the widget swappable (expo-widgets today,
 * hand-written SwiftUI later) without touching the backend or the app.
 *
 * Everything here must stay in lockstep with `app.json` — see the test alongside
 * this file, which fails the build if they drift apart. Getting this wrong
 * surfaces as a silently-empty widget on device, which is expensive to debug.
 */

/** Must equal `expo.ios.bundleIdentifier` in app.json. */
export const IOS_BUNDLE_IDENTIFIER = 'com.nikhilsinha.bundles';

/** Must equal `expo.scheme` in app.json. Widget taps deep-link through this. */
export const URL_SCHEME = 'bundles';

/** The shared container both the app and the widget extension can read/write. */
export const APP_GROUP_IDENTIFIER = `group.${IOS_BUNDLE_IDENTIFIER}`;

// A hand-rolled `state.json` + `images/` layout (with its own version field) was designed here
// before expo-widgets landed. It was never built: `updateSnapshot` carries the props and
// `downloadToAppGroup` writes the image files directly, so there is no second source of truth to
// keep in sync. The constants that described it are gone rather than sitting here documented as
// "durable source of truth" while nothing reads them. Only reintroduce them alongside a widget
// that actually parses the file.

/**
 * Widget extensions are killed at 30MB (EXC_RESOURCE RESOURCE_TYPE_MEMORY). A 12MP
 * photo decodes to ~48MB, so the widget only ever touches a derivative bounded by this.
 *
 * Measured on device: 1200px was still too generous. A 1200x2422 upload decodes to 11.1MB and its
 * render silently failed; 4.0MB was the largest that rendered. Matched to
 * `WIDGET_RENDER_MAX_DIMENSION` so newly uploaded media is already widget-safe and the downscale on
 * the App Group copy becomes a no-op for it.
 */
export const WIDGET_IMAGE_MAX_DIMENSION = 600;

/**
 * Hard cap on the long edge of any image handed to the widget extension.
 *
 * `WIDGET_IMAGE_MAX_DIMENSION` bounds what gets *uploaded*, but 1200px still decodes to roughly
 * 1200x1600x4 = 7.7MB — and the extension shares its ~30MB budget with the expo-widgets JS runtime,
 * which is enough to push a render over. An over-budget render fails **silently**: no crash log, no
 * red box, WidgetKit simply keeps displaying the previous snapshot. That is indistinguishable from
 * "the widget is frozen", which is exactly how it presented.
 *
 * A medium widget is ~338x158pt (~1014x474px @3x), so 600px is ample for display and decodes to
 * under 2MB. Applied when writing into the App Group rather than at upload time, so it also fixes
 * media that is already stored.
 */
export const WIDGET_RENDER_MAX_DIMENSION = 600;
