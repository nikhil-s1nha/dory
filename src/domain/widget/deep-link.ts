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

  const media = /^bundles:\/\/media\/([^/?#]+)$/.exec(deepLink);
  if (media) return { pathname: '/media/[id]', params: { id: media[1] } };

  const draw = /^bundles:\/\/draw\?base=([^&#]+)$/.exec(deepLink);
  if (draw) return { pathname: '/draw', params: { base: draw[1] } };

  if (deepLink === 'bundles://music') return { pathname: '/music' };

  return null;
}
