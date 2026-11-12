/** Keys are game hotkeys unless the user is typing: text fields, number fields and selects keep their keys. Switches, sliders and buttons do not. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(target.type);
}
