export type HairStyle = 'none' | 'short' | 'quiff' | 'long' | 'bob' | 'bun' | 'manbun' | 'pony' | 'curly';

/** Parametric low-poly look, derived by hand from the portrait photos. */
export interface Look {
  skin: string;
  hair: string;
  style: HairStyle;
  top: string;
  bottom: string;
  bangs?: boolean;
  beard?: 'stubble' | 'full' | 'mustache' | 'goatee'; // goatee = mustache + chin beard
  beardColor?: string; // defaults to the hair colour
  eyebrows?: boolean | 'thick';
  eyes?: 'narrow';
  mouth?: 'full';
  smile?: boolean;
  thinGlasses?: boolean;
  vest?: string; // waistcoat colour, worn over `top`
  moody?: boolean; // switches between a very happy and a very serious face
  necklace?: string[]; // bead colours, hangs on the chest
  wristbands?: string[]; // colours, worn on the person's right wrist
  flipflops?: boolean;
  tattooDark?: boolean; // bold solid-ink tattoo work (upper arm + forearm)
  tattoo?: 'left' | 'right' | 'both'; // forearm tattoo (anatomical side)
  blazer?: string; // blazer colour, worn over `top`
  buttonShirt?: boolean; // collar, placket and chest pockets
  logo?: string; // small tree logo on the chest, colour
  flowers?: string[]; // flower print colours on the shirt
  sideColor?: string; // hair colour at the temples (greying)
  strong?: boolean; // wide shoulders, thick arms
  heightM?: number; // body height in metres, overrides `height`
  glasses?: boolean | string; // true = dark frame, string = frame colour
  cap?: string; // cap colour
  capBack?: boolean; // brim to the back
  tee?: boolean; // short sleeves
  tank?: boolean; // tank top: bare arms and shoulders
  print?: { text: string; color: string }; // lettering across the chest
  sleeve?: string; // sleeve colour override
  shorts?: boolean;
  vape?: boolean; // carries a vape and takes a drag now and then
  phone?: boolean; // often walks around the office on a phone call
  height?: number; // 1 = default
  build?: number; // 1 = default width
}

/**
 * A person's signature move in the home office, which comes up now and then among the usual breaks:
 * swim = off to the sea and back (needs the beach room), catwalk = a desk cat walks up to the webcam and gets
 * shoved aside (needs cats), curl = stands up for biceps curls with a dumbbell (needs a desk).
 */
export type SignatureMove = 'swim' | 'catwalk' | 'curl';

/**
 * The home office rooms. The first eight are regular rooms anybody can work in; the rest are somebody's own (only the
 * person whose `homeRoom` it is ever works there).
 */
export const HOME_ROOMS = ['bedroom', 'kitchen', 'couch', 'balcony', 'study', 'attic', 'scandi', 'gamer', 'beach'] as const;
export type HomeRoom = (typeof HOME_ROOMS)[number];

/** The usual breaks between typing spells in the home office. */
export type HomeBreak = 'sip' | 'stretch' | 'think' | 'call' | 'wave' | 'away' | 'yawn' | 'game';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  portrait: string | null;
  look: Look;
  /** changes to the look when working from home (e.g. a tank top instead of the office shirt) */
  homeLook?: Partial<Look>;
  signature?: SignatureMove;
  /** spits out coffee and grabs an energy drink instead (on every coffee break at home) */
  hatesCoffee?: boolean;
  /** now and then walks to the kitchen for a bag of chips and eats it while strolling around the office */
  snacker?: boolean;
  /** their home office room (can be changed per browser in the character view); without one they get a free room */
  homeRoom?: HomeRoom;
  /** usual home office breaks this person never takes */
  skipBreaks?: HomeBreak[];
  /** changes to the look for a swim (changed out of sight); without it they swim in their clothes */
  swimLook?: Partial<Look>;
  dog?: 'shiba' | 'puppy' | 'doodle' | 'terrier';
  dogName?: string;
  cats?: Array<{ kind: 'tabby' | 'tortie'; name: string }>; // cats following this person
  adhd?: boolean; // restless: short idle/work spells, fidgets
  homebody?: boolean; // works from home a lot and is never out on errands
  speed?: number; // walking speed override (default: random 1.0-1.5)
}
