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
  sleeve?: string; // sleeve colour override
  shorts?: boolean;
  vape?: boolean; // carries a vape and takes a drag now and then
  phone?: boolean; // often walks around the office on a phone call
  height?: number; // 1 = default
  build?: number; // 1 = default width
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  portrait: string | null;
  look: Look;
  dog?: 'shiba' | 'puppy' | 'doodle';
  dogName?: string;
  cats?: Array<{ kind: 'tabby' | 'tortie'; name: string }>; // cats following this person
  adhd?: boolean; // restless: short idle/work spells, fidgets
  speed?: number; // walking speed override (default: random 1.0-1.5)
}
