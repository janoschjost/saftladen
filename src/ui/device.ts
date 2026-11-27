/**
 * Phone layout: a narrow screen, or a touch screen held sideways (low, no hover). The same query as `vars.$phone` in
 * the SCSS: the dock starts folded and the controls sit in one bar wherever the styles switch to the phone layout.
 */
export const PHONE = '(max-width: 840px), (hover: none) and (max-height: 600px)';

/** A touch screen (no hover): walk mode and the room editor need a mouse and keys and are not offered there. */
export const TOUCH = '(hover: none)';

export const isPhone = (): boolean => matchMedia(PHONE).matches;
export const isTouch = (): boolean => matchMedia(TOUCH).matches;
