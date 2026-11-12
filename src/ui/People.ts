/**
 * "Leute": the right-hand dock with the away roster and the live home-office feeds. Always on screen; it shows a short
 * note while everybody is in the office.
 */
export class People {
  private away = document.getElementById('away') as HTMLElement;
  private feeds = document.getElementById('feeds') as HTMLElement;
  private empty = document.getElementById('people-empty') as HTMLElement;

  /** Shows a short note when nobody is away (roster and feeds both empty). */
  sync(): void {
    const none = this.away.hidden && this.feeds.hidden;
    if (this.empty.hidden === none) this.empty.hidden = !none;
  }
}
