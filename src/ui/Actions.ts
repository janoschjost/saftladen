import { strings } from '../i18n/strings';

const t = strings.presence.command;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface ActionsInfo {
  name: string;
  role: string;
  portrait: string | null;
  status: string;
  /** a person (all four buttons) or a pet (follow only) */
  person: boolean;
  homeFull: boolean;
  steering: boolean;
  following: boolean;
}

/** Card of the selected person in the Leute tab: who they are and the buttons follow, steer, send home, send out. */
export class Actions {
  private root = $('actions');
  private hint = $('people-hint');
  private name = $('actions-name');
  private role = $('actions-role');
  private status = $('actions-status');
  private portrait = $<HTMLImageElement>('actions-portrait');
  private home = $<HTMLButtonElement>('actions-home');
  private out = $<HTMLButtonElement>('actions-out');
  private follow = $<HTMLButtonElement>('actions-follow');
  private steer = $<HTMLButtonElement>('actions-steer');
  private portraitKey = '';

  constructor(onHome: () => void, onOut: () => void, onSteer: () => void, onFollow: () => void) {
    this.follow.addEventListener('click', onFollow);
    this.steer.addEventListener('click', onSteer);
    this.home.textContent = t.home;
    this.out.textContent = t.errand;
    this.home.addEventListener('click', onHome);
    this.out.addEventListener('click', onOut);
  }

  /** `null` hides the card (the tab shows its hint instead). */
  show(info: ActionsInfo | null): void {
    this.root.hidden = !info;
    this.hint.hidden = !!info;
    if (!info) return;
    this.set(this.name, info.name);
    this.set(this.role, info.role);
    this.set(this.status, info.status);
    this.portrait.hidden = !info.portrait;
    if (info.portrait && info.portrait !== this.portraitKey) {
      this.portraitKey = info.portrait;
      this.portrait.src = info.portrait.startsWith('data:') ? info.portrait : import.meta.env.BASE_URL + info.portrait;
    }
    this.follow.setAttribute('aria-pressed', String(info.following));
    this.steer.hidden = this.home.hidden = this.out.hidden = !info.person;
    this.steer.setAttribute('aria-pressed', String(info.steering));
    this.home.disabled = info.homeFull;
    this.home.title = info.homeFull ? t.homeFull : '';
  }

  private set(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }
}
