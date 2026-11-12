/** Extra sections of the dev panel (dev server only): each one draws itself into the panel body. */
export type DevSection = (body: HTMLElement, status: HTMLElement) => void;

const sections: DevSection[] = [];

export const registerDevSection = (s: DevSection): void => void sections.push(s);
export const devSections = (): readonly DevSection[] => sections;
