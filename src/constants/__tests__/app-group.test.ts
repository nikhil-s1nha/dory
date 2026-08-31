import appJson from '../../../app.json';
import {
  APP_GROUP_IDENTIFIER,
  IOS_BUNDLE_IDENTIFIER,
  URL_SCHEME,
  WIDGET_ASPECT_RATIO,
} from '../app-group';

/**
 * The widget reads the App Group container; the app writes it. If these constants
 * drift from app.json, the container path silently diverges and the widget renders
 * empty on device with no error. Cheaper to catch here than on a physical phone.
 */
describe('app-group constants match app.json', () => {
  it('bundle identifier matches expo.ios.bundleIdentifier', () => {
    expect(IOS_BUNDLE_IDENTIFIER).toBe(appJson.expo.ios.bundleIdentifier);
  });

  it('url scheme matches expo.scheme', () => {
    expect(URL_SCHEME).toBe(appJson.expo.scheme);
  });

  it('app group identifier is derived from the bundle id', () => {
    expect(APP_GROUP_IDENTIFIER).toBe(`group.${IOS_BUNDLE_IDENTIFIER}`);
  });
});

/**
 * `WIDGET_ASPECT_RATIO` is the app's model of a shape only the widget extension knows for certain.
 * It is set from what is actually on the home screen (a square systemSmall tile, confirmed by
 * photographing the device), so the pair worth guarding is: the number stays usable as a ratio, and
 * the family it describes is still one the widget declares.
 */
describe('WIDGET_ASPECT_RATIO', () => {
  it('is a usable ratio — a degenerate one would put NaN into a layout and a crop', () => {
    expect(Number.isFinite(WIDGET_ASPECT_RATIO)).toBe(true);
    expect(WIDGET_ASPECT_RATIO).toBeGreaterThan(0);
  });

  it('is the square small widget the user has placed', () => {
    expect(WIDGET_ASPECT_RATIO).toBe(158 / 158);
    // Retargeting is expected; retargeting to a family the extension doesn't offer is not.
    expect(JSON.stringify(appJson)).toContain('"systemSmall"');
  });
});
