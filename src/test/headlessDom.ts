/**
 * Just enough `document` for Node (Vitest) to build the office and the characters: the builders paint their textures
 * on canvases. Here a canvas accepts every drawing call and draws nothing. Simulation tests call this first; logic
 * tests don't, so a DOM access that sneaks into logic still fails there.
 */
export function installHeadlessDom(): void {
  const g = globalThis as Record<string, unknown>;
  if (g.document) return;
  // a 2D context: any property is a function that returns something measurable, so `measureText(...).width` works
  const context = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, key) => (key === 'canvas' ? canvas() : key === 'width' || key === 'data' ? (key === 'width' ? 0 : new Uint8ClampedArray(4)) : context()),
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
