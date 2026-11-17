import { TOPICS, type Topic } from '../data/chatBlocks';
import { parseVoice, voiceFiles, type Voice } from '../data/voices';
import { setVoice, voiceOf } from '../game/voice';

/** localStorage key of the dev's voice edits: `{ [personId]: Voice }`, until they are pasted into `src/data/voices/<id>.json`. */
export const VOICES_KEY = 'saftladen.voices';

function readEdits(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(VOICES_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeEdits(edits: Record<string, unknown>): void {
  try {
    localStorage.setItem(VOICES_KEY, JSON.stringify(edits));
  } catch {
    /* storage may be unavailable */
  }
}

/** Puts the stored edits over the voice files (dev and e2e builds, at start). */
export function loadVoiceEdits(): void {
  for (const [id, raw] of Object.entries(readEdits())) setVoice(id, parseVoice(raw));
}

/** What the voice editor needs from the game. */
export interface DevVoiceHooks {
  people: ReadonlyArray<{ id: string; name: string }>;
  /** `id` writes a test message about `topic` into the crew chat; returns its text */
  post(id: string, topic: Topic): string;
}

let picked = '';

const field = (label: string, input: HTMLElement): HTMLLabelElement => {
  const l = document.createElement('label');
  l.className = 'm-dev-voice__field';
  const span = document.createElement('span');
  span.textContent = label;
  l.append(span, input);
  return l;
};

const select = (name: string, options: readonly string[]): HTMLSelectElement => {
  const s = document.createElement('select');
  s.className = 'm-dev__select';
  s.name = name;
  for (const o of options) s.add(new Option(o, o));
  return s;
};

const number = (name: string): HTMLInputElement => {
  const i = document.createElement('input');
  i.className = 'm-dev-voice__input';
  i.type = 'number';
  i.name = name;
  i.min = '0';
  i.max = '1';
  i.step = '0.05';
  return i;
};

/**
 * Dev panel section "Stimmen" (#195): pick a person, edit their chat style, signature words and own lines; every change
 * takes effect at once and is kept in localStorage (`saftladen.voices`). "Testnachricht" posts a line in the crew chat,
 * "JSON exportieren" puts the voice file to paste into `src/data/voices/<id>.json` into the box (and the clipboard).
 */
export const voiceSection = (hooks: DevVoiceHooks) => (root: HTMLElement, status: HTMLElement): void => {
  picked ||= hooks.people[0]?.id ?? '';
  const h = document.createElement('h3');
  h.className = 'm-dev__group';
  h.textContent = 'Stimmen (Chat)';
  const form = document.createElement('form');
  form.className = 'm-dev-voice';
  form.dataset.section = 'voice';
  form.addEventListener('submit', (e) => e.preventDefault());

  const person = select('person', []);
  for (const p of hooks.people) person.add(new Option(p.name, p.id));
  const kase = select('case', ['normal', 'lower']);
  const punctuation = select('punctuation', ['normal', 'none', 'many']);
  const length = select('length', ['short', 'normal', 'long']);
  const emoji = number('emoji');
  const typo = number('typo');
  const signature = document.createElement('input');
  signature.className = 'm-dev-voice__input';
  signature.name = 'signature';
  signature.placeholder = 'jo, Gopf, ✨';
  const lines = document.createElement('textarea');
  lines.className = 'm-dev-voice__input m-dev-voice__lines';
  lines.name = 'lines';
  lines.rows = 6;
  lines.spellcheck = false;
  const topic = select('topic', TOPICS);
  const out = document.createElement('textarea');
  out.className = 'm-dev-voice__input m-dev-voice__lines';
  out.name = 'export';
  out.rows = 4;
  out.readOnly = true;
  out.hidden = true;

  const fill = () => {
    const v = voiceOf(picked);
    person.value = picked;
    kase.value = v.style.case;
    punctuation.value = v.style.punctuation;
    length.value = v.style.length;
    emoji.value = String(v.style.emoji);
    typo.value = String(v.style.typo);
    signature.value = v.signature.join(', ');
    lines.value = JSON.stringify(v.lines, null, 1);
    lines.setCustomValidity('');
    out.hidden = true;
  };
  const fileOf = (v: Voice) => JSON.stringify({ style: v.style, signature: v.signature, lines: v.lines }, null, 2);
  const save = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines.value || '{}');
      lines.setCustomValidity('');
    } catch {
      lines.setCustomValidity('kein gültiges JSON');
      status.textContent = 'Zeilen: kein gültiges JSON';
      return;
    }
    const voice = parseVoice({
      style: { case: kase.value, punctuation: punctuation.value, length: length.value, emoji: Number(emoji.value), typo: Number(typo.value) },
      signature: signature.value.split(',').map((s) => s.trim()),
      lines: parsed,
    });
    setVoice(picked, voice);
    writeEdits({ ...readEdits(), [picked]: voice });
    status.textContent = `Stimme von ${person.selectedOptions[0]?.text ?? picked} gespeichert (nur lokal)`;
  };

  person.addEventListener('change', () => {
    picked = person.value;
    fill();
  });
  for (const input of [kase, punctuation, length, emoji, typo, signature, lines]) input.addEventListener('change', save);

  const buttons = document.createElement('div');
  buttons.className = 'm-dev__buttons';
  const button = (label: string, name: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'm-button';
    b.name = name;
    b.textContent = label;
    b.addEventListener('click', run);
    buttons.append(b);
  };
  button('Testnachricht', 'send', () => {
    status.textContent = `Chat: ${hooks.post(picked, topic.value as Topic)}`;
  });
  button('JSON exportieren', 'export', () => {
    out.value = fileOf(voiceOf(picked));
    out.hidden = false;
    out.select();
    void navigator.clipboard?.writeText(out.value).catch(() => {});
    status.textContent = `JSON für src/data/voices/${picked}.json`;
  });
  button('Zurücksetzen', 'reset', () => {
    setVoice(picked, null);
    const edits = readEdits();
    delete edits[picked];
    writeEdits(edits);
    fill();
    status.textContent = voiceFiles[picked] ? 'Stimme aus der Datei' : 'Standardstimme';
  });

  form.append(
    field('Person', person),
    field('Schreibweise', kase),
    field('Satzzeichen', punctuation),
    field('Länge', length),
    field('Emoji-Anteil', emoji),
    field('Tippfehler-Anteil', typo),
    field('Signatur', signature),
    field('Eigene Zeilen (JSON pro Thema)', lines),
    field('Thema', topic),
    buttons,
    out,
  );
  fill();
  root.append(h, form);
};
