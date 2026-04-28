<<<<<<< HEAD
# Base Color Wars

Color Wars / Pixel Wars prototype for Base built with `Next.js`, `wagmi`, and `viem`.

## What is implemented

- 3 teams: `BLUE`, `FUCHSIA`, `YELLOW`
- Shared `300 x 300` pixel canvas
- Wallet connect UI for injected wallets, MetaMask, and Base Wallet via wagmi connectors
- Sign-message auth flow before joining a team
- Pixel packs bought through `ColorWarsV1` on Base Sepolia
- Energy regen, dynamic energy cost by CPS, cooldown, and anti-spam cap
- Burst mode with reduced energy cost and disabled cooldown checks
- Round loop: `2h live + 30m break`
- Winner calculation from canvas control
- Reward accrual for the winning team based on round contribution share
- Reward claim endpoint for MVP accounting
- Backend `PixelsPurchased` event listener with in-memory duplicate protection by `txHash`

## Run

```bash
npm install
npm run contracts:compile
npm run dev
```

Open `http://localhost:3000`.

## Contract v1

Contract source:

- `contracts/ColorWarsV1.sol`

Compiled artifact:

- `artifacts/ColorWarsV1.json`

Deployment helpers:

- `scripts/compile-color-wars-v1.mjs`
- `scripts/deploy-color-wars-v1.mjs`

Deploy to Base Sepolia after setting env vars:

```bash
npm run contracts:compile
```

Then open `/deploy` in the app and deploy through your connected wallet on Base Sepolia.

After deployment, set the deployed address in:

```bash
NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS=0x...
```

There is no private-key deploy path in this project anymore.

## Build status

Verified with:

```bash
npm run build
```

## Key files

- `app/page.tsx`: main screen
- `components/game-shell.tsx`: UI state, wallet flow, API actions
- `components/pixel-canvas.tsx`: canvas renderer and click mapping
- `lib/game-store.ts`: round engine, energy, burst, pool, rewards
- `lib/base.ts`: Base Sepolia chain, client, active contract config
- `lib/color-wars-v1.ts`: typed ABI, bytecode export, pack mappings
- `lib/pixel-purchase-listener.ts`: contract event watcher and duplicate guard
- `app/api/game/*`: route handlers for auth, paint, purchase, burst, claim, and state

## Current assumptions

- Pack purchases are initiated onchain from the wallet and credited only after the backend sees `PixelsPurchased`.
- Burst price is currently set in code as `0.0015 ETH` because your spec defined burst behavior but not burst pricing.
- Game state lives in server memory right now. Restarting the app resets the canvas and round state.
- Reward claiming is accounting-only for now; no actual payout contract is wired yet.
- The repo is deployment-ready, but a live Base Sepolia contract address is not baked into source. Set it through `NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS`.

## Docs alignment

This scaffold follows the Base docs direction you shared:

- `Build an app on Base`: `Next.js + wagmi + viem`
- `Resources for AI agents`: useful if you want to wire docs-aware agents or MCP-assisted build workflows next
=======
# Color-Wars
Pixel Wars game for Base app
>>>>>>> 9070aaacfa5d6f86e93ff1830c48e1c7cce73871
