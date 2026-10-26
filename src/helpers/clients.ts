/**
 * Client ids (as gossip and the epoch records name them) split into the
 * base client and its block-building fork: "JitoLabs" is Agave + Jito,
 * "HarmonicFiredancer" Firedancer + Harmonic. Fork null: the plain client.
 */
const CLIENTS: Record<string, [base: string, fork: string | null]> = {
  Agave: ['Agave', null],
  JitoLabs: ['Agave', 'Jito'],
  AgaveBam: ['Agave', 'BAM'],
  HarmonicAgave: ['Agave', 'Harmonic'],
  Rakurai: ['Agave', 'Rakurai'],
  Raiku: ['Agave', 'Raiku'],
  Paladin: ['Agave', 'Paladin'],
  AgavePaladin: ['Agave', 'Paladin'],
  SolanaLabs: ['Solana Labs', null],
  Firedancer: ['Firedancer', null],
  FireBAM: ['Firedancer', 'BAM'],
  HarmonicFiredancer: ['Firedancer', 'Harmonic'],
  Frankendancer: ['Frankendancer', null],
  HarmonicFrankendancer: ['Frankendancer', 'Harmonic'],
  Sig: ['Sig', null],
  Mithril: ['Mithril', null]
};

/** The base client of a client id ("Unknown(226)" and others: "Other"). */
export const clientBase = (id: string) => CLIENTS[id]?.[0] ?? 'Other';

/** Its fork's name, or null for the plain client or an unknown id. */
export const clientFork = (id: string) => CLIENTS[id]?.[1] ?? null;

/** Whether the id is one we can place. */
export const isKnownClient = (id: string) => id in CLIENTS;
