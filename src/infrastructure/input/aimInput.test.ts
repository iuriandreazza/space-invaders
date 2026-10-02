// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AIM_SPEED, AIM_START } from '../../../shared/game/constants.ts';
import { AimInput } from './aimInput.ts';
import { createCanvas, pointerAt } from './testSupport.ts';

const press = (code: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { code, cancelable: true });
  window.dispatchEvent(event);
  return event;
};
const release = (code: string): void => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
};

const STILL = { left: false, right: false, up: false, down: false, fire: false };

describe('AimInput', () => {
  const inputs: AimInput[] = [];
  const create = () => {
    // The canvas is 2x the game: the game pixel (x, y) is under the client point (100 + 2x, 50 + 2y).
    const canvas = createCanvas({ left: 100, top: 50, width: 480, height: 640 });
    const input = new AimInput(canvas, window);
    inputs.push(input);
    const pointTo = (x: number, y: number): void => {
      canvas.dispatchEvent(pointerAt('pointermove', 100 + 2 * x, 50 + 2 * y));
    };
    return { input, canvas, pointTo };
  };
  afterEach(() => inputs.splice(0).forEach((input) => input.dispose()));

  it('reports nothing held at first', () => {
    expect(create().input.read(AIM_START)).toEqual(STILL);
  });

  it('steers with the keyboard: arrows or WASD, and Space, Z or X to fire', () => {
    const { input } = create();
    press('ArrowLeft');
    press('KeyW');
    press('Space');
    expect(input.read(AIM_START)).toEqual({ left: true, right: false, up: true, down: false, fire: true });

    release('ArrowLeft');
    release('KeyW');
    release('Space');
    press('KeyD');
    press('KeyS');
    press('KeyX');
    expect(input.read(AIM_START)).toEqual({ left: false, right: true, up: false, down: true, fire: true });
  });

  it('holds the directions that bring the reticle to the pointer, and none once it is there', () => {
    const { input, pointTo } = create();
    pointTo(AIM_START.x + 50, AIM_START.y - 40);

    expect(input.read(AIM_START)).toEqual({ ...STILL, right: true, up: true });
    expect(input.read({ x: AIM_START.x + 50, y: AIM_START.y - 40 })).toEqual(STILL);
    expect(input.read({ x: AIM_START.x + 50 - AIM_SPEED / 2, y: AIM_START.y - 40 + AIM_SPEED / 2 })).toEqual(STILL);
  });

  it('keeps following a pointer that stands still, wherever the reticle is pushed', () => {
    const { input, pointTo } = create();
    pointTo(40, 60);
    expect(input.read({ x: 200, y: 200 })).toEqual({ ...STILL, left: true, up: true });
  });

  it('gives the steering to whichever device was used last', () => {
    const { input, pointTo } = create();
    pointTo(AIM_START.x + 50, AIM_START.y);
    expect(input.read(AIM_START).right).toBe(true);

    press('ArrowLeft');
    expect(input.read(AIM_START)).toEqual({ ...STILL, left: true });

    release('ArrowLeft');
    expect(input.read(AIM_START)).toEqual(STILL);

    pointTo(AIM_START.x + 50, AIM_START.y);
    expect(input.read(AIM_START)).toEqual({ ...STILL, right: true });
  });

  it('does not let a fire key take the steering from the pointer', () => {
    const { input, pointTo } = create();
    pointTo(AIM_START.x + 50, AIM_START.y);

    press('Space');

    expect(input.read(AIM_START)).toEqual({ ...STILL, right: true, fire: true });
  });

  it('does not follow a pointer that has not been over the canvas', () => {
    const { input } = create();
    expect(input.read({ x: 10, y: 10 })).toEqual(STILL);
  });

  it('fires with the pointer button, with the keyboard, or with both', () => {
    const { input, canvas } = create();

    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    expect(input.read(AIM_START).fire).toBe(true);

    press('Space');
    window.dispatchEvent(pointerAt('pointerup', 300, 300));
    expect(input.read(AIM_START).fire).toBe(true);

    release('Space');
    expect(input.read(AIM_START).fire).toBe(false);
  });

  it('lets go of everything when the window loses focus', () => {
    const { input, canvas } = create();
    press('ArrowRight');
    press('Space');
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));

    window.dispatchEvent(new Event('blur'));

    expect(input.read(AIM_START).fire).toBe(false);
    expect(input.read(AIM_START).right).toBe(false);
  });

  it('stops the page from scrolling on game keys only', () => {
    create();
    expect(press('Space').defaultPrevented).toBe(true);
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(press('KeyQ').defaultPrevented).toBe(false);
  });

  it('removes every listener and forgets its state once disposed', () => {
    const { input, canvas, pointTo } = create();
    pointTo(200, 200);
    press('Space');
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));

    input.dispose();

    expect(input.read(AIM_START)).toEqual(STILL);
    pointTo(200, 200);
    press('ArrowLeft');
    press('Space');
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    expect(input.read(AIM_START)).toEqual(STILL);
    expect(press('Space').defaultPrevented).toBe(false);
  });
});
