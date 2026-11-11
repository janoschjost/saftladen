import type { DayTask } from '../game/Day';
import { HideGameboy } from '../game/tasks/HideGameboy';
import { PhoneRush } from '../game/tasks/PhoneRush';
import { SnackHunt } from '../game/tasks/SnackHunt';

/** The tasks of each playable person's day, in order. A person without an entry has no story yet. */
export const DAY_STORIES: Record<string, Array<() => DayTask>> = {
  'jan-hasler': [() => new SnackHunt(), () => new PhoneRush()],
  'jeerapat-wang': [() => new HideGameboy()],
};
