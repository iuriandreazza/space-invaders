import type { ConsentDecision, ConsentStore } from '../../application/ports.ts';
import { SafeStorage, type KeyValueStorage } from './safeStorage.ts';

/** Versioned: a change in what the visitor is asked to agree to must ask everybody again, so it gets a new key. */
const CONSENT_KEY = 'space-invaders:consent:v1';

/** Without storage the banner simply comes back on the next visit. */
export class BrowserConsentStore implements ConsentStore {
  private readonly storage: SafeStorage;

  constructor(storage?: KeyValueStorage | null) {
    this.storage = new SafeStorage(storage);
  }

  load(): ConsentDecision | null {
    const stored = this.storage.read(CONSENT_KEY);
    return stored === 'accepted' || stored === 'declined' ? stored : null;
  }

  save(decision: ConsentDecision): void {
    this.storage.write(CONSENT_KEY, decision);
  }
}
