/** Solana Explorer links on the served cluster (testnet adds its param). */
const cluster = (isTestnet: boolean) => (isTestnet ? '?cluster=testnet' : '');

export const explorerAddress = (address: string, isTestnet: boolean) =>
  `https://explorer.solana.com/address/${address}${cluster(isTestnet)}`;

export const explorerTx = (signature: string, isTestnet: boolean) =>
  `https://explorer.solana.com/tx/${signature}${cluster(isTestnet)}`;

export const explorerBlock = (slot: number, isTestnet: boolean) =>
  `https://explorer.solana.com/block/${slot}${cluster(isTestnet)}`;
