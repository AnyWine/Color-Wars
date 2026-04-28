# Base Color Wars

Color Wars / Pixel Wars prototype for Base built with `Next.js`, `wagmi`, and `viem`.

## What is implemented

- 3 teams: `BLUE`, `PINK`, `YELLOW`
- Shared `200 x 200` pixel canvas
- Wallet connect UI for injected wallets, MetaMask, and Base Wallet via wagmi connectors
- Sign-message auth flow with server-issued one-time nonce, verified with viem and bound to an HMAC-signed HttpOnly session cookie
- Pixel packs bought through `ColorWarsV1` on Base Sepolia
- Energy regen, dynamic energy cost by CPS, cooldown, and anti-spam cap
- Burst mode with reduced energy cost and disabled cooldown checks; activated only after the backend sees a confirmed on-chain payment
- Round loop: `20 min live + 5 min break`
- Winner calculation from canvas control
- Reward accrual for the winning team based on round contribution share
- Backend `PixelsPurchased` event listener with in-memory duplicate protection by `txHash`
- Per-session rate limits on paint and chat
- Structured JSON logging for auth / rate limits / burst activations

## Run

```bash
npm install
npm run contracts:compile
npm run dev
```

Open `http://localhost:3000`.

## Environment

Required in production (no fallback):

```
SESSION_SECRET=$(openssl rand -hex 32)
```

Optional:

```
NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS=0x...        # deployed contract address
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://...   # custom RPC
NEXT_PUBLIC_ENABLE_DEPLOY=true                 # show /deploy page (404 by default)
```

## Contract v1

Contract source:

- `contracts/ColorWarsV1.sol`

Compiled artifact:

- `artifacts/ColorWarsV1.json`

Deployment helpers:

- `scripts/compile-color-wars-v1.mjs`

Deploy to Base Sepolia after setting env vars:

```bash
npm run contracts:compile
```

Then set `NEXT_PUBLIC_ENABLE_DEPLOY=true` and open `/deploy` in the app to deploy through your connected wallet on Base Sepolia.

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
- `lib/game-state.ts`: persistence-prep layer wrapping in-memory state
- `lib/session.ts`: HMAC-signed session cookie issuer / verifier
- `lib/auth-nonce.ts`: single-use auth nonces
- `lib/rate-limit.ts`: token-bucket and sliding-window rate limiters
- `lib/logger.ts`: structured JSON logger
- `lib/base.ts`: Base Sepolia chain, client, active contract config
- `lib/color-wars-v1.ts`: typed ABI, bytecode export, pack mappings
- `lib/pixel-purchase-listener.ts`: contract event watcher and duplicate guard
- `lib/burst-listener.ts`: chain watcher that activates burst on confirmed payment
- `app/api/game/*`: route handlers for auth, paint, purchase, burst, claim, and state

## Current assumptions

- Pack purchases are initiated on-chain from the wallet and credited only after the backend sees `PixelsPurchased`.
- Burst is activated only after the backend confirms a `BURST.priceEth` payment to the contract `receive()`. The `/api/game/burst` route is gone (returns 410).
- Reward claim is not implemented on-chain yet; `/api/game/claim` returns 410 to avoid simulating payouts.
- Game state lives in server memory. Restarting the app resets the canvas and round state. `lib/game-state.ts` is the single point to swap in Redis / Postgres later.
- The repo is deployment-ready, but a live Base Sepolia contract address is not baked into source. Set it through `NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS`.
