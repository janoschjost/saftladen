import { describe, expect, it } from 'vitest';
import { allowedView, nextView, startView } from './viewMode';

describe('view.deeplinks', () => {
  it('opens the view of the hash, the default for anything else', () => {
    for (const mode of ['iso', 'orbit', 'plan', 'walk'] as const) expect(startView(`#${mode}`, false)).toEqual({ mode, at: null });
    for (const hash of ['', '#', '#third', '#welcome', '#nonsense']) expect(startView(hash, false).mode).toBe('orbit');
  });

  it('#walk@x,z,yaw stands the walk view there', () => {
    expect(startView('#walk@20,7,1.57', false)).toEqual({ mode: 'walk', at: { x: 20, z: 7, yaw: 1.57 } });
    expect(startView('#walk@20,7', false).at).toMatchObject({ x: 20, z: 7 });
    expect(startView('#walk@20,7', false).at?.yaw).toBeNaN(); // no yaw: the view keeps its own
  });
});

describe('view.walk', () => {
  it('a touch screen gets Orbit instead of the walk view, whatever asks for it', () => {
    expect(allowedView('walk', true)).toBe('orbit');
    expect(startView('#walk', true).mode).toBe('orbit');
    expect(startView('#walk@20,7,1.57', true).mode).toBe('orbit');
    // the other views stay, and a mouse keeps the walk view
    for (const mode of ['iso', 'orbit', 'plan', 'third'] as const) expect(allowedView(mode, true)).toBe(mode);
    expect(allowedView('walk', false)).toBe('walk');
  });
});

describe('hud.phone', () => {
  it('the view button steps through Iso, Orbit and Grundriss, never into the walk view', () => {
    expect(nextView('iso')).toBe('orbit');
    expect(nextView('orbit')).toBe('plan');
    expect(nextView('plan')).toBe('iso');
    expect(nextView('walk')).toBe('iso');
  });
});
