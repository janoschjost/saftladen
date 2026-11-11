import shipped from './layout.json';

/** How one piece of furniture differs from where the office model (render/officeModel.ts) puts it. */
export interface ItemOverride {
  /** offset from the model position, metres (game x / z) */
  dx?: number;
  dz?: number;
  /** quarter turns anticlockwise seen from above (0..3) */
  rot?: number;
  /** removed from the room */
  hidden?: boolean;
}

/** item id -> override. Items that are not listed stand where the model puts them. */
export type Layout = Record<string, ItemOverride>;

/**
 * Layout that ships with the app (data/layout.json). Arrange the room in the editor ("Raum" button or E)
 * and press "In Repo speichern" (dev server only) to write it there.
 */
export const DEFAULT_LAYOUT: Layout = shipped;
