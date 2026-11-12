import { random } from "./rng";

/** States a dev can send a person into by hand (dev panel "Leute", `dev.forceState(id, state)`). */
export const FORCE_STATES = [
  "desk",
  "errand",
  "home",
  "meeting",
  "break",
  "wc",
] as const;
export type ForceState = (typeof FORCE_STATES)[number];

export const FORCE_LABELS: Record<ForceState, string> = {
  desk: "Am Platz",
  errand: "Besorgung",
  home: "Homeoffice",
  meeting: "Meeting",
  break: "Pause",
  wc: "WC",
};

/** Just the part of a person that forcing a state looks at. */
export interface ForcePerson {
  id: string;
  member: { name: string };
  inOffice: boolean;
  held: boolean;
  controlled: boolean;
  /** sitting and working at a desk */
  working: boolean;
}

/**
 * What the game does for each state. Every callback checks first and returns false without touching anybody when the
 * state cannot happen right now (so a refused request changes nothing).
 */
export interface ForceCtx<P extends ForcePerson> {
  people: P[];
  desk(p: P): boolean;
  away(p: P, kind: "errand" | "home"): boolean;
  /** `group[0]` is the person, the others are free people to keep them company */
  meeting(group: P[]): boolean;
  coffee(group: P[]): boolean;
  /** a free WC cabin, no queue: false when both are taken */
  wc(p: P): boolean;
}

/** Group size per group state: the person plus this many others. */
const COMPANY: Record<"meeting" | "break", number> = { meeting: 3, break: 2 };

const free = (p: ForcePerson): boolean =>
  p.inOffice && !p.held && !p.controlled;

/** Sends one person into `state`, once; the normal sim takes over afterwards. Returns the status text, `null` when not possible. */
export function forceState<P extends ForcePerson>(
  ctx: ForceCtx<P>,
  personId: string,
  state: string,
): string | null {
  const p = ctx.people.find((o) => o.id === personId);
  if (!p) return `unbekannt: ${personId}`;
  if (!(FORCE_STATES as readonly string[]).includes(state))
    return `unbekannter Zustand: ${state}`;
  const kind = state as ForceState;
  const label = `${p.member.name.split(" ")[0]}: ${FORCE_LABELS[kind]}`;
  if (!free(p)) return null;
  let ok: boolean;
  switch (kind) {
    case "desk":
      ok = !p.working && ctx.desk(p);
      break;
    case "errand":
    case "home":
      ok = ctx.away(p, kind);
      break;
    case "wc":
      ok = ctx.wc(p);
      break;
    default: {
      const others = ctx.people
        .filter((o) => o !== p && free(o))
        .sort(() => random() - 0.5);
      const group = [p, ...others.slice(0, COMPANY[kind])];
      ok =
        group.length >= 2 &&
        (kind === "meeting" ? ctx.meeting(group) : ctx.coffee(group));
    }
  }
  return ok ? label : null;
}

/** Why `forceState` said no, as text for the dev panel. Person problems first, then what the game refused. */
export function refusalReason(p: ForcePerson, state: ForceState): string {
  if (!p.inOffice) return "nicht im Büro";
  if (p.held || p.controlled) return "beschäftigt";
  switch (state) {
    case "desk":
      return p.working ? "sitzt schon am Platz" : "kein freier Platz";
    case "errand":
      return "gerade im Gespräch";
    case "home":
      return "Homeoffice voll oder im Gespräch";
    case "wc":
      return "beide WC-Kabinen belegt oder im Gespräch";
    case "meeting":
      return "Meetingraum belegt oder zu wenig Leute frei";
    default:
      return "Küche belegt oder zu wenig Leute frei";
  }
}

/** The status line for a refused request: "Marco: Meeting nicht möglich (nicht im Büro)". */
export function refusalText(p: ForcePerson, state: ForceState): string {
  return `${p.member.name.split(" ")[0]}: ${FORCE_LABELS[state]} nicht möglich (${refusalReason(p, state)})`;
}
