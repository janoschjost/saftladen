const closers = new Map<string, () => void>();

/** Side panels (settings, seats, dev, room editor) share one slot: register a close fn, call the returned fn when this panel opens. */
export function exclusivePanel(id: string, close: () => void): () => void {
  closers.set(id, close);
  return () => {
    for (const [other, fn] of closers) if (other !== id) fn();
  };
}
