/** Frames per second the loop draws at (#212): high-refresh displays would draw twice as often for nothing. */
export const FULL_FPS = 60;
/** with the window visible but not in front: the office lives on slowly */
export const BLUR_FPS = 10;
/** while nothing on screen can change: often enough that a frame never adds more than `MAX_FRAME` */
export const IDLE_FPS = 4;
/** seconds full rate holds after the last input, even if nothing moved */
export const WAKE_TIME = 1.5;

/** What a frame needs to know to say how often the loop should draw. */
export interface FrameState {
  /** game seconds per real second: 0 while paused or the welcome card holds the game */
  timeScale: number;
  /** the camera moved on the last frame drawn (flight, follow, orbit damping, walk) */
  viewMoved: boolean;
  /** a key is held (walk, steer) */
  keysHeld: boolean;
  /** the window has focus */
  focused: boolean;
}

/**
 * Decides which display refreshes the loop draws: at most `FULL_FPS`, `IDLE_FPS` while nothing can change (time
 * stands still, the camera is still, no input), `BLUR_FPS` while the window has no focus. Times are ms on the
 * `requestAnimationFrame` / `performance.now()` clock.
 */
export class FramePacer {
  private last = -Infinity;
  /** the rate the last refresh asked for */
  private fps = FULL_FPS;
  /** when input last came */
  woke = -Infinity;

  /** Input, focus: full rate; out of idle the next refresh draws at once. */
  wake(now: number): void {
    this.woke = now;
    if (this.fps === IDLE_FPS) this.last = -Infinity; // only then: a stream of pointer moves must not draw past the cap
  }

  /** Frames per second the game needs at `now`. */
  rate(now: number, s: FrameState): number {
    const busy = s.timeScale > 0 || s.viewMoved || s.keysHeld || now - this.woke < WAKE_TIME * 1000;
    if (!busy) return IDLE_FPS;
    return s.focused ? FULL_FPS : BLUR_FPS;
  }

  /** Whether the refresh at `now` draws a frame. */
  due(now: number, s: FrameState): boolean {
    this.fps = this.rate(now, s);
    const interval = 1000 / this.fps;
    const elapsed = now - this.last;
    if (elapsed < interval * 0.75) return false; // a quarter early still counts: refreshes jitter, and 90 or 144 Hz don't divide evenly
    // keep the beat (a refresh a little early does not push the next one late), unless the loop fell behind
    this.last = elapsed > 2 * interval ? now : this.last + interval;
    return true;
  }
}
