import type { Input } from '../../../shared/game/types.ts';

const KEY_BINDINGS: Record<keyof Input, readonly string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  fire: ['Space', 'KeyZ', 'KeyX'],
};

const STEERING_KEYS = new Set([...KEY_BINDINGS.left, ...KEY_BINDINGS.right, ...KEY_BINDINGS.up, ...KEY_BINDINGS.down]);
const GAME_KEYS = new Set([...STEERING_KEYS, ...KEY_BINDINGS.fire]);

/** Reads the controls from the keyboard; keys are matched by position, so layouts do not matter. */
export class KeyboardInput {
  private readonly target: Window;
  private readonly onSteerKey: () => void;
  private readonly pressed = new Set<string>();

  /** `onSteerKey` runs whenever a key that moves the reticle goes down, so that its owner knows who is steering. */
  constructor(target: Window, onSteerKey: () => void) {
    this.target = target;
    this.onSteerKey = onSteerKey;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
    target.addEventListener('blur', this.releaseAll);
  }

  read(): Input {
    const isDown = (keys: readonly string[]): boolean => keys.some((key) => this.pressed.has(key));
    return {
      left: isDown(KEY_BINDINGS.left),
      right: isDown(KEY_BINDINGS.right),
      up: isDown(KEY_BINDINGS.up),
      down: isDown(KEY_BINDINGS.down),
      fire: isDown(KEY_BINDINGS.fire),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!GAME_KEYS.has(event.code)) return;
    // Arrows and space would otherwise scroll the page.
    event.preventDefault();
    this.pressed.add(event.code);
    if (STEERING_KEYS.has(event.code)) this.onSteerKey();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  /** A key released while the window was in the background never sends its keyup. */
  private readonly releaseAll = (): void => {
    this.pressed.clear();
  };
}
