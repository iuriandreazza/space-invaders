import { useEffect, useEffectEvent } from 'react';

const ACTIVATION_KEYS = new Set(['Enter', 'Space']);
const CONTROLS_ACTIVATED_BY_KEYS = 'button, a[href], input, select, textarea, summary';

/** A focused button or field answers to Enter and Space itself, and a keyboard user has to be able to rely on that. */
function isForTheFocusedControl(event: KeyboardEvent): boolean {
  return (
    ACTIVATION_KEYS.has(event.code) && event.target instanceof Element && event.target.closest(CONTROLS_ACTIVATED_BY_KEYS) !== null
  );
}

/** Runs an action when its key is pressed anywhere on the page. Keys are `KeyboardEvent.code` values. */
export function useHotkeys(bindings: Readonly<Record<string, () => void>>): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = bindings[event.code];
    if (!action || event.repeat || isForTheFocusedControl(event)) return;
    event.preventDefault();
    action();
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
