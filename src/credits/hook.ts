/** What the credits page offers a test: where Clawd is on screen, and how often he was poked. */
export interface CreditsHook {
  clawdScreen(): { x: number; y: number };
  readonly pokes: number;
}

declare global {
  interface Window {
    credits?: CreditsHook;
  }
}
