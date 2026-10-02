export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage can be missing or full (private windows, blocked site data): reading then finds nothing and writing does nothing. */
export class SafeStorage {
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null = readBrowserStorage()) {
    this.storage = storage;
  }

  read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Not being able to remember something is not worth interrupting the game.
    }
  }
}

function readBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
