import raw from './team.raw.json';
import type { HomeBreak, HomeRoom, Look, PetVisits, Schedule, SignatureMove, TeamMember } from './types';

// skin tones
const FAIR = '#f2d0b8';
const LIGHT = '#e8b999';
const MEDIUM = '#d29b74';

const BLACK = '#17181c';
const JEANS = '#4d6fa3';
const JEANS_DARK = '#2c3f66';

// Looks per person (id = slug of the full name, see scripts/fetch-team.mjs).
// Hand-annotated from the portraits: hair, glasses, beard, clothing colours.
const looks: Record<string, Look> = {
  'oscar-grob': { skin: FAIR, hair: '#3b281e', style: 'short', cap: '#1d2c5a', top: '#a9c4ec', bottom: '#8fb0d8', heightM: 1.7 },
  'andrew-jelley': { skin: FAIR, hair: '#b88a52', style: 'quiff', top: '#8fa6d8', bottom: '#2a3550', heightM: 1.8 },
  'nina-vetsch': { skin: LIGHT, hair: '#3b2a24', style: 'long', top: BLACK, bottom: JEANS_DARK, heightM: 1.65 },
  'linda-peter': { skin: FAIR, hair: '#c9a46a', style: 'manbun', glasses: '#6b3f26', top: '#e8c4c4', bottom: '#1d2024', heightM: 1.6 },
  'ramon-lenherr': { skin: LIGHT, hair: '#3a2b22', style: 'short', glasses: true, beard: 'stubble', top: '#8fc7b0', bottom: '#5a5f66' },
  'milica-rakic': { skin: FAIR, hair: '#d6b072', style: 'long', top: '#1b1b1f', bottom: '#2c2f36', heightM: 1.6 },
  'alyosha-krajnc': { skin: '#e6c3a0', hair: '#14100e', style: 'short', bangs: true, eyes: 'narrow', tee: true, top: '#1f2a55', bottom: '#c9bfaa', heightM: 1.6 },
  'michael-eberle': { skin: MEDIUM, hair: '#1c1a1a', style: 'short', beard: 'full', top: '#e6dfd0', bottom: JEANS, sleeve: '#e6dfd0' },
  'jan-hasler': { skin: FAIR, hair: '#d9a98a', style: 'none', glasses: true, thinGlasses: true, moody: true, phone: true, beard: 'stubble', tee: true, top: '#263a63', bottom: '#2b2e36', heightM: 1.7 },
  'marco-hefti': { skin: LIGHT, hair: '#2e2420', style: 'pony', glasses: true, beard: 'goatee', tee: true, shorts: true, top: '#d8cfc4', bottom: '#7b7a78', heightM: 1.9, flipflops: true, necklace: ['#3b2a22', '#5f8a8a', '#8a6a3c', '#2a2a2e'], wristbands: ['#2fbf71', '#f2d230', '#e04ca0', '#1c1c22'] },
  'rene-kappeler': { skin: FAIR, hair: '#c9c4bd', style: 'none', beard: 'stubble', top: '#f1efeb', vest: '#5d6068', tee: true, bottom: BLACK, heightM: 1.8 },
  'martin-fuchs': { skin: LIGHT, hair: '#5c5a58', style: 'short', glasses: true, beard: 'stubble', beardColor: '#8d8a86', top: BLACK, bottom: JEANS_DARK, heightM: 1.85 },
  'nina-bauer': { skin: FAIR, hair: '#d8b774', style: 'bun', top: '#2f4fb0', bottom: BLACK, heightM: 1.7 },
  'jannik-stibi': { skin: LIGHT, hair: '#4a3022', style: 'curly', beard: 'stubble', tee: true, top: BLACK, bottom: '#5f86b8', build: 0.82, tattoo: 'left', heightM: 2.0 },
  'julia-renz': { skin: FAIR, hair: '#d9b574', style: 'long', tee: true, top: '#232328', bottom: '#2a3b63', heightM: 1.6 },
  'jeerapat-wang': { skin: '#e2b98e', hair: '#0f0c0a', style: 'bob', bangs: true, eyes: 'narrow', glasses: '#9a9aa2', thinGlasses: true, top: '#15161a', bottom: '#15161a', heightM: 1.75 },
  'teresa-sutter': { skin: FAIR, hair: '#3a2a22', style: 'long', top: '#1a1a1d', bottom: '#ece8e0', heightM: 1.6 },
  'jacqueline-graf': { skin: FAIR, hair: '#1a1416', style: 'long', bangs: true, glasses: '#c9a46a', top: '#1f3fd0', bottom: '#15161a', heightM: 1.9 },
  'donata-manser': { skin: FAIR, hair: '#c49a6c', style: 'long', tee: true, top: '#17171a', bottom: '#202228', tattoo: 'both', tattooDark: true, heightM: 1.63 },
  'oriana-pontieri': { skin: MEDIUM, hair: '#2a1c18', style: 'long', top: '#f3f1ee', bottom: '#202228', mouth: 'full', heightM: 1.7 },
  'samuel-guttinger': { skin: LIGHT, hair: '#2b2320', style: 'short', beard: 'stubble', tee: true, top: BLACK, bottom: BLACK, build: 0.82, eyebrows: true, heightM: 2.0 },
  'alessandro-romeo': { skin: LIGHT, hair: '#2a2420', style: 'short', tee: true, top: '#cdb8a0', bottom: '#1e2740' },
  'sandro-hagen': { skin: LIGHT, hair: '#5b4333', style: 'manbun', glasses: true, beard: 'stubble', top: BLACK, bottom: '#3a3d42', height: 0.88 },
  'delya-kohler': { skin: LIGHT, hair: '#5a3a2a', style: 'long', top: '#3a3a3e', bottom: '#86aee0', heightM: 1.7 },
  'devin-frei': { skin: FAIR, hair: '#3a2a22', style: 'curly', top: '#9fc3e9', bottom: BLACK, build: 1.15, strong: true, eyebrows: 'thick', heightM: 1.8 },
  'elia-vogt': { skin: LIGHT, hair: '#3b2a22', style: 'short', beard: 'mustache', tee: true, top: '#f2f0ec', bottom: '#a47f58', heightM: 1.8 },
  'marianne-hofstetter': { skin: FAIR, hair: '#7a4a34', style: 'long', bangs: true, tee: true, top: '#8a9a7e', bottom: '#4f7fc0', heightM: 1.7 },
  'dominic-rechsteiner': { skin: LIGHT, hair: '#b8b8b8', style: 'short', beard: 'stubble', top: '#1c1d20', bottom: '#20242c', heightM: 1.9 },
  'fabian-bucher': { skin: MEDIUM, hair: '#2a211c', sideColor: '#9a9690', style: 'short', beard: 'stubble', beardColor: '#6e6862', smile: true, buttonShirt: true, vape: true, top: '#6f98c8', bottom: '#b5ad98', heightM: 1.8 },
  'janosch-jost': { skin: LIGHT, hair: '#5a3a28', style: 'short', cap: BLACK, capBack: true, glasses: true, thinGlasses: true, beard: 'full', tee: true, beardColor: '#9a735b', top: '#6b5058', bottom: BLACK, heightM: 1.8 },
  'larissa-lanker': { skin: FAIR, hair: '#e8d8b5', style: 'long', top: '#1d2420', flowers: ['#e8a0b8', '#f0c050', '#e2763a', '#f4efe6'], bottom: '#b79a6a', heightM: 1.7 },
  'marco-rieser': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'stubble', tee: true, top: '#d9d9db', bottom: '#6d8fc0', build: 1.12, logo: '#2f6b4a', heightM: 1.7 },
  'andrea-eichmann': { skin: FAIR, hair: '#d1a96a', style: 'long', top: '#f2eee8', blazer: '#6e1f2e', eyebrows: true, bottom: BLACK, heightM: 1.7 },
  'jeannine-zurcher': { skin: FAIR, hair: '#9b6b4a', style: 'bob', glasses: true, top: '#8fb3e6', bottom: BLACK, heightM: 1.6 },
  'celine-buhler': { skin: FAIR, hair: '#9a5a3c', style: 'long', glasses: '#d9c7a4', thinGlasses: true, tee: true, tattoo: 'both', top: '#f1ebe6', bottom: '#202228', heightM: 1.7 },
  'zlatko-pesic': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'full', eyebrows: true, top: '#a89a82', bottom: BLACK, strong: true, build: 1.15, heightM: 1.8 },
  'philip-gygax': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'stubble', top: '#1f5a58', bottom: '#35507a', heightM: 1.8 },
};

