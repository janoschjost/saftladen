const groups = new Map<string, Array<(collapsed: boolean, animate?: boolean) => void>>();

/** Adds a chevron button to a panel title that folds the panel's content away. The state is remembered. */
/** Panels sharing a `group` behave like an accordion: only one is open at a time. */
export function makeCollapsible(root: HTMLElement, title: HTMLElement, key: string, group?: string): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'm-collapse';
  let anim: Animation | null = null;
  const set = (collapsed: boolean, animate = false) => {
    const was = root.classList.contains('is-collapsed');
    const first = root.getBoundingClientRect();
    anim?.cancel();
    root.classList.toggle('is-collapsed', collapsed);
    if (animate && was !== collapsed && !root.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const last = root.getBoundingClientRect();
      // keep the content visible and clipped while the box grows or shrinks
      root.classList.add('is-animating');
      const a = root.animate(
        { height: [`${first.height}px`, `${last.height}px`], width: [`${first.width}px`, `${last.width}px`] },
        { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      anim = a;
      const done = () => {
        if (anim !== a) return;
        anim = null;
        root.classList.remove('is-animating');
      };
      a.onfinish = done;
      a.oncancel = done;
    }
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Aufklappen' : 'Zuklappen');
    try {
      localStorage.setItem(key, collapsed ? '1' : '0');
    } catch {
      /* storage may be unavailable */
    }
  };
  let start = false;
  try {
    start = localStorage.getItem(key) === '1';
  } catch {
    /* ignore */
  }
  btn.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const siblings = group ? (groups.get(group) ?? []) : [];
  if (group) groups.set(group, [...siblings, set]);
  btn.addEventListener('click', () => {
    const collapse = !root.classList.contains('is-collapsed');
    set(collapse, true);
    if (!collapse) groups.get(group ?? '')?.forEach((other) => other !== set && other(true, true));
  });
  title.appendChild(btn);
  // only one panel of a group may start open
  const othersOpen = siblings.length > 0 && document.querySelectorAll(`[data-collapse-group="${group}"]:not(.is-collapsed)`).length > 0;
  root.dataset.collapseGroup = group ?? '';
  set(start || othersOpen);
}
