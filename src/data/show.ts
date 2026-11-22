import type { CameraKey, Cue, Film, Group } from '../game/Show';

/**
 * The Christmas film (`/?show`, key `P`): one uncut camera flight through the office. Script and ideas:
 * `docs/show-script.md`. Everything the subtitles say lives here, so the lines can be changed without touching code.
 *
 * How it works: at 0:27 everybody is put in place at once (`WAITING`, each group where its event is about to happen),
 * and the camera visits them one after the other; an event runs a few seconds before the camera gets there, so people
 * are already on their way. Several things happen at the same time, the camera chooses what you see. Between two stops
 * the camera never cuts: one smooth curve passes every key of `CAMERA`.
 *
 * Shots: `action` borrows the place, angle and zoom of an Aktionen card (`src/data/actions.ts`); `at` is a floor point
 * (x, z in metres, the office is about 41 x 17); `angle` 0 looks from the front (the door side), 90 from the east.
 * `tilt` 0 looks straight down, 60 almost level.
 */

const DAWN = ['jeannine-zurcher', 'oriana-pontieri', 'samuel-guttinger'];
const HOME = ['marco-hefti', 'zlatko-pesic', 'donata-manser', 'marco-rieser', 'janosch-jost', 'devin-frei'];

/** who waits where, until the event of their group runs: the people of a group stand round its point */
export const WAITING: Group[] = [
  { who: ['teresa-sutter', 'linda-peter'], at: [25.5, 4.5] },
  { who: ['celine-buhler'], at: [29, 4.5] },
  { who: ['rene-kappeler', 'jan-hasler', 'nina-bauer', 'andrea-eichmann', 'michael-eberle'], at: [30, 9] },
  { who: ['martin-fuchs', 'dominic-rechsteiner', 'jacqueline-graf'], at: [27, 10.5] },
  { who: ['andrew-jelley', 'milica-rakic'], at: [21, 8] },
  { who: ['sandro-hagen', 'philip-gygax'], at: [24, 9] },
  { who: ['elia-vogt', 'julia-renz', 'eliana-lipari'], at: [19, 8] },
  { who: ['alessandro-romeo', 'oscar-grob'], at: [10, 11] },
  { who: ['nina-vetsch', 'ramon-lenherr', 'fabian-bucher'], at: [9, 12.5] },
  { who: ['larissa-lanker', 'marianne-hofstetter'], at: [8, 10.5] },
  { who: ['jannik-stibi', 'delya-kohler', 'jeerapat-wang'], at: [8, 13] },
  { who: ['alyosha-krajnc'], at: [9, 14] },
];

/** a stop of the camera: it is at `shot` from `t` until `until`, with a slow drift (`drift` degrees round the target) so it is never still */
const stop = (t: number, until: number, shot: CameraKey['shot'], drift = 8): CameraKey[] => [
  { t, shot },
  { t: until, shot: { ...shot, angle: (shot.angle ?? 0) + drift } },
];

const night = (shot: CameraKey['shot']) => ({ tilt: 50, ...shot });

export const SHOW_CAMERA: CameraKey[] = [
  // the empty office at night, then the first light at the front door
  { t: 0, shot: night({ overview: true, angle: -28, zoom: 1.1, tilt: 52 }) },
  { t: 10, shot: night({ overview: true, angle: -6, zoom: 1.7 }) },
  { t: 16, shot: night({ action: 'coffee', zoom: 2.4, tilt: 48 }) },
  { t: 21, shot: night({ action: 'foosball', zoom: 2.4, tilt: 48 }) },
  ...stop(27, 34, { at: [8, 15.5], angle: 24, zoom: 2.6, tilt: 54 }, -10),
  { t: 38, shot: { at: [12, 9], angle: 12, zoom: 2, tilt: 48 } },
  ...stop(43, 51, { action: 'coffee', tilt: 24, angle: 6 }),
  ...stop(54, 62, { action: 'printer' }),
  ...stop(65, 72, { action: 'photo-shoot' }),
  ...stop(76, 94, { action: 'meeting' }, 14),
  ...stop(98, 104, { action: 'nerf' }),
  ...stop(108, 114, { action: 'boombox', zoom: 2.2 }),
  ...stop(118, 130, { action: 'bonfire', zoom: 2.2 }, 12),
  ...stop(135, 143, { action: 'foosball' }),
  ...stop(148, 156, { at: [9, 11.5], zoom: 2.6, angle: 12, tilt: 38 }),
  ...stop(160, 166, { action: 'pod' }),
  ...stop(170, 178, { action: 'smoke' }),
  ...stop(182, 194, { action: 'mail-letter' }),
  // the home offices: the camera climbs and waits above the roofless office while the dock tells who works from where
  { t: 204, shot: { overview: true, angle: -10, zoom: 1.2, tilt: 46 } },
  { t: 250, shot: { overview: true, angle: 8, zoom: 1.35, tilt: 44 } },
  // the finale: all round the lounge, slowly up and away
  { t: 276, shot: { overview: true, angle: 26, zoom: 1.5, tilt: 40 } },
  { t: 296, shot: { overview: true, angle: 40, zoom: 1.1, tilt: 34 } },
];