// Zlatko's little son (shows up in his home office)
const sons: Record<string, Look> = {
  'zlatko-pesic': { skin: FAIR, hair: '#e9cf86', style: 'short', tee: true, shorts: true, top: '#d94b3a', bottom: JEANS, heightM: 1.05, build: 0.8 },
};

const fallback: Look = { skin: LIGHT, hair: '#4a3426', style: 'short', top: '#9aa7b5', bottom: '#2b2e36' };

// Dogs that appear in the portraits
const dogs: Record<string, TeamMember['dog']> = {
  'ramon-lenherr': 'shiba',
  'janosch-jost': 'puppy',
  'nina-vetsch': 'doodle',
  'fabian-bucher': 'terrier',
};

// dog names
const dogNames: Record<string, string> = {
  'ramon-lenherr': 'Thala',
  'janosch-jost': 'Ellie',
  'nina-vetsch': 'Harry',
  'fabian-bucher': 'Mira',
};

// which days the dogs come to the office (0 = Monday): fixed days, now and then they stay home anyway
const dogVisits: Record<string, PetVisits> = {
  'ramon-lenherr': { days: [0, 2, 4], chance: 0.9 },
  'janosch-jost': { days: [1, 3] },
  'nina-vetsch': { days: [0, 1, 3], chance: 0.8 },
  'fabian-bucher': { days: [2, 4], chance: 0.9 },
};

