import appJson from '../../../app.json';
import {
  APP_GROUP_IDENTIFIER,
  IOS_BUNDLE_IDENTIFIER,
  URL_SCHEME,
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
