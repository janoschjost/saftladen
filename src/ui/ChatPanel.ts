import type { ChatMessage } from '../game/CrewChat';
import { DAY_NAMES } from './TimeControl';

/** Who can write: what the panel shows of them. */
export interface ChatMember {
  id: string;
  name: string;
  portrait: string | null;
}

/** messages kept in the list */
const SHOWN = 120;
/** two messages of one writer this close (game seconds) form one block: name and time only once */
const BLOCK = 90;
const PHONE = '(max-width: 840px)';

/**
 * The crew chat panel (#195), bottom left above the key hints: one read-only group space "Crew-Chat" in the look of a
 * team messenger (round portraits, bold name, grey time, day divider). The launcher button or `C` toggles it; while
 * closed the launcher counts the unread messages. Open by default on desktop, closed on a phone (a bottom sheet there);
 * once toggled the choice is kept (`saftladen.settings`).
 */
export class ChatPanel {
  private root = document.getElementById('chat') as HTMLElement;
  private list = document.getElementById('chat-list') as HTMLOListElement;
  private launcher = document.getElementById('open-chat') as HTMLButtonElement;
  private badge = document.getElementById('chat-badge') as HTMLElement;
  private last: ChatMessage | null = null;
  private unread = 0;

  constructor(
    private members: ReadonlyMap<string, ChatMember>,
    open: boolean | undefined,
    private onToggle: (open: boolean) => void,
  ) {
    (document.getElementById('chat-members') as HTMLElement).textContent = `${members.size} Mitglieder`;
    this.launcher.addEventListener('click', () => this.toggle());
    document.getElementById('chat-close')!.addEventListener('click', () => this.toggle());
    this.show(open ?? !window.matchMedia(PHONE).matches);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Opens or closes it and remembers the choice. */
  toggle(): void {
    this.show(!this.isOpen);
    this.onToggle(this.isOpen);
  }

  /** A new message: at the bottom of the list (scrolled into view if the reader was at the bottom), else counted as unread. */
  add(m: ChatMessage): void {
    const member = this.members.get(m.by);
    if (!member) return;
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;
    if (!this.last || this.last.weekday !== m.weekday) {
      this.list.append(this.dayDivider(m.weekday));
    }
    const sameBlock = this.last?.by === m.by && this.last.weekday === m.weekday && m.at - this.last.at < BLOCK;
    const li = document.createElement('li');
    li.className = sameBlock ? 'm-chat__message m-chat__message--more' : 'm-chat__message';
    li.dataset.by = m.by;
    li.dataset.weekday = String(m.weekday);
    if (!sameBlock) {
      li.append(avatar(member));
      const head = document.createElement('p');
      head.className = 'm-chat__meta';
      const name = document.createElement('strong');
      name.className = 'm-chat__name';
      name.textContent = member.name;
      const time = document.createElement('time');
      time.className = 'm-chat__time';
      time.textContent = m.time;
      head.append(name, time);
      li.append(head);
    }
    const text = document.createElement('p');
    text.className = 'm-chat__text';
    text.textContent = m.text;
    li.append(text);
    this.list.append(li);
    this.trim();
    this.last = m;
    if (this.isOpen) {
      if (atBottom) this.list.scrollTop = this.list.scrollHeight;
    } else {
      this.setUnread(this.unread + 1);
    }
  }

  /** Drops the oldest entries past `SHOWN`; the top stays a day divider followed by a message with its writer. */
  private trim(): void {
    if (this.list.children.length <= SHOWN) return;
    while (this.list.children.length > SHOWN) this.list.firstElementChild!.remove();
    const top = () => this.list.firstElementChild as HTMLElement | null;
    while (top()?.classList.contains('m-chat__message--more') || (top()?.classList.contains('m-chat__day') && top()?.nextElementSibling?.classList.contains('m-chat__day'))) top()!.remove();
    if (top() && !top()!.classList.contains('m-chat__day')) this.list.prepend(this.dayDivider(Number(top()!.dataset.weekday)));
  }

  private dayDivider(weekday: number): HTMLLIElement {
    const day = document.createElement('li');
    day.className = 'm-chat__day';
    day.textContent = DAY_NAMES[weekday] ?? '';
    return day;
  }

  private show(open: boolean): void {
    this.root.hidden = !open;
    this.launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      this.setUnread(0);
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  private setUnread(n: number): void {
    this.unread = n;
    this.badge.hidden = n === 0;
    this.badge.textContent = n > 99 ? '99+' : String(n);
    this.launcher.setAttribute('aria-label', n ? `Chat, ${n} ungelesen` : 'Chat');
  }
}

function avatar(m: ChatMember): HTMLElement {
  if (m.portrait) {
    const img = document.createElement('img');
    img.className = 'm-chat__avatar';
    img.src = m.portrait;
    img.alt = '';
    img.width = 32;
    img.height = 32;
    img.loading = 'lazy';
    return img;
  }
  const span = document.createElement('span');
  span.className = 'm-chat__avatar';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = m.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return span;
}
