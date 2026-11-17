import type { OverlayKind } from './DebugOverlays';
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
  /**
   * The event ends or reads something and null just means "nothing to do": it is not forced (see `DevEvents.forcer`).
   * Also for an event that forces only the part clearing the office can help with (`DevEvents.force`), or that
   * clearing cannot help at all (`talk-join`: it would end the talk to join).
   */
  asIs?: true;
}

type Listener = () => void;

export class DevEvents {
  private events = new Map<string, DevEvent>();
  private listeners: Listener[] = [];
  /**
   * Set by the simulation: when an event cannot run, it clears the way (brings people in, moves occupants out) and
   * runs it again, so that an action a dev asks for always happens. Events with `asIs` are left alone.
   */
  forcer: ((run: () => string | void | null) => string | void | null) | null = null;

  register(ev: DevEvent): void {
    const run = ev.run;
    if (!ev.asIs) ev = { ...ev, run: () => this.force(run) };
    this.events.set(ev.id, ev);
    this.listeners.forEach((l) => l());
  }

  /** Runs `run`; when it cannot run, clears the way and runs it again (`forcer`). */
  force(run: () => string | void | null): string | void | null {
    const r = run();
    return r === null && this.forcer ? this.forcer(run) : r;
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

/** `window.dev`: what a developer can call from the console. The game and the dev tools hang their parts on it. */
export interface DevConsole {
  /** every event: id, group and label */
  list(): string[];
  /** runs an event by id; returns its status text */
  trigger(id: string): string;
  /** sends a person into a state (`DevForce.ts`, loaded after the game) */
  forceState?: (id: string, state: string) => string;
  /** switches a debug overlay (`DebugOverlays.ts`) */
  overlay?: (kind: OverlayKind, on?: boolean) => void;
  /** takes a person or a pet out of the simulation, brings them back, lists who is out (dev and e2e builds) */
  remove?: (id: string) => string | null;
  restore?: (id: string) => string | null;
  removed?: () => string[];
}

declare global {
  interface Window {
    dev: DevConsole;
  }
}

/** Console access: `dev.list()`, `dev.trigger('vape-fabian-bucher')`. */
export function exposeDevConsole(events: DevEvents): void {
  // added to what is there: the overlays and `forceState` hang their own calls on `dev`, in whatever order
  const w = window as { dev?: Partial<DevConsole> };
  w.dev = Object.assign(w.dev ?? {}, {
    list: () => events.list().map((e) => `${e.id}  (${e.group}: ${e.label})`),
    trigger: (id: string) => events.trigger(id),
  });
}
