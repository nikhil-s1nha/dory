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
export const IOS_BUNDLE_IDENTIFIER = 'com.nikhilsinha.dory';

/** Must equal `expo.scheme` in app.json. Widget taps deep-link through this. */
export const URL_SCHEME = 'dory';

/** The shared container both the app and the widget extension can read/write. */
export const APP_GROUP_IDENTIFIER = `group.${IOS_BUNDLE_IDENTIFIER}`;

/** Durable source of truth inside the container, read by whichever widget we ship. */
export const WIDGET_STATE_FILENAME = 'state.json';

/** Widget-sized image derivatives live here. Never full-resolution originals. */
export const WIDGET_IMAGES_DIRNAME = 'images';

/**
 * Bumped whenever the shape of `state.json` changes. The widget refuses to render
 * state it does not understand rather than crashing inside the 30MB extension.
 */
export const WIDGET_STATE_VERSION = 1;

/**
 * Widget extensions are killed at 30MB (EXC_RESOURCE RESOURCE_TYPE_MEMORY). A 12MP
 * photo decodes to ~48MB, so the widget only ever touches a derivative bounded by this.
 */
export const WIDGET_IMAGE_MAX_DIMENSION = 1200;
