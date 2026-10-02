import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import type { Point } from '../../../shared/game/types.ts';

/**
 * Reads the mouse, a pen or fingers on the canvas: where they point is where the reticle should go, and holding the
 * main button, the pen tip or a finger down pulls the trigger.
 */
export class PointerInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly view: Window;
  private readonly onActivity: () => void;
  private aimedAt: Point | null = null;
  /** Fingers can be down together, and the trigger stays pulled until the last of them is lifted. */
  private readonly pressed = new Set<number>();

  /** `onActivity` runs whenever the pointer moves over the canvas or goes down on it, so that its owner knows who is steering. */
  constructor(canvas: HTMLCanvasElement, view: Window, onActivity: () => void) {
    this.canvas = canvas;
    this.view = view;
    this.onActivity = onActivity;
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    view.addEventListener('pointerup', this.handlePointerUp);
    view.addEventListener('pointercancel', this.handlePointerUp);
    view.addEventListener('blur', this.releaseAll);
  }

  /** Where the pointer last was over the canvas, in game pixels; null until it has been there. */
  get aimPoint(): Point | null {
    return this.aimedAt;
  }

  get isFiring(): boolean {
    return this.pressed.size > 0;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.view.removeEventListener('pointerup', this.handlePointerUp);
    this.view.removeEventListener('pointercancel', this.handlePointerUp);
    this.view.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
    this.aimedAt = null;
  }

  private aimAt(event: PointerEvent): void {
    // Measured on every event: CSS scales the canvas, and the page may scroll or resize under the pointer.
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    this.aimedAt = {
      x: ((event.clientX - box.left) / box.width) * SCREEN_WIDTH,
      y: ((event.clientY - box.top) / box.height) * SCREEN_HEIGHT,
    };
    this.onActivity();
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.aimAt(event);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    // The left button only: the others are the browser's (context menu, auto-scroll). Touch and pen contact count as it.
    if (event.button !== 0) return;
    this.aimAt(event);
    this.pressed.add(event.pointerId);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pressed.delete(event.pointerId);
  };

  /** A long press on a touch screen, or a right click, would open a menu over the game. */
  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  /** A button released while the window was in the background never sends its pointerup. */
  private readonly releaseAll = (): void => {
    this.pressed.clear();
  };
}
