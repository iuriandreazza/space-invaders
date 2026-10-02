import type { SpriteDefinition } from './spriteDefinitions.ts';

export type CreateCanvas = () => HTMLCanvasElement;

const createDomCanvas: CreateCanvas = () => document.createElement('canvas');

/** Paints each sprite once on its own tiny canvas, so that a frame only has to blit them. */
export class SpriteAtlas {
  // Keyed by the definition itself: looking a sprite up every frame must not build strings.
  private readonly painted = new Map<SpriteDefinition, HTMLCanvasElement>();
  private readonly createCanvas: CreateCanvas;

  /** The canvas factory is a parameter so that the atlas can be tested where there is no DOM. */
  constructor(createCanvas: CreateCanvas = createDomCanvas) {
    this.createCanvas = createCanvas;
  }

  get(definition: SpriteDefinition): HTMLCanvasElement {
    let canvas = this.painted.get(definition);
    if (!canvas) {
      canvas = this.paint(definition);
      this.painted.set(definition, canvas);
    }
    return canvas;
  }

  private paint(definition: SpriteDefinition): HTMLCanvasElement {
    const canvas = this.createCanvas();
    canvas.width = definition.rows[0]!.length;
    canvas.height = definition.rows.length;
    const ctx = canvas.getContext('2d')!;
    definition.rows.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        const color = definition.colors[pixel];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    return canvas;
  }
}
