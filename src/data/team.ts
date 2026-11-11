import raw from './team.raw.json';
import type { Look, TeamMember } from './types';

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
  'jan-hasler': { skin: FAIR, hair: '#d9a98a', style: 'none', glasses: true, thinGlasses: true, moody: true, beard: 'stubble', tee: true, top: '#263a63', bottom: '#2b2e36', heightM: 1.7 },
  'marco-hefti': { skin: LIGHT, hair: '#2e2420', style: 'pony', glasses: true, beard: 'goatee', tee: true, shorts: true, top: '#d8cfc4', bottom: '#7b7a78', heightM: 1.9, flipflops: true, necklace: ['#3b2a22', '#5f8a8a', '#8a6a3c', '#2a2a2e'], wristbands: ['#2fbf71', '#f2d230', '#e04ca0', '#1c1c22'] },
  'rene-kappeler': { skin: FAIR, hair: '#c9c4bd', style: 'none', beard: 'stubble', top: '#f1efeb', vest: '#5d6068', tee: true, bottom: BLACK, heightM: 1.8 },
  'martin-fuchs': { skin: LIGHT, hair: '#5c5a58', style: 'short', glasses: true, beard: 'stubble', beardColor: '#8d8a86', top: BLACK, bottom: JEANS_DARK, heightM: 1.85 },
  'nina-bauer': { skin: FAIR, hair: '#d8b774', style: 'bun', top: '#2f4fb0', bottom: BLACK, heightM: 1.7 },
  'jannik-stibi': { skin: LIGHT, hair: '#4a3022', style: 'curly', beard: 'stubble', tee: true, top: BLACK, bottom: '#5f86b8', build: 0.82, tattoo: 'left', heightM: 2.0 },
  'julia-renz': { skin: FAIR, hair: '#d9b574', style: 'long', tee: true, top: '#232328', bottom: '#2a3b63', heightM: 1.6 },
  'jeerapat-wang': { skin: '#e2b98e', hair: '#0f0c0a', style: 'bob', bangs: true, eyes: 'narrow', glasses: '#9a9aa2', thinGlasses: true, top: '#15161a', bottom: '#15161a', heightM: 1.75 },
  'teresa-sutter': { skin: FAIR, hair: '#3a2a22', style: 'long', top: '#1a1a1d', bottom: '#ece8e0', heightM: 1.6 },
  'jacqueline-graf': { skin: FAIR, hair: '#1a1416', style: 'long', bangs: true, glasses: '#c9a46a', top: '#1f3fd0', bottom: '#15161a', heightM: 1.9 },
  'donata-manser': { skin: FAIR, hair: '#c49a6c', style: 'long', tee: true, top: '#17171a', bottom: '#202228', tattoo: 'right', heightM: 1.63 },
  'oriana-pontieri': { skin: MEDIUM, hair: '#2a1c18', style: 'long', top: '#f3f1ee', bottom: '#202228', mouth: 'full', heightM: 1.7 },
  'samuel-guttinger': { skin: LIGHT, hair: '#2b2320', style: 'short', beard: 'stubble', tee: true, top: BLACK, bottom: BLACK, build: 0.82, eyebrows: true, heightM: 2.0 },
  'alessandro-romeo': { skin: LIGHT, hair: '#2a2420', style: 'short', tee: true, top: '#cdb8a0', bottom: '#1e2740' },
  'sandro-hagen': { skin: LIGHT, hair: '#5b4333', style: 'manbun', glasses: true, beard: 'stubble', top: BLACK, bottom: '#3a3d42', height: 0.88 },
  'delya-kohler': { skin: LIGHT, hair: '#5a3a2a', style: 'long', top: '#3a3a3e', bottom: '#86aee0', heightM: 1.7 },
  'devin-frei': { skin: FAIR, hair: '#3a2a22', style: 'curly', top: '#9fc3e9', bottom: BLACK, build: 1.15, strong: true, eyebrows: 'thick', heightM: 1.8 },
  'elia-vogt': { skin: LIGHT, hair: '#3b2a22', style: 'short', beard: 'mustache', tee: true, top: '#f2f0ec', bottom: '#a47f58', heightM: 1.8 },
  'marianne-hofstetter': { skin: FAIR, hair: '#7a4a34', style: 'long', bangs: true, tee: true, top: '#8a9a7e', bottom: '#4f7fc0', heightM: 1.7 },
  'dominic-rechsteiner': { skin: LIGHT, hair: '#b8b8b8', style: 'short', beard: 'stubble', top: '#1c1d20', bottom: '#20242c', heightM: 1.9 },
  'fabian-bucher': { skin: MEDIUM, hair: '#2a211c', sideColor: '#9a9690', style: 'short', beard: 'stubble', beardColor: '#6e6862', smile: true, buttonShirt: true, top: '#6f98c8', bottom: '#b5ad98', heightM: 1.8 },
  'janosch-jost': { skin: LIGHT, hair: '#5a3a28', style: 'short', cap: BLACK, capBack: true, glasses: true, thinGlasses: true, beard: 'full', tee: true, beardColor: '#9a735b', top: '#6b5058', bottom: BLACK, heightM: 1.8 },
  'larissa-lanker': { skin: FAIR, hair: '#e8d8b5', style: 'long', top: '#1d2420', flowers: ['#e8a0b8', '#f0c050', '#e2763a', '#f4efe6'], bottom: '#b79a6a', heightM: 1.7 },
  'marco-rieser': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'stubble', tee: true, top: '#d9d9db', bottom: '#6d8fc0', build: 1.12, logo: '#2f6b4a', heightM: 1.7 },
  'andrea-eichmann': { skin: FAIR, hair: '#d1a96a', style: 'long', top: '#f2eee8', blazer: '#6e1f2e', eyebrows: true, bottom: BLACK, heightM: 1.7 },
  'jeannine-zurcher': { skin: FAIR, hair: '#9b6b4a', style: 'bob', glasses: true, top: '#8fb3e6', bottom: BLACK, heightM: 1.6 },
  'celine-buhler': { skin: FAIR, hair: '#9a5a3c', style: 'long', glasses: '#d9c7a4', thinGlasses: true, tee: true, tattoo: 'both', top: '#f1ebe6', bottom: '#202228', heightM: 1.7 },
  'zlatko-pesic': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'full', eyebrows: true, top: '#a89a82', bottom: BLACK, strong: true, build: 1.15, heightM: 1.8 },
  'philip-gygax': { skin: LIGHT, hair: '#2a2420', style: 'short', beard: 'stubble', top: '#1f5a58', bottom: '#35507a', heightM: 1.8 },
};

