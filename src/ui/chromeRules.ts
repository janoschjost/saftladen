import type { ViewMode } from '../render/Views';
import { strings } from '../i18n/strings';

/** The pure rules behind the controls: what is visible per camera mode, what Esc closes first, how the palette searches. No DOM in here. */

export type PanelTab = 'people' | 'seats' | 'env' | 'editor' | 'dev';
export const PANEL_TABS: PanelTab[] = ['people', 'seats', 'env', 'editor', 'dev'];

export interface ChromeVisibility {
  /** bottom dock with views, tools, clock and power tools */
  dock: boolean;
  /** the timeline strip may open (via the clock chip) */
  timeline: boolean;
  /** the one side panel may be shown */
  side: boolean;
  /** radial menu around the selected person */
  radial: boolean;
  /** contextual key hints, bottom left */
  hintLine: boolean;
  /** mode name pill, top centre */
  badge: boolean;
  /** title + status chips, top left, and the top-right buttons */
  title: boolean;
  /** editor tool column, left */
  planTools: boolean;
  /** crosshair keys and the way back (walk mode) */
  walk: boolean;
}

const FULL: ChromeVisibility = { dock: true, timeline: true, side: true, radial: true, hintLine: true, badge: true, title: true, planTools: false, walk: false };
const NONE: ChromeVisibility = { dock: false, timeline: false, side: false, radial: false, hintLine: false, badge: false, title: false, planTools: false, walk: false };

/** Which controls show in which camera mode: only what works there. `third` is the day-in-the-life camera. */
export function chromeVisibility(mode: ViewMode): ChromeVisibility {
  switch (mode) {
    case 'iso':
    case 'orbit':
      return FULL;
    case 'plan':
      return { ...FULL, planTools: true };
    case 'walk':
      return { ...NONE, badge: true, walk: true };
    case 'third':
      return { ...NONE, title: true };
  }
}

export type EscLayer = 'palette' | 'selection' | 'timeline' | 'panel' | 'mode';

export interface EscState {
  mode: ViewMode;
  /** palette (or the help card) is open */
  palette: boolean;
  /** somebody is selected, followed or steered */
  selection: boolean;
  timeline: boolean;
  panel: boolean;
}

/** The one layer Esc closes right now: palette, then selection, then timeline, then side panel, then the mode itself (walk / day). */
export function escLayer(s: EscState): EscLayer | null {
  if (s.palette) return 'palette';
  const vis = chromeVisibility(s.mode);
  if (vis.radial && s.selection) return 'selection';
  if (vis.timeline && s.timeline) return 'timeline';
  if (vis.side && s.panel) return 'panel';
  if (s.mode === 'walk' || s.mode === 'third') return 'mode';
  return null;
}

/** Clock position as a share of the 24 h track (0..1) and back. */
export const hourToShare = (hour: number): number => Math.min(1, Math.max(0, hour / 24));
export const shareToHour = (share: number): number => Math.min(1, Math.max(0, share)) * 24;

export interface Searchable {
  group: string;
  label: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** How well `query` matches an entry, 0 = not at all. Label beats group; prefix beats substring beats loose letters. */
export function paletteScore(entry: Searchable, query: string): number {
  const q = norm(query.trim());
  if (!q) return 1;
  const label = norm(entry.label);
  const both = `${label} ${norm(entry.group)}`;
  if (label.startsWith(q)) return 100;
  if (label.split(/[\s·/-]+/).some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 60;
  if (both.includes(q)) return 40;
  const tokens = q.split(/\s+/);
  if (tokens.length > 1 && tokens.every((t) => both.includes(t))) return 30;
  // letters in order from the start of a word, e.g. "mtg" finds "Meeting" (three letters at least, or everything matches)
  if (q.length < 3 || !label.split(/[\s·/-]+/).some((w) => w.startsWith(q[0]))) return 0;
  let at = 0;
  for (const c of q.replace(/\s+/g, '')) {
    at = label.indexOf(c, at) + 1;
    if (!at) return 0;
  }
  return 10;
}

/** Entries that match, best first (ties keep their order). */
export function filterPalette<T extends Searchable>(entries: T[], query: string): T[] {
  return entries
    .map((entry, i) => ({ entry, i, score: paletteScore(entry, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.entry);
}

export interface KeyHint {
  keys: string;
  label: string;
}

/** `⌘K` on Mac, `Strg K` elsewhere. */
export function paletteKey(mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)): string {
  return mac ? '⌘K' : 'Strg K';
}

/** The key hints in the pill bottom left: depend on the mode and on whether somebody is selected. */
export function hintItems(mode: ViewMode, selection: boolean, mac?: boolean): KeyHint[] {
  if (!chromeVisibility(mode).hintLine) return [];
  if (selection) {
    return [
      { keys: 'F', label: 'folgen' },
      { keys: 'C', label: 'steuern' },
      { keys: 'H', label: 'heim' },
      { keys: 'Esc', label: 'abwählen' },
    ];
  }
  return [
    { keys: '1–4', label: 'Ansicht' },
    mode === 'plan' ? { keys: 'E', label: 'Editor' } : { keys: 'N', label: 'Namen' },
    { keys: paletteKey(mac), label: 'Befehle' },
  ];
}

export const modeName = (mode: ViewMode): string => strings.chrome.mode[mode];
