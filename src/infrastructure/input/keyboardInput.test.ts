// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardInput } from './keyboardInput.ts';

const press = (code: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { code, cancelable: true });
  window.dispatchEvent(event);
  return event;
};
const release = (code: string): void => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
};

describe('KeyboardInput', () => {
  const inputs: KeyboardInput[] = [];
  const create = (onSteerKey = vi.fn()) => {
    const input = new KeyboardInput(window, onSteerKey);
    inputs.push(input);
    return { input, onSteerKey };
  };
  afterEach(() => inputs.splice(0).forEach((input) => input.dispose()));

  it('reports nothing pressed at first', () => {
    expect(create().input.read()).toEqual({ left: false, right: false, up: false, down: false, fire: false });
  });

  it('maps arrows, WASD and the fire keys', () => {
    const { input } = create();
    press('ArrowLeft');
    press('KeyW');
    press('Space');
    expect(input.read()).toEqual({ left: true, right: false, up: true, down: false, fire: true });

    release('ArrowLeft');
    release('KeyW');
    release('Space');
    press('KeyD');
    press('ArrowDown');
    press('KeyZ');
    expect(input.read()).toEqual({ left: false, right: true, up: false, down: true, fire: true });
  });

  it('keeps a direction held while another key bound to it is still down', () => {
    const { input } = create();
    press('ArrowLeft');
    press('KeyA');
    release('ArrowLeft');
    expect(input.read().left).toBe(true);
  });

  it('says when a steering key goes down, and only then', () => {
    const { onSteerKey } = create();
    press('Space');
    press('KeyX');
    press('KeyQ');
    expect(onSteerKey).not.toHaveBeenCalled();

    press('ArrowUp');
    press('KeyA');
    expect(onSteerKey).toHaveBeenCalledTimes(2);
  });

  it('stops the page from scrolling on game keys only', () => {
    create();
    expect(press('Space').defaultPrevented).toBe(true);
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(press('KeyQ').defaultPrevented).toBe(false);
  });

  it('lets go of everything when the window loses focus', () => {
    const { input } = create();
    press('ArrowRight');
    window.dispatchEvent(new Event('blur'));
    expect(input.read().right).toBe(false);
  });

  it('stops listening once disposed', () => {
    const { input, onSteerKey } = create();
    input.dispose();
    press('ArrowLeft');
    expect(input.read().left).toBe(false);
    expect(onSteerKey).not.toHaveBeenCalled();
  });
});
