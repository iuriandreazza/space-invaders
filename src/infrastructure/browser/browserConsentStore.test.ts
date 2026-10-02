import { describe, expect, it } from 'vitest';
import { BrowserConsentStore } from './browserConsentStore.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe('BrowserConsentStore', () => {
  it('has no decision before the visitor makes one', () => {
    expect(new BrowserConsentStore(memoryStorage()).load()).toBeNull();
  });

  it.each(['accepted', 'declined'] as const)('remembers a visitor who %s', (decision) => {
    const storage = memoryStorage();
    new BrowserConsentStore(storage).save(decision);
    expect(new BrowserConsentStore(storage).load()).toBe(decision);
  });

  it('keeps the latest decision', () => {
    const store = new BrowserConsentStore(memoryStorage());
    store.save('accepted');
    store.save('declined');
    expect(store.load()).toBe('declined');
  });

  it('keeps the decision under a versioned key', () => {
    const storage = memoryStorage();
    new BrowserConsentStore(storage).save('accepted');
    expect(storage.getItem('space-invaders:consent:v1')).toBe('accepted');
  });

  it('treats anything else that is stored as no decision', () => {
    const storage = memoryStorage();
    storage.setItem('space-invaders:consent:v1', 'maybe');
    expect(new BrowserConsentStore(storage).load()).toBeNull();
  });

  it('keeps working when the storage is missing or throws', () => {
    const broken = new BrowserConsentStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.load()).toBeNull();
    expect(() => broken.save('accepted')).not.toThrow();

    const missing = new BrowserConsentStore(null);
    expect(missing.load()).toBeNull();
    expect(() => missing.save('declined')).not.toThrow();
  });
});
