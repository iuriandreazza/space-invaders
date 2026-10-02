/** Outcome of validating untrusted input: the typed value, or a message that is safe to show to the caller. */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

export function valid<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

/** The message must never repeat what the caller sent. */
export function invalid(message: string): Parsed<never> {
  return { ok: false, message };
}
