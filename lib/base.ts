import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import type { Address } from "viem";
import { createPublicClient } from "viem";
import { createConfig, http, injected } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";

import { COLOR_WARS_V1_ABI } from "@/lib/color-wars-v1";

export const ACTIVE_CHAIN = baseSepolia;
export const CHAIN = ACTIVE_CHAIN;
export const supportedChains = [base, baseSepolia] as const;

const configuredAddress = process.env.NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS as Address | undefined;
const hasConfiguredAddress =
  configuredAddress &&
  configuredAddress !== "0x0000000000000000000000000000000000000000";

export const ACTIVE_CONTRACT = hasConfiguredAddress ? configuredAddress : undefined;
export const ACTIVE_CONTRACT_ABI = COLOR_WARS_V1_ABI;
export const isContractConfigured = Boolean(ACTIVE_CONTRACT);

export const baseSepoliaPublicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
});

// Base mainnet client used only for signature verification (ERC-1271 /
// ERC-6492). Smart wallets such as Coinbase Smart Wallet are typically
// deployed on Base mainnet even when the user is interacting with our
// Sepolia contract, so we have to be able to call `isValidSignature` on
// the mainnet deployment.
export const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL),
});

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    // Farcaster / Base Mini App context: when the page is opened inside the
    // Base App or Warpcast, this connector talks to the host's injected EIP-1193
    // provider via @farcaster/miniapp-sdk. Outside a Mini App it is harmless
    // (just never connects). It is listed first so auto-reconnect picks it up
    // before the regular injected() probes window.ethereum.
    farcasterMiniApp(),
    // Regular browsers (and MetaMask / Coinbase Wallet in-app browsers, which
    // both inject window.ethereum). The standalone metaMask() connector is
    // intentionally NOT used: it pulls in @metamask/connect-evm which fails to
    // resolve inside some mobile WebView bundles.
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: "Base Color Wars",
    }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
  },
  ssr: true,
});

export const targetChain = ACTIVE_CHAIN;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
