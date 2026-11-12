import { beforeEach, describe, expect, it } from 'vitest';
import { Meeting, MeetingRoom } from './Meeting';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import { setSeed } from './rng';

const nav = {} as NavGrid;
const TV = { x: 3, z: 4 };

/** Just what a meeting reads and writes on its members. */
function member() {
  const m = {
    talk: null as unknown,
    inMeeting: true,
    meetSeated: false,
    meetFocus: null as unknown,
    speaking: false,
    react() {},
    dismissMeeting() {
      m.inMeeting = false;
    },
    cancelMeet() {},
  };
  return m;
}

function setup(screen: 'slides' | 'kart') {
  const room = { tvPos: TV, setClosed() {} } as unknown as MeetingRoom;
  const members = [member(), member(), member()];
  const meeting = new Meeting(members as unknown as Person[], { x: 0, z: 0 }, room, screen);
  for (const m of members) m.talk = meeting;
  // the room's TV, read the way the game reads it
  const tvRoom = Object.create(MeetingRoom.prototype) as MeetingRoom;
  tvRoom.current = meeting;
  return { members, meeting, tvRoom };
}

describe('place.meeting-tv', () => {
  beforeEach(() => setSeed(1));

  it('stays black while people gather, shows the meeting screen once all sit', () => {
    const { members, meeting, tvRoom } = setup('slides');
    meeting.update(0.1, nav);
    expect(tvRoom.tv).toBe('off');
    for (const m of members) m.meetSeated = true;
    meeting.update(0.1, nav);
    expect(meeting.phase).toBe('session');
    expect(tvRoom.tv).toBe('slides');
  });

  it('is black without a meeting', () => {
    const { tvRoom } = setup('slides');
    tvRoom.current = null;
    expect(tvRoom.tv).toBe('off');
  });

  it('kart players turn to the TV, not to each other', () => {
    const { members, meeting, tvRoom } = setup('kart');
    for (const m of members) m.meetSeated = true;
    meeting.update(0.1, nav);
    meeting.update(0.1, nav);
    expect(tvRoom.tv).toBe('kart');
    for (const m of members) expect(m.meetFocus).toEqual(TV);
  });

  it('goes black again when the meeting breaks up', () => {
    const { members, meeting, tvRoom } = setup('slides');
    for (const m of members) m.meetSeated = true;
    meeting.update(0.1, nav);
    members[0].meetSeated = false;
    meeting.update(0.1, nav);
    expect(tvRoom.tv).toBe('off');
    for (const m of members) expect(m.meetFocus).toBeNull();
  });
});