const fallback: Look = { skin: LIGHT, hair: '#4a3426', style: 'short', top: '#9aa7b5', bottom: '#2b2e36' };

// Dogs that appear in the portraits
const dogs: Record<string, TeamMember['dog']> = {
  'ramon-lenherr': 'shiba',
  'janosch-jost': 'puppy',
  'nina-vetsch': 'doodle',
};

// dog names
const dogNames: Record<string, string> = {
  'ramon-lenherr': 'Tala',
  'janosch-jost': 'Ellie',
  'nina-vetsch': 'Harry',
};

// cats that follow their person around
const cats: Record<string, NonNullable<TeamMember['cats']>> = {
  'donata-manser': [
    { kind: 'tabby', name: 'Angus' },
    { kind: 'tortie', name: 'Binx' },
  ],
};

// walking speed overrides (default: random 1.0-1.5)
const speeds: Record<string, number> = {
  'sandro-hagen': 3.4,
  'delya-kohler': 1.8,
};

// people with ADHD: restless, short attention span (see Person.ts)
const adhd = new Set(['delya-kohler', 'sandro-hagen']);

export const team: TeamMember[] = raw.map((p) => ({
  id: p.id,
  name: p.name,
  role: p.role,
  portrait: p.portrait,
  look: looks[p.id] ?? fallback,
  dog: dogs[p.id],
  dogName: dogNames[p.id],
  cats: cats[p.id],
  speed: speeds[p.id],
  adhd: adhd.has(p.id),
}));