// the cats come along on a whim (no fixed days)
const CAT_VISITS: PetVisits = { chance: 0.35 };

// cats that follow their person around
const cats: Record<string, NonNullable<TeamMember['cats']>> = {
  'donata-manser': [
    { kind: 'tabby', name: 'Angus', visits: CAT_VISITS },
    { kind: 'tortie', name: 'Binx', visits: CAT_VISITS },
  ],
};

// walking speed overrides (default: random 1.0-1.5)
const speeds: Record<string, number> = {
  'sandro-hagen': 3.4,
  'delya-kohler': 1.8,
};

// what changes when they work from home
const homeLooks: Record<string, Partial<Look>> = {
  'sandro-hagen': { tank: true, top: '#ffffff', print: { text: 'Sparklys', color: '#111111' } },
};

// what they change into for a swim (only the deck chair room has the sea)
const swimLooks: Record<string, Partial<Look>> = {
  'marco-hefti': { top: LIGHT, tank: true, bottom: '#e8645a' }, // just bathing shorts
};

// whose home office is which room (beach = Marco's own room in Thailand)
const homeRooms: Record<string, HomeRoom> = {
  'marco-hefti': 'beach',
};

// signature moves in the home office (optional, happen now and then)
const signatures: Record<string, SignatureMove> = {
  'marco-hefti': 'swim',
  'donata-manser': 'catwalk',
  'devin-frei': 'curl',
};

// home office breaks they never take
const skipBreaks: Record<string, HomeBreak[]> = {
  'marco-hefti': ['game'], // no video games on the beach
};

// can't stand coffee
const coffeeHaters = new Set(['janosch-jost']);

// grab chips from the kitchen and eat them while walking around
const snackers = new Set(['jan-hasler']);

// step out onto the porch for a cigarette now and then (#169)
const smokers = new Set(['jannik-stibi', 'sandro-hagen', 'ramon-lenherr', 'delya-kohler', 'jeerapat-wang']);

// in the home office a lot, never out on errands
const homebodies = new Set(['marco-hefti']);

// people with ADHD: restless, short attention span (see Person.ts)
const adhd = new Set(['delya-kohler', 'sandro-hagen']);

/** Core office hours (08:00 - 17:30): whoever has no entry below keeps exactly these. */
export const CORE_HOURS: Schedule = { arrive: 8, leave: 17.5, lunch: 12, nightOwlChance: 0.02 };

