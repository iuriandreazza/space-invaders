import { describe, expect, it } from 'vitest';
import { BrowserPreferences } from './browserPreferences.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe('BrowserPreferences', () => {
  it('remembers initials and the mute setting', () => {
    const storage = memoryStorage();
    const first = new BrowserPreferences(storage);
    first.saveInitials('ABC');
    first.saveMuted(true);

    const second = new BrowserPreferences(storage);
    expect(second.loadInitials()).toBe('ABC');
    expect(second.loadMuted()).toBe(true);
  });

  it('starts with no initials and sound on', () => {
    const preferences = new BrowserPreferences(memoryStorage());
    expect(preferences.loadInitials()).toBe('');
    expect(preferences.loadMuted()).toBe(false);
  });

  it('cleans up initials that were stored by hand', () => {
    const storage = memoryStorage();
    storage.setItem('space-invaders:initials', 'a-b!cdef');
    expect(new BrowserPreferences(storage).loadInitials()).toBe('ABC');
  });

  it('keeps working when the storage is missing or throws', () => {
    const broken = new BrowserPreferences({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.loadInitials()).toBe('');
    expect(() => broken.saveMuted(true)).not.toThrow();

    const missing = new BrowserPreferences(null);
    expect(missing.loadMuted()).toBe(false);
    expect(() => missing.saveInitials('ABC')).not.toThrow();
  });
});
