import { ICON_BODIES } from './iconSet';

/**
 * The one icon set of the app: Phosphor, regular weight (phosphoricons.com, MIT licence), clean outline icons drawn with
 * currentColor. Every icon in the UI comes from here, by name: in code through `icon()`, in the HTML as
 * `<icon name="settings" size="24" class="…" />` (the Vite plugin in `vite.config.ts` fills it in at build time).
 * A new icon: add it to the map in `scripts/build-icons.mjs` and run the script.
 */
export type IconName = keyof typeof ICON_BODIES;

export const iconNames = Object.keys(ICON_BODIES) as IconName[];

/** The inline SVG of an icon. `size` is in px (the `width`/`height` attributes, as everywhere in the app), `cls` an optional class. */
export function icon(name: IconName, size = 20, cls = ''): string {
  const c = cls ? ` class="${cls}"` : '';
  return `<svg${c} viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${ICON_BODIES[name]}</svg>`;
}
