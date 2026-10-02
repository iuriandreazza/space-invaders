// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointerInput } from './pointerInput.ts';
import { createCanvas, pointerAt } from './testSupport.ts';

describe('PointerInput', () => {
  const inputs: PointerInput[] = [];
  const create = (canvas = createCanvas(), onActivity = vi.fn()) => {
    const input = new PointerInput(canvas, window, onActivity);
    inputs.push(input);
    return { input, canvas, onActivity };
  };
  afterEach(() => inputs.splice(0).forEach((input) => input.dispose()));

  it('points nowhere and holds no trigger at first', () => {
    const { input } = create();
    expect(input.aimPoint).toBeNull();
    expect(input.isFiring).toBe(false);
  });

  it('turns the position over the scaled canvas into game pixels', () => {
    const { input, canvas } = create();

    canvas.dispatchEvent(pointerAt('pointermove', 100 + 240, 50 + 320));
    expect(input.aimPoint).toEqual({ x: 120, y: 160 });

    canvas.dispatchEvent(pointerAt('pointermove', 100, 50));
    expect(input.aimPoint).toEqual({ x: 0, y: 0 });
    canvas.dispatchEvent(pointerAt('pointermove', 100 + 480, 50 + 640));
    expect(input.aimPoint).toEqual({ x: 240, y: 320 });
  });

  it('measures the canvas again on every event, since the page can be resized or scrolled', () => {
    const box = { left: 0, top: 0, width: 240, height: 320 };
    const { input, canvas } = create(createCanvas(box));
    canvas.dispatchEvent(pointerAt('pointermove', 60, 80));
    expect(input.aimPoint).toEqual({ x: 60, y: 80 });

    Object.assign(box, { left: 20, top: 10, width: 120, height: 160 });
    canvas.dispatchEvent(pointerAt('pointermove', 80, 90));
    expect(input.aimPoint).toEqual({ x: 120, y: 160 });
  });

  it('ignores a canvas that has no size, instead of dividing by zero', () => {
    const { input, canvas, onActivity } = create(createCanvas({ left: 0, top: 0, width: 0, height: 0 }));
    canvas.dispatchEvent(pointerAt('pointermove', 10, 10));
    expect(input.aimPoint).toBeNull();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('fires while the left button is held on the canvas, and lets go anywhere on the window', () => {
    const { input, canvas } = create();

    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300, { button: 0 }));
    expect(input.isFiring).toBe(true);
    expect(input.aimPoint).not.toBeNull();

    window.dispatchEvent(pointerAt('pointerup', 5, 5));
    expect(input.isFiring).toBe(false);
  });

  it('lets go when the browser takes the pointer away', () => {
    const { input, canvas } = create();
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    window.dispatchEvent(pointerAt('pointercancel', 300, 300));
    expect(input.isFiring).toBe(false);
  });

  it('leaves the other buttons to the browser', () => {
    const { input, canvas, onActivity } = create();
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300, { button: 2 }));
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300, { button: 1 }));
    expect(input.isFiring).toBe(false);
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('keeps firing until the last finger is lifted', () => {
    const { input, canvas } = create();
    canvas.dispatchEvent(pointerAt('pointerdown', 200, 200, { pointerId: 1 }));
    canvas.dispatchEvent(pointerAt('pointerdown', 250, 250, { pointerId: 2 }));

    window.dispatchEvent(pointerAt('pointerup', 200, 200, { pointerId: 1 }));
    expect(input.isFiring).toBe(true);
    window.dispatchEvent(pointerAt('pointerup', 250, 250, { pointerId: 2 }));
    expect(input.isFiring).toBe(false);
  });

  it('lets go of the trigger when the window loses focus', () => {
    const { input, canvas } = create();
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    window.dispatchEvent(new Event('blur'));
    expect(input.isFiring).toBe(false);
  });

  it('says so whenever the pointer moves or goes down on the canvas', () => {
    const { canvas, onActivity } = create();
    canvas.dispatchEvent(pointerAt('pointermove', 300, 300));
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it('does not listen to a pointer that is not over the canvas', () => {
    const { input, onActivity } = create();
    window.dispatchEvent(pointerAt('pointermove', 300, 300));
    expect(input.aimPoint).toBeNull();
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('keeps the context menu from opening over the game', () => {
    const { canvas } = create();
    const event = new Event('contextmenu', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops listening and forgets everything once disposed', () => {
    const { input, canvas, onActivity } = create();
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));

    input.dispose();

    expect(input.isFiring).toBe(false);
    expect(input.aimPoint).toBeNull();
    canvas.dispatchEvent(pointerAt('pointerdown', 300, 300));
    canvas.dispatchEvent(pointerAt('pointermove', 300, 300));
    const menu = new Event('contextmenu', { cancelable: true });
    canvas.dispatchEvent(menu);
    expect(input.isFiring).toBe(false);
    expect(input.aimPoint).toBeNull();
    expect(menu.defaultPrevented).toBe(false);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });
});
