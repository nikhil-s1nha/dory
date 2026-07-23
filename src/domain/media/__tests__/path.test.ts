import { mediaStoragePath } from '../path';

describe('mediaStoragePath', () => {
  it('puts the couple id first (the Storage RLS authorizes on it) then the item id + ext', () => {
    expect(mediaStoragePath('couple-1', 'item-9')).toBe('couple-1/item-9.jpg');
  });

  it('honours a custom extension', () => {
    expect(mediaStoragePath('c', 'i', 'png')).toBe('c/i.png');
  });
});