// Habitual office hours per person (clock hours, 7.5 = 07:30); anything left out falls back to CORE_HOURS.
// arrive / leave / lunch get a random jitter every day, nightOwlChance is the chance per day to stay on for a night shift.
const schedules: Record<string, Partial<Schedule>> = {
  'marco-hefti': { arrive: 9.5, leave: 18.5, lunch: 13 },
  'donata-manser': { arrive: 8.5, leave: 17.5 },
  'marco-rieser': { arrive: 9, leave: 18, lunch: 12.5, nightOwlChance: 0.3, nightHome: true },
  'andrea-eichmann': { arrive: 7.5, leave: 17 },
  'jeannine-zurcher': { arrive: 7, leave: 16, lunch: 11.5 },
  'samuel-guttinger': { arrive: 7.25, leave: 17.5, lunch: 11.75 },
  'jannik-stibi': { arrive: 8.25, leave: 17 },
  'sandro-hagen': { arrive: 9.5, leave: 18.5, lunch: 12.75, nightOwlChance: 0.25 },
  'philip-gygax': { arrive: 8, leave: 17.5 },
  'oriana-pontieri': { arrive: 7, leave: 16.25, lunch: 11.5 },
  'martin-fuchs': { arrive: 8.5, leave: 18, lunch: 12.5 },
  'elia-vogt': { arrive: 9, leave: 18 },
  'celine-buhler': { arrive: 8.75, leave: 17.25, lunch: 12.25 },
  'devin-frei': { arrive: 7.5, leave: 16.5, lunch: 11.75 },
  'alessandro-romeo': { arrive: 9.25, leave: 18.25, lunch: 12.75 },
  'jeerapat-wang': { arrive: 7.75, leave: 16.75 },
  'alyosha-krajnc': { arrive: 8, leave: 17 },
  'fabian-bucher': { arrive: 7.75, leave: 18.5, lunch: 12.25, nightOwlChance: 0.25 },
  'andrew-jelley': { arrive: 9.5, leave: 18.75, lunch: 13, nightOwlChance: 0.06 },
  'larissa-lanker': { arrive: 8.5, leave: 17.25 },
  'nina-vetsch': { arrive: 8.25, leave: 17.5, lunch: 12.25 },
  'michael-eberle': { arrive: 7.5, leave: 17 },
  'ramon-lenherr': { arrive: 8.75, leave: 18.5, lunch: 12.5, nightOwlChance: 0.06 },
  'dominic-rechsteiner': { arrive: 7.25, leave: 16.5, lunch: 11.5 },
  'milica-rakic': { arrive: 8, leave: 17.25 },
  'rene-kappeler': { arrive: 7, leave: 17.5, lunch: 11.75 },
  'delya-kohler': { arrive: 9.25, leave: 17.75, lunch: 12.5 },
  'teresa-sutter': { arrive: 8.25, leave: 16.75 },
  'jan-hasler': { arrive: 7.5, leave: 18.25, lunch: 12.25, nightOwlChance: 0.05 },
  'linda-peter': { arrive: 8.5, leave: 17.5 },
  'oscar-grob': { arrive: 7.75, leave: 16.5, lunch: 11.75 },
  'jacqueline-graf': { arrive: 9, leave: 17.75, lunch: 12.75 },
  'janosch-jost': { arrive: 9.5, leave: 19, lunch: 13, nightOwlChance: 0.08 },
  'marianne-hofstetter': { arrive: 7.75, leave: 17.25 },
  'nina-bauer': { arrive: 8, leave: 17.75, lunch: 12.25 },
  'julia-renz': { arrive: 8.75, leave: 17.5, lunch: 12.5 },
  // works remotely: in the office on about one day in eight (configurable: visitChance)
  'zlatko-pesic': { arrive: 9, leave: 17.5, visitChance: 0.12 },
};

/** Alter egos (#32): Marco turns into Kompensiertier Kurt when he goes home, see src/game/AlterEgo.ts. */
const alterEgos: Record<string, TeamMember['alterEgo']> = { 'marco-rieser': 'kurt' };

/** the devs own Nerf guns (see Nerf.ts) */
const devs = new Set(raw.filter((p) => /Webdevelopment|AI Engineer/.test(p.role)).map((p) => p.id));

export const team: TeamMember[] = raw.map((p) => ({
  id: p.id,
  name: p.name,
  role: p.role,
  portrait: p.portrait,
  look: devs.has(p.id) ? { ...(looks[p.id] ?? fallback), nerf: true } : (looks[p.id] ?? fallback),
  homeLook: homeLooks[p.id],
  signature: signatures[p.id],
  homeRoom: homeRooms[p.id],
  skipBreaks: skipBreaks[p.id],
  hatesCoffee: coffeeHaters.has(p.id),
  snacker: snackers.has(p.id),
  smoke: smokers.has(p.id),
  swimLook: swimLooks[p.id],
  dog: dogs[p.id],
  dogName: dogNames[p.id],
  dogVisits: dogVisits[p.id],
  cats: cats[p.id],
  speed: speeds[p.id],
  adhd: adhd.has(p.id),
  son: sons[p.id],
  homebody: homebodies.has(p.id),
  schedule: { ...CORE_HOURS, ...schedules[p.id] },
  alterEgo: alterEgos[p.id],
}));
