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

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    // The standalone `metaMask()` connector pulls in `@metamask/connect-evm`
    // as a transitive dep which fails to resolve in some mobile WebView
    // bundles ("Cannot find module '@metamask/connect-evm'") and bricks the
    // sign-in flow. MetaMask Mobile already injects `window.ethereum` inside
    // its in-app browser, so the standard `injected()` connector picks it up
    // with the same UX and one fewer point of failure.
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
