/**
 * Shared fallback lines of the crew chat (#195), German only. A person's own lines (`src/data/voices/<id>.json`) come
 * first; when they have none for a topic, a line from here is picked and passed through their style (`voice.ts`).
 *
 * Each topic has phases tied to what the simulation does, so a message fits the moment:
 *   ask    = before it happens (a question to the crew)
 *   reply  = somebody answers the ask
 *   during = while it happens (a status: "bin dran")
 *   after  = when it is over (a reaction)
 * `{who}` = a colleague the sim names (the visitor, the one who goes). Optional.
 */
export const TOPICS = ['greeting', 'coffee', 'lunch', 'printer', 'server', 'rain', 'meeting', 'complaint', 'random', 'play', 'toilet', 'pet'] as const;
export type Topic = (typeof TOPICS)[number];
export const PHASES = ['ask', 'reply', 'during', 'after'] as const;
export type Phase = (typeof PHASES)[number];
export type Block = Partial<Record<Phase, readonly string[]>>;

export const chatBlocks: Record<Topic, Block> = {
  // presence.lunch (around each person's lunch hour; 4+ out at once = lunch break)
  lunch: {
    ask: [
      'Wer geht Mittagessen?',
      'Hunger. Jemand Lust auf was zu essen holen?',
      'Ich geh gleich was holen, soll ich jemandem was mitbringen?',
      'Kebab, Pizza oder Bäcker? Ich geh in 5 Minuten.',
      'Wer kommt mit zum Mittag?',
      'Gehen wir zusammen essen? 12:15?',
      'Ich lauf kurz zum Take-away. Bestellungen bitte jetzt.',
      'Jemand noch nichts gegessen? Ich geh gleich los.',
    ],
    reply: [
      'Ich komme mit!',
      'Bring mir bitte auch was mit 🙏',
      'Gib mir 2 Minuten.',
      'Ich bin raus, hab was dabei.',
      'Dasselbe wie immer bitte.',
      'Ja, bin dabei.',
      'Heute nicht, zu viel zu tun.',
    ],
    during: [
      'Bin unterwegs, bin gleich zurück.',
      'Mittag. Bin in 30 Minuten wieder da.',
      'Esse am Schreibtisch, nicht stören 😄',
      'Schlange vor dem Laden, dauert.',
    ],
    after: [
      'Zurück. Das war gut.',
      'Wer hat die Pommes bestellt? Sind da.',
      'Essen ist da, kommt in die Küche!',
      'Foodkoma. Bitte keine Meetings.',
    ],
  },

  // place.coffeebreak / place.coffeerun / place.energydrink
  coffee: {
    ask: [
      'Kaffee?',
      'Wer will einen Kaffee? Ich geh jetzt.',
      'Kaffeepause in 5, wer kommt mit?',
      'Ich brauch Koffein. Jemand auch?',
    ],
    reply: ['Ja bitte, einen Doppelten.', 'Bin dabei.', 'Mit Hafermilch bitte.', 'Gleich, ich speichere nur noch.'],
    during: ['Bin in der Küche.', 'Maschine ist wieder leer, ich fülle auf.', 'Die Maschine macht komische Geräusche.'],
    after: ['Besser.', 'Der Kaffee heute ist gut.', 'Zweiter Kaffee, ich weiss, ich weiss.'],
  },

  // place.printer
  printer: {
    ask: ['Druckt der Drucker bei euch?', 'Wer hat meinen Ausdruck?'],
    during: ['Bin am Drucker.', 'Papierstau. Schon wieder.', 'Ich drucke kurz was, bin gleich zurück.'],
    after: ['Drucker geht wieder.', 'Wer hat den letzten Papierstapel genommen?', 'Ausdruck liegt oben auf dem Gerät.'],
  },

  // place.meeting / place.meetingtv
  meeting: {
    ask: ['Meeting in 2 Minuten, Raum frei?', 'Wer ist beim Meeting dabei?', 'Kommt jemand in den Sitzungsraum?'],
    reply: ['Bin unterwegs.', 'Komme 2 Minuten später.', 'Bin schon da.'],
    during: ['Bin im Meeting, melde mich danach.', 'Meeting läuft, bitte nicht stören.'],
    after: ['Meeting fertig. Protokoll folgt.', 'Das hätte eine Mail sein können 😅', 'Wer macht das Protokoll?'],
  },

  // place.foosball / place.pod (Kicker, Mariokart)
  play: {
    ask: ['Kicker? Wer will eine Runde?', 'Mariokart in der Pause, wer ist dabei?', 'Ich brauch zwei Leute fürs Kickerturnier.'],
    reply: ['Ich bin dabei.', 'Aber nur wenn ich gewinne.', 'Gleich, noch ein Mail.'],
    during: ['Tor! 🎉', 'Das war nie ein Foul.', 'Revanche!'],
    after: ['Gutes Spiel.', 'Rematch morgen.', 'Ich bin zu alt dafür.'],
  },

  // place.serverrack (a dev fixes it; the curses are 'during')
  server: {
    ask: ['Läuft der Server?', 'Ist das Staging gerade down?', 'Hört ihr dieses Piepen?'],
    during: ['Verdammt nochmal, der Serverschrank schon wieder.', 'Bin dran. Nicht anfassen.', 'Ich hau jetzt mal drauf 🔨', 'Gleich wieder oben.'],
    after: ['Läuft wieder.', 'Na also!', 'Hat jemand das Kabel gesehen? Egal, geht.'],
  },

  // presence.rain
  rain: {
    ask: ['Regnet es immer noch?', 'Hat jemand einen Schirm?'],
    during: ['Ich geh trotzdem raus.', 'Nass bis auf die Knochen.'],
    after: ['Bin patschnass 🌧️', 'Schirm ist im Eingang, wer ihn braucht.'],
  },

  // presence.remotegreet (Zlatko / remote visit)
  greeting: {
    ask: ['Morgen zusammen!', 'Hallo Crew.', 'Guten Morgen, wer ist heute alles da?'],
    reply: ['Moin!', 'Guten Morgen!', 'Hey!'],
    during: ['Bin da.', '{who} ist im Haus! 🎉'],
    after: ['Schönen Feierabend!', 'Bin dann mal weg. Bis morgen.', 'Tschüss zusammen!'],
  },

  // place.toilet / place.toiletqueue
  toilet: {
    ask: ['Ist das WC frei?'],
    during: ['Bin kurz weg.', 'Besetzt, braucht noch.'],
    after: ['Wieder da.'],
  },

  // pet.*
  pet: {
    ask: ['Wer hat den Hund heute dabei?'],
    during: ['Der Hund will Aufmerksamkeit 🐶', 'Streichelpause, bin gleich wieder da.'],
    after: ['Bester Büromitarbeiter.'],
  },

  // grumbling about the office itself (no single event: the idle chatter draws on it too)
  complaint: {
    during: [
      'Wer hat schon wieder den Kühlschrank leergegessen?',
      'Kann bitte jemand die Spülmaschine ausräumen?',
      'Das WLAN ist heute wieder unglaublich langsam.',
      'Es ist viel zu kalt hier drin.',
      'Wer hat meine Tasse genommen?',
    ],
  },

  // social.* idle chatter (no sim event)
  random: {
    during: [
      'Weiss jemand, wo das Ladekabel ist?',
      'Hat jemand das Passwort fürs Gäste-WLAN?',
      'Ist es hier auch so warm?',
      'Mir ist langweilig, erzähl mal was.',
      'Freitag, endlich 😄',
      'Wer hat den Kühlschrank leergegessen?',
      'Kann jemand das Fenster aufmachen?',
      'Bin kurz im Fokus, bitte keine Fragen 🎧',
    ],
  },
};
