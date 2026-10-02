import { sanitizeInitials } from '../../../shared/initials.ts';
import type { Preferences } from '../../application/ports.ts';
import { SafeStorage, type KeyValueStorage } from './safeStorage.ts';

const INITIALS_KEY = 'space-invaders:initials';
const MUTED_KEY = 'space-invaders:muted';

/** Preferences that do not stick are better than no game: see {@link SafeStorage}. */
export class BrowserPreferences implements Preferences {
  private readonly storage: SafeStorage;

  constructor(storage?: KeyValueStorage | null) {
    this.storage = new SafeStorage(storage);
  }

  loadInitials(): string {
    return sanitizeInitials(this.storage.read(INITIALS_KEY) ?? '');
  }

  saveInitials(initials: string): void {
    this.storage.write(INITIALS_KEY, initials);
  }

  loadMuted(): boolean {
    return this.storage.read(MUTED_KEY) === 'true';
  }

  saveMuted(muted: boolean): void {
    this.storage.write(MUTED_KEY, String(muted));
  }
}
