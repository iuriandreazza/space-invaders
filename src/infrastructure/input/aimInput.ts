import type { InputPort } from '../../application/ports.ts';
import type { Input, Point } from '../../../shared/game/types.ts';
import { KeyboardInput } from './keyboardInput.ts';
import { PointerInput } from './pointerInput.ts';
import { steerToward } from './steerToward.ts';

type SteeringDevice = 'keyboard' | 'pointer';

/**
 * Steers the reticle with the keyboard or the pointer, whichever was used last, and fires with either: a player who
 * aims with the mouse can still pull the trigger with the space bar.
 */
export class AimInput implements InputPort {
  private readonly keyboard: KeyboardInput;
  private readonly pointer: PointerInput;
  private steeringDevice: SteeringDevice = 'keyboard';

  constructor(canvas: HTMLCanvasElement, target: Window = window) {
    this.keyboard = new KeyboardInput(target, () => {
      this.steeringDevice = 'keyboard';
    });
    this.pointer = new PointerInput(canvas, target, () => {
      this.steeringDevice = 'pointer';
    });
  }

  read(aim: Readonly<Point>): Input {
    const keys = this.keyboard.read();
    const { aimPoint } = this.pointer;
    const { left, right, up, down } = this.steeringDevice === 'pointer' && aimPoint ? steerToward(aim, aimPoint) : keys;
    return { left, right, up, down, fire: keys.fire || this.pointer.isFiring };
  }

  dispose(): void {
    this.keyboard.dispose();
    this.pointer.dispose();
    this.steeringDevice = 'keyboard';
  }
}
