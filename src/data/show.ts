import type { Scene } from '../game/Show';

/**
 * The Christmas film (`/?show`, key `P`), scene by scene. Script and ideas: `docs/show-script.md`. Everything the
 * subtitles say lives here, so the lines can be changed without touching code. A scene is self-contained (who is where,
 * the hour, the first shot), so `?show=<scene id>` starts anywhere and `←` / `→` jump between scenes.
 *
 * Shots: `action` borrows the place, angle and zoom of an Aktionen card (`src/data/actions.ts`); `at` is a floor point
 * (x, z in metres, the office is about 41 x 17); `angle` 0 looks from the front (the door side), 90 from the east.
 * `tilt` 0 looks straight down, 60 almost level. Every office scene sits at 10:30, the sky of the scene decides the light.
 */

/** every office scene: the camera is set before the first frame, then the event and the lines come */
const office = (scene: Omit<Scene, 'hour'> & { hour?: number }): Scene => ({ hour: 10.5, ...scene });

export const SHOW_SCENES: Scene[] = [
  {
    id: 'night',
    length: 26,
    hour: 22,
    cues: [
      { t: 0, shot: { overview: true, angle: -28, zoom: 1.1, tilt: 52 } },
      { t: 0, shot: { overview: true, angle: -6, zoom: 1.7, tilt: 50 }, over: 20, ease: 'linear' },
      { t: 1, say: 'Es ist Dezember. Das Büro schläft.' },
      { t: 8, say: 'Draussen schneit es. Drinnen blinkt nur die Lichterkette.' },
      { t: 15, shot: { action: 'coffee', zoom: 2.4, tilt: 48 }, over: 5 },
      { t: 15.5, say: 'Die Kaffeemaschine ist kalt.' },
      { t: 20, shot: { action: 'foosball', zoom: 2.4, tilt: 48 }, over: 5 },
      { t: 20.5, say: 'Der Kicker wartet.' },
      { t: 21, title: 'Saftladen', sub: 'Ein Weihnachtsfilm', hold: 5 },
    ],
  },
  {
    id: 'dawn',
    length: 15,
    hour: 6.4,
    outside: ['jeannine-zurcher', 'oriana-pontieri', 'samuel-guttinger'],
    cues: [
      { t: 0, shot: { at: [8, 15.5], angle: 24, zoom: 2.4, tilt: 52 } },
      { t: 0, sky: 8.4, over: 14 },
      { t: 2, arrive: ['jeannine-zurcher', 'oriana-pontieri', 'samuel-guttinger'], gap: 2.2 },
      { t: 3, say: 'Um sieben ist die Welt noch in Ordnung.', who: ['jeannine-zurcher', 'oriana-pontieri', 'samuel-guttinger'] },
      { t: 8, shot: { at: [10, 11], angle: 14, zoom: 2, tilt: 50 }, over: 6 },
    ],
  },
  office({
    id: 'coffee',
    length: 9,
    hour: 8.8,
    near: [15, 5],
    present: ['andrea-eichmann', 'michael-eberle', 'devin-frei'],
    cues: [
      { t: 0, shot: { action: 'coffee', tilt: 22, angle: 6 } },
      { t: 0.3, event: 'coffee' },
      { t: 1, say: 'Ohne Kaffee kein Konzept.', who: ['andrea-eichmann', 'michael-eberle', 'devin-frei'] },
    ],
  }),
  office({
    id: 'printer',
    length: 8,
    hour: 9.3,
    near: [25.5, 4.5],
    present: ['teresa-sutter', 'linda-peter'],
    cues: [
      { t: 0, shot: { action: 'printer' } },
      { t: 0.3, event: 'printer' },
      { t: 1, say: 'Der Drucker weiss, wer es eilig hat.', who: ['teresa-sutter', 'linda-peter'] },
    ],
  }),
  office({
    id: 'dogs',
    length: 10,
    hour: 9.8,
    near: [9, 12],
    present: ['nina-vetsch', 'janosch-jost', 'ramon-lenherr', 'fabian-bucher'],
    cues: [
      { t: 0, shot: { at: [9, 11.5], zoom: 2.6, angle: 12, tilt: 38 } },
      { t: 0.5, event: 'pet-dog' },
      { t: 1, say: 'Das eigentliche Team: Thala, Mira, Ellie und Harry.', who: ['nina-vetsch', 'janosch-jost'] },
    ],
  }),
  office({
    id: 'meeting',
    length: 10,
    hour: 10.5,
    near: [30, 9],
    present: ['fabian-bucher', 'ramon-lenherr', 'rene-kappeler', 'jan-hasler', 'nina-bauer'],
    cues: [
      { t: 0, shot: { action: 'meeting' } },
      { t: 0.3, event: 'meeting-room' },
      { t: 1.5, say: 'Das Meeting. Es hätte eine Mail sein können.', who: ['fabian-bucher', 'ramon-lenherr', 'rene-kappeler', 'jan-hasler', 'nina-bauer'] },
    ],
  }),
  office({
    id: 'kart',
    length: 9,
    hour: 12.3,
    near: [30, 9],
    present: ['martin-fuchs', 'dominic-rechsteiner', 'jacqueline-graf'],
    cues: [
      { t: 0, shot: { action: 'kart' } },
      { t: 0.3, event: 'meeting-kart' },
      { t: 1.5, say: 'Mittags wird gerast. Blaue Panzer kennen keine Hierarchie.', who: ['martin-fuchs', 'dominic-rechsteiner', 'jacqueline-graf'] },
    ],
  }),
  office({
    id: 'kicker',
    length: 9,
    hour: 13.2,
    near: [10, 11],
    present: ['alessandro-romeo', 'philip-gygax'],
    cues: [
      { t: 0, shot: { action: 'foosball' } },
      { t: 0.3, event: 'foosball' },
      { t: 1, say: 'Kicker-Duell. Der Verlierer bringt die Guetzli mit.', who: ['alessandro-romeo', 'philip-gygax'] },
    ],
  }),
  office({
    id: 'smoke',
    length: 10,
    hour: 13.8,
    near: [8, 13],
    loose: true,
    present: ['jannik-stibi', 'delya-kohler', 'jeerapat-wang'],
    cues: [
      { t: 0, shot: { action: 'smoke' } },
      { t: 0.3, event: 'smoke-jannik-stibi' },
      { t: 1.5, event: 'smoke-delya-kohler' },
      { t: 2.5, event: 'smoke-jeerapat-wang' },
      { t: 3, say: 'Die Raucherecke. Im Schnee.', who: ['jannik-stibi', 'delya-kohler', 'jeerapat-wang'] },
    ],
  }),
  office({
    id: 'mail',
    length: 11,
    hour: 14.2,
    near: [8, 13],
    loose: true,
    present: ['oscar-grob', 'alyosha-krajnc'],
    cues: [
      { t: 0, shot: { action: 'mail-letter' } },
      { t: 0.3, event: 'mail-letter' },
      { t: 1, say: 'Eine Taube bringt die Post.', who: ['oscar-grob', 'alyosha-krajnc'] },
      { t: 6, event: 'mail-parcel' },
      { t: 6.5, say: 'Und eine Drohne das Paket.' },
    ],
  }),
  office({
    id: 'photo',
    length: 8,
    hour: 14.6,
    near: [29, 4.5],
    present: ['celine-buhler'],
    cues: [
      { t: 0, shot: { action: 'photo-shoot' } },
      { t: 0.3, event: 'photo-shoot' },
      { t: 1, say: 'Fotoshooting. Heute: die Flasche.', who: ['celine-buhler'] },
    ],
  }),
  office({
    id: 'nerf',
    length: 10,
    hour: 15.2,
    near: [21, 8],
    present: ['marco-rieser', 'andrew-jelley', 'milica-rakic'],
    cues: [
      { t: 0, shot: { action: 'nerf' } },
      { t: 0.3, event: 'nerf' },
      { t: 1, say: 'Webdevelopment: eine Nerf-Gun pro Kopf.', who: ['marco-rieser', 'andrew-jelley'] },
      { t: 5.5, say: 'Das Opfer wird nicht gefragt.', who: ['milica-rakic'] },
    ],
  }),
  office({
    id: 'pod',
    length: 8,
    hour: 15.8,
    near: [8, 10.5],
    present: ['larissa-lanker', 'marianne-hofstetter'],
    cues: [
      { t: 0, shot: { action: 'pod' } },
      { t: 0.3, event: 'pod' },
      { t: 1, say: 'Zwei im Holzhaus. Kein Meeting. Nur Ruhe.', who: ['larissa-lanker', 'marianne-hofstetter'] },
    ],
  }),
  office({
    id: 'boombox',
    length: 11,
    hour: 16.3,
    near: [24, 9],
    present: ['sandro-hagen', 'donata-manser'],
    cues: [
      { t: 0, shot: { action: 'boombox' } },
      { t: 0.3, event: 'boombox' },
      { t: 1, say: 'Sandro packt die Boombox aus. Donata weiss, was jetzt kommt.', who: ['sandro-hagen', 'donata-manser'] },
    ],
  }),
  office({
    id: 'bonfire',
    length: 18,
    hour: 16.9,
    near: [19, 8],
    present: ['elia-vogt', 'julia-renz', 'eliana-lipari'],
    cues: [
      { t: 0, shot: { action: 'bonfire' } },
      { t: 0.3, event: 'bonfire' },
      { t: 1, say: 'Elia baut ein Lagerfeuer. Im Büro. Natürlich.', who: ['elia-vogt'] },
      { t: 9, say: 'Und irgendwer holt den Feuerlöscher.', who: ['julia-renz', 'eliana-lipari'] },
    ],
  }),
  {
    id: 'homes',
    length: 52,
    hour: 11,
    home: ['marco-hefti', 'zlatko-pesic', 'donata-manser', 'devin-frei', 'marco-rieser', 'janosch-jost'],
    cues: [
      { t: 0, title: 'Und dann gibt es die, die von zuhause arbeiten', hold: 3.5 },
      { t: 3.5, feed: 'marco-hefti' },
      { t: 4, say: 'Marco Hefti. Offiziell im Homeoffice. Inoffiziell in Thailand.', who: ['marco-hefti'] },
      { t: 12, feed: 'zlatko-pesic' },
      { t: 12.5, say: 'Zlatko arbeitet remote. Sein Sohn leitet die Qualitätskontrolle.', who: ['zlatko-pesic'] },
      { t: 13, event: 'remote-son' },
      { t: 21, feed: 'donata-manser' },
      { t: 21.5, say: 'Angus und Binx übernehmen den Catwalk.', who: ['donata-manser'] },
      { t: 29, feed: 'marco-rieser' },
      { t: 29.5, say: 'Und Marco Rieser? Der wird nach Feierabend zu Kurt.', who: ['marco-rieser'] },
      { t: 29.2, event: 'kurt-home' },
      { t: 37, feed: 'janosch-jost' },
      { t: 37.5, say: 'Janosch trinkt keinen Kaffee. Wir verzeihen ihm.', who: ['janosch-jost'] },
      { t: 45, feed: 'devin-frei' },
      { t: 45.5, say: 'Devin hat das Homeoffice ernst genommen.', who: ['devin-frei'] },
    ],
  },
  {
    id: 'finale',
    length: 36,
    hour: 17.2,
    present: [
      'marco-rieser', 'andrea-eichmann', 'jeannine-zurcher', 'samuel-guttinger', 'jannik-stibi', 'sandro-hagen', 'philip-gygax', 'oriana-pontieri',
      'martin-fuchs', 'elia-vogt', 'celine-buhler', 'devin-frei', 'alessandro-romeo', 'jeerapat-wang', 'alyosha-krajnc',
    ],
    cues: [
      { t: 0, shot: { overview: true, angle: -20, zoom: 1.3, tilt: 50 } },
      { t: 0, sky: 18.8, over: 34 },
      { t: 0, shot: { overview: true, angle: 20, zoom: 1.6, tilt: 46 }, over: 34, ease: 'linear' },
      { t: 1, say: 'Feierabend. Kurt übernimmt.', who: ['marco-rieser'] },
      { t: 1.5, event: 'kurt-walkout' },
      { t: 8, say: 'Danke fürs Durchhalten.', who: ['andrea-eichmann', 'jeannine-zurcher', 'samuel-guttinger', 'jannik-stibi', 'sandro-hagen', 'philip-gygax'] },
      { t: 12, say: 'Danke fürs Mitdenken.', who: ['oriana-pontieri', 'martin-fuchs', 'elia-vogt', 'celine-buhler', 'devin-frei', 'alessandro-romeo'] },
      { t: 16, say: 'Danke fürs Lachen.', who: ['jeerapat-wang', 'alyosha-krajnc', 'oscar-grob', 'andrew-jelley', 'larissa-lanker', 'nina-vetsch'] },
      { t: 20, say: 'Danke für jeden Kaffee.', who: ['michael-eberle', 'ramon-lenherr', 'dominic-rechsteiner', 'milica-rakic', 'rene-kappeler', 'delya-kohler'] },
      { t: 24, say: 'Danke für die Ideen.', who: ['teresa-sutter', 'jan-hasler', 'linda-peter', 'jacqueline-graf', 'marianne-hofstetter', 'nina-bauer'] },
      { t: 28, say: 'Danke für dieses Jahr.', who: ['julia-renz', 'zlatko-pesic', 'marco-hefti', 'donata-manser', 'janosch-jost', 'fabian-bucher', 'eliana-lipari'] },
      { t: 31, title: 'Frohe Weihnachten', sub: 'Euer Saftladen', hold: 5 },
    ],
  },
];
