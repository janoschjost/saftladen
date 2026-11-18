import { team } from '../data/team';
import { buildCharacter } from '../render/characterBuilder';
import { petPortrait } from '../render/petPortrait';

/** The two who built the game, as they look in it: their pictures pop out from behind the Credits button. */
const CREW = [
  ['credits-marco', 'marco-rieser'],
  ['credits-janosch', 'janosch-jost'],
] as const;

/** Renders both busts once (a moment after load, so the first hover has them) from the same models as in the office. */
export function initCreditsLink(): void {
  const render = (): void => {
    for (const [elId, memberId] of CREW) {
      const member = team.find((p) => p.id === memberId);
      const img = document.getElementById(elId) as HTMLImageElement | null;
      if (!member || !img) continue;
      const url = petPortrait(memberId, () => ({ root: buildCharacter(member.look).root, face: { r: 0.5, y: 1.4, z: 0.1 } }));
      if (url) img.src = url;
      else img.hidden = true;
    }
  };
  window.setTimeout(render, 500);
}
