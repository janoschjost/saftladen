/**
 * Just enough `document` for Node (Vitest) to build the office and the characters: the builders paint their textures
 * on canvases. Here a canvas accepts every drawing call and draws nothing. Simulation tests call this first; logic
 * tests don't, so a DOM access that sneaks into logic still fails there (Vitest runs each test file on its own).
 */
export function installHeadlessDom(): void {
  const g = globalThis as Record<string | symbol, unknown>;
  if (g.document) return;
  // A 2D context where any property can be called, read on, or used as a number (it counts as 0), so
  // `ctx.measureText(s).width / 2` and `ctx.getImageData(...).data` work.
  const fixed: Record<string | symbol, () => unknown> = {
    canvas: () => canvas(),
    data: () => new Uint8ClampedArray(4),
    [Symbol.toPrimitive]: () => () => 0,
  };
  const context = (): unknown =>
    new Proxy(function () {}, {
      get: (_target, key) => (fixed[key] ?? context)(),
      set: () => true,
      apply: () => context(),
    });
  const canvas = (): unknown => ({ width: 1, height: 1, style: {}, getContext: () => context(), addEventListener() {}, toDataURL: () => '' });
  g.document = { createElement: (tag: string) => (tag === 'canvas' ? canvas() : { style: {}, appendChild() {}, addEventListener() {} }) };
  g.Image = class {
    onload: (() => void) | null = null;
    set src(_v: string) {}
  };
}
