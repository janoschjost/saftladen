/**
 * Registry of things a developer can trigger by hand (meeting, vaping, printer run, ...).
 * Add new behaviour by calling `devEvents.register(...)` where it lives; the dev panel and `window.dev` pick it up automatically.
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

class DevEvents {
  private events = new Map<string, DevEvent>();
  private listeners: Listener[] = [];

  register(ev: DevEvent): void {
    this.events.set(ev.id, ev);
    this.listeners.forEach((l) => l());
  }

  unregister(id: string): void {
    if (this.events.delete(id)) this.listeners.forEach((l) => l());
  }

  list(): DevEvent[] {
    return [...this.events.values()];
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

export const devEvents = new DevEvents();

// console access: dev.list(), dev.trigger('vape-fabian-bucher')
(window as unknown as { dev: unknown }).dev = {
  list: () => devEvents.list().map((e) => `${e.id}  (${e.group}: ${e.label})`),
  trigger: (id: string) => devEvents.trigger(id),
};
