import {
  ClientVerdict,
  MAINNET_ACTIVATION_EPOCH,
  MIN_AGAVE,
  clientVerdict
} from './alpenglowClient';

export { MAINNET_ACTIVATION_EPOCH, MIN_AGAVE, clientVerdict };
export type { ClientVerdict };

/**
 * Alpenglow client support, now that both clusters run it (mainnet
 * migrated at epoch 1064): Agave and Firedancer run Alpenglow,
 * Frankendancer doesn't. The migration's own timing, thresholds and
 * banner are gone.
 */
export const CLIENT_VERDICT_TEXT: Record<
  Exclude<ClientVerdict, 'ok'>,
  string
> = {
  switch: `Firedancer and Frankendancer don't support the migration (planned for mainnet epoch ${MAINNET_ACTIVATION_EPOCH}, est. Oct 21): switch to Agave 4.3+ before then.`,
  upgrade:
    "Agave 4.2 and older use a different Alpenglow feature gate, so they won't follow mainnet's activation: upgrade to Agave 4.3 or newer.",
  unsupported:
    "Frankendancer doesn't support Alpenglow: switch to Agave or Firedancer."
};

export const CLIENT_VERDICT_LABEL: Record<
  Exclude<ClientVerdict, 'ok'>,
  string
> = {
  switch: 'Switch to Agave',
  upgrade: 'Upgrade Agave to 4.3+',
  unsupported: 'Unsupported client'
};
