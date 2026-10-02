interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** jsdom has no layout: the canvas reports whatever box the test says CSS gave it. */
export function createCanvas(box: Box = { left: 100, top: 50, width: 480, height: 640 }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect;
  return canvas;
}

export const pointerAt = (type: string, clientX: number, clientY: number, init: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, { clientX, clientY, pointerId: 1, cancelable: true, ...init });