const NERF_AND_FRIENDS = ['andrew-jelley', 'milica-rakic'];

const cues: Cue[] = [
  // 0:00 the empty night office
  { t: 0, stage: { hour: 4.6, outside: DAWN } },
  { t: 0, sky: [4.6, 8.2], over: 32 },
  { t: 0, mark: 'night' },
  { t: 1, say: 'Es ist Dezember. Das Büro schläft.' },
  { t: 8, say: 'Draussen schneit es. Drinnen blinkt nur die Lichterkette.' },
  { t: 16.5, say: 'Die Kaffeemaschine ist kalt.' },
  { t: 21.5, say: 'Der Kicker wartet.' },
  { t: 22, title: 'Saftladen', sub: 'Ein Weihnachtsfilm', hold: 5 },

  // 0:27 the first light; while the camera watches the door, everybody else takes their place
  { t: 27, mark: 'dawn' },
  { t: 27.5, stage: { outside: DAWN, groups: WAITING, home: HOME } },
  { t: 29, arrive: DAWN, gap: 2.2 },
  { t: 30, say: 'Um sieben ist die Welt noch in Ordnung.', who: DAWN },
  { t: 33, sky: [8.2, 16.6], over: 200 },

  // the early birds get their coffee first
  { t: 39, mark: 'coffee' },
  { t: 39, event: 'coffee', cast: DAWN },
  { t: 42, say: 'Ohne Kaffee kein Konzept.', who: DAWN },

  { t: 50, mark: 'printer' },
  { t: 50, event: 'printer', cast: ['teresa-sutter', 'linda-peter'] },
  { t: 53, say: 'Der Drucker weiss, wer es eilig hat.', who: ['teresa-sutter', 'linda-peter'] },

  { t: 62, mark: 'photo' },
  { t: 62, event: 'photo-shoot', cast: ['celine-buhler'] },
  { t: 65, say: 'Fotoshooting. Heute: die Flasche.', who: ['celine-buhler'] },

  { t: 72, mark: 'meeting' },
  { t: 72, event: 'meeting-room', cast: ['rene-kappeler', 'jan-hasler', 'nina-bauer', 'andrea-eichmann', 'michael-eberle'] },
  { t: 76, say: 'Das Meeting. Es hätte eine Mail sein können.', who: ['rene-kappeler', 'jan-hasler', 'nina-bauer', 'andrea-eichmann', 'michael-eberle'] },
  { t: 84, event: 'meeting-kart', cast: ['martin-fuchs', 'dominic-rechsteiner', 'jacqueline-graf'] },
  { t: 86, say: 'Mittags wird gerast. Blaue Panzer kennen keine Hierarchie.', who: ['martin-fuchs', 'dominic-rechsteiner', 'jacqueline-graf'] },

  { t: 95, mark: 'nerf' },
  { t: 95, event: 'nerf', cast: [...NERF_AND_FRIENDS, 'marco-rieser'] },
  { t: 98, say: 'Webdevelopment: eine Nerf-Gun pro Kopf.', who: ['andrew-jelley'] },
  { t: 101, say: 'Das Opfer wird nicht gefragt.', who: ['milica-rakic'] },

  { t: 105, mark: 'boombox' },
  { t: 105, event: 'boombox', cast: ['sandro-hagen', 'philip-gygax'] },
  { t: 108, say: 'Sandro packt die Boombox aus. Alle wissen, was jetzt kommt.', who: ['sandro-hagen', 'philip-gygax'] },

  { t: 115, mark: 'bonfire' },
  { t: 115, event: 'bonfire', cast: ['elia-vogt', 'julia-renz', 'eliana-lipari'] },
  { t: 118, say: 'Elia baut ein Lagerfeuer. Im Büro. Natürlich.', who: ['elia-vogt'] },
  { t: 124, say: 'Und irgendwer holt den Feuerlöscher.', who: ['julia-renz', 'eliana-lipari'] },

  { t: 132, mark: 'kicker' },
  { t: 132, event: 'foosball', cast: ['alessandro-romeo', 'oscar-grob'] },
  { t: 135, say: 'Kicker-Duell. Der Verlierer bringt die Guetzli mit.', who: ['alessandro-romeo', 'oscar-grob'] },

  { t: 145, mark: 'dogs' },
  { t: 145, event: 'pet-dog', cast: ['nina-vetsch', 'ramon-lenherr', 'fabian-bucher'] },
  { t: 148, say: 'Das eigentliche Team: Thala, Mira und Harry.', who: ['nina-vetsch', 'ramon-lenherr', 'fabian-bucher'] },

  { t: 157, mark: 'pod' },
  { t: 157, event: 'pod', cast: ['larissa-lanker', 'marianne-hofstetter'] },
  { t: 160, say: 'Zwei im Holzhaus. Kein Meeting. Nur Ruhe.', who: ['larissa-lanker', 'marianne-hofstetter'] },

  { t: 166, mark: 'smoke' },
  { t: 166, event: 'smoke-jannik-stibi', cast: ['jannik-stibi'], free: true },
  { t: 167, event: 'smoke-delya-kohler', cast: ['delya-kohler'], free: true },
  { t: 168, event: 'smoke-jeerapat-wang', cast: ['jeerapat-wang'], free: true },
  { t: 170, say: 'Die Raucherecke. Im Schnee.', who: ['jannik-stibi', 'delya-kohler', 'jeerapat-wang'] },

  { t: 178, mark: 'mail' },
  { t: 178, event: 'mail-letter', cast: ['alyosha-krajnc'], free: true },
  { t: 181, say: 'Eine Taube bringt die Post.', who: ['alyosha-krajnc'] },
  { t: 188, event: 'mail-parcel', cast: ['alyosha-krajnc'], free: true },
  { t: 190, say: 'Und eine Drohne das Paket.' },

  // the home offices: the dock opens, one feed after the other is the big one
  { t: 200, mark: 'homes' },
  { t: 200, title: 'Und dann gibt es die, die von zuhause arbeiten', hold: 4 },
  { t: 204, feed: 'marco-hefti' },
  { t: 205, say: 'Marco Hefti. Offiziell im Homeoffice. Inoffiziell in Thailand.', who: ['marco-hefti'] },
  { t: 212, feed: 'zlatko-pesic' },
  { t: 213, say: 'Zlatko arbeitet remote. Sein Sohn leitet die Qualitätskontrolle.', who: ['zlatko-pesic'] },
  { t: 213, event: 'remote-son' },
  { t: 220, feed: 'donata-manser' },
  { t: 221, say: 'Angus und Binx übernehmen den Catwalk.', who: ['donata-manser'] },
  { t: 228, feed: 'marco-rieser' },
  { t: 229, say: 'Und Marco Rieser? Der wird nach Feierabend zu Kurt.', who: ['marco-rieser'] },
  { t: 228.5, event: 'kurt-home' },
  { t: 236, feed: 'janosch-jost' },
  { t: 237, say: 'Janosch trinkt keinen Kaffee. Wir verzeihen ihm.', who: ['janosch-jost'] },
  { t: 244, feed: 'devin-frei' },
  { t: 245, say: 'Devin hat das Homeoffice ernst genommen.', who: ['devin-frei'] },
  { t: 252, feed: null },

  // the finale: evening, everybody still in the office goes home, Kurt takes over
  { t: 254, mark: 'finale' },
  { t: 254, sky: [16.6, 18.8], over: 44 },
  { t: 255, say: 'Feierabend. Kurt übernimmt.', who: ['marco-rieser'] },
  { t: 256, event: 'kurt-walkout' },
  { t: 262, say: 'Danke fürs Durchhalten.', who: ['andrea-eichmann', 'jeannine-zurcher', 'samuel-guttinger', 'jannik-stibi', 'sandro-hagen', 'philip-gygax'] },
  { t: 266, say: 'Danke fürs Mitdenken.', who: ['oriana-pontieri', 'martin-fuchs', 'elia-vogt', 'celine-buhler', 'devin-frei', 'alessandro-romeo'] },
  { t: 270, say: 'Danke fürs Lachen.', who: ['jeerapat-wang', 'alyosha-krajnc', 'oscar-grob', 'andrew-jelley', 'larissa-lanker', 'nina-vetsch'] },
  { t: 274, say: 'Danke für jeden Kaffee.', who: ['michael-eberle', 'ramon-lenherr', 'dominic-rechsteiner', 'milica-rakic', 'rene-kappeler', 'delya-kohler'] },
  { t: 278, say: 'Danke für die Ideen.', who: ['teresa-sutter', 'jan-hasler', 'linda-peter', 'jacqueline-graf', 'marianne-hofstetter', 'nina-bauer'] },
  { t: 282, say: 'Danke für dieses Jahr.', who: ['julia-renz', 'zlatko-pesic', 'marco-hefti', 'donata-manser', 'janosch-jost', 'fabian-bucher', 'eliana-lipari'] },
  { t: 287, title: 'Frohe Weihnachten', sub: 'Euer Saftladen', hold: 8 },
];

export const SHOW_FILM: Film = { length: 298, camera: SHOW_CAMERA, cues };
