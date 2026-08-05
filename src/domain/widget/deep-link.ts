/**
 * Turns the deep link the widget carries into an in-app route.
 *
 * The home-screen widget hands `bundles://…` to iOS, which hands it back to the app's linking
 * handler. The in-app preview shows the same content and should land in the same place when tapped,
 * but it is already inside the app — bouncing its own URL scheme through the OS to get there would
 * be a round trip for nothing. Parsing here keeps one definition of what each link means, and keeps
 * it testable without a device.
 */

export type WidgetRoute =
  | { pathname: '/media/[id]'; params: { id: string } }
  | { pathname: '/draw'; params: { base: string } }
  | { pathname: '/music' };

/**
 * The route a widget deep link points at, or null if it isn't one we recognise.
 *
 * Unknown links return null rather than throwing or guessing a destination: this runs on a tap, and
 * doing nothing is a better failure than navigating somewhere arbitrary.
 */
export function parseWidgetDeepLink(deepLink: string | undefined): WidgetRoute | null {
  if (!deepLink) return null;

  // Accept both `bundles://draw` and `bundles:///draw`. The widget emits the two-slash form, but
  // `Linking.createURL` produces the three-slash one, and iOS hands back whatever it was given —
  // so normalise rather than make the caller care which spelling arrived.
  const rest = /^bundles:\/\/\/?(.*)$/.exec(deepLink)?.[1];
  if (rest === undefined) return null;

  const media = /^media\/([^/?#]+)$/.exec(rest);
  if (media) return { pathname: '/media/[id]', params: { id: media[1] } };

  const draw = /^draw\?base=([^&#]+)$/.exec(rest);
  if (draw) return { pathname: '/draw', params: { base: draw[1] } };

  if (rest === 'music') return { pathname: '/music' };

  return null;
}
