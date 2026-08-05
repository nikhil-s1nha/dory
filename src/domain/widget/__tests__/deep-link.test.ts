import { parseWidgetDeepLink } from '../deep-link';

describe('parseWidgetDeepLink', () => {
  it('routes a photo to its full view', () => {
    expect(parseWidgetDeepLink('bundles://media/abc-123')).toEqual({
      pathname: '/media/[id]',
      params: { id: 'abc-123' },
    });
  });

  it('routes a drawing to the canvas preloaded with it, not to the photo viewer', () => {
    // The spec 3.2 round-trip lives or dies on this distinction.
    expect(parseWidgetDeepLink('bundles://draw?base=abc-123')).toEqual({
      pathname: '/draw',
      params: { base: 'abc-123' },
    });
  });

  it('routes music to the music screen', () => {
    expect(parseWidgetDeepLink('bundles://music')).toEqual({ pathname: '/music' });
  });

  it('matches the links widget-sync actually emits', () => {
    // Guards against the two drifting apart — these strings are copied from buildProps.
    const id = '11111111-2222-3333-4444-555555555555';
    expect(parseWidgetDeepLink(`bundles://media/${id}`)).not.toBeNull();
    expect(parseWidgetDeepLink(`bundles://draw?base=${id}`)).not.toBeNull();
  });

  it('accepts the three-slash spelling Linking.createURL produces', () => {
    // iOS hands back whatever spelling it was given, and these two are the same destination.
    expect(parseWidgetDeepLink('bundles:///media/abc-123')).toEqual({
      pathname: '/media/[id]',
      params: { id: 'abc-123' },
    });
    expect(parseWidgetDeepLink('bundles:///draw?base=abc-123')).toEqual({
      pathname: '/draw',
      params: { base: 'abc-123' },
    });
    expect(parseWidgetDeepLink('bundles:///music')).toEqual({ pathname: '/music' });
  });

  it('returns null rather than guessing a destination', () => {
    expect(parseWidgetDeepLink(undefined)).toBeNull();
    expect(parseWidgetDeepLink('')).toBeNull();
    expect(parseWidgetDeepLink('https://example.com/media/1')).toBeNull();
    expect(parseWidgetDeepLink('bundles://unknown')).toBeNull();
    expect(parseWidgetDeepLink('bundles://media/')).toBeNull();
    expect(parseWidgetDeepLink('bundles://draw')).toBeNull();
  });
});
