/**
 * Registry of things a developer can trigger by hand (meeting, vaping, printer run, ...). Every `Sim` owns one
 * (`sim.events`) with the events that only touch the simulation (`simEvents.ts`); the game adds the ones that need
 * the view. The dev panel, the Aktionen sheet, `?event=` and `window.dev` read it.
 */
export interface DevEvent {
  id: string;
  label: string;
  /** panel section, e.g. "Meetings" */
  group: string;
  /** Runs the event. Return a short status message (shown in the panel) or nothing. Return false-y message `null` to say "could not run". */
  run: () => string | void | null;
}

type Listener = () => void;

export class DevEvents {
  private events = new Map<string, DevEvent>();
  private listeners: Listener[] = [];

  register(ev: DevEvent): void {
    this.events.set(ev.id, ev);
    this.listeners.forEach((l) => l());
  }

  list(): DevEvent[] {
    return [...this.events.values()];
  }

  get(id: string): DevEvent | null {
    return this.events.get(id) ?? null;
  }

  /** Subscribe to registry changes (panel re-renders). */
  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** Run by id; returns the status text. */
  trigger(id: string): string {
    const ev = this.events.get(id);
    if (!ev) return `unbekannt: ${id}`;
    const r = ev.run();
    return r === null ? `${ev.label}: nicht möglich` : r || ev.label;
  }
}

/** Console access: `dev.list()`, `dev.trigger('vape-fabian-bucher')`. */
export function exposeDevConsole(events: DevEvents): void {
  // added to what is there: the overlays and `forceState` hang their own calls on `dev`, in whatever order
  const w = window as unknown as { dev?: object };
  w.dev = Object.assign(w.dev ?? {}, {
    list: () => events.list().map((e) => `${e.id}  (${e.group}: ${e.label})`),
    trigger: (id: string) => events.trigger(id),
  });
}
