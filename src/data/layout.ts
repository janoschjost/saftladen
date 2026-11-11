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
 * Layout that ships with the app. Arrange the room in the editor ("Raum" button or E), press "Export"
 * and paste the JSON here to make it the default for everybody.
 */
export const DEFAULT_LAYOUT: Layout = {};
