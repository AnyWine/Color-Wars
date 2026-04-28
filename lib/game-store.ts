import {
  BASE_COOLDOWN_CPS_THRESHOLD,
  BREAK_DURATION_MS,
  BURST,
  BURST_DURATION_MS,
  BURST_PIXEL_MULTIPLIER,
  CANVAS_HEIGHT,
  CANVAS_SIZE,
  CANVAS_WIDTH,
  COLOR_TO_ID,
  COOLDOWN_DURATION_MS,
  COOLDOWN_EXIT_ENERGY,
  COOLDOWN_REGEN_PER_SEC,
  ENERGY_REGEN_PER_SEC,
  ID_TO_COLOR,
  MAX_CPS,
  MAX_ENERGY,
  PRIZE_POOL_SHARE,
  ROUND_DURATION_MS,
  TEAM_ORDER,
  TREASURY_SHARE,
  getEnergyCost,
} from "@/lib/game-config";
import { PACK_BY_PIXELS } from "@/lib/color-wars-v1";
import { registerGameStateBackend } from "@/lib/game-state";
import type {
  GameSnapshot,
  PublicUserState,
  RoundState,
  ScoreboardRow,
  TeamColor,
  TeamCounts,
  UserRecord,
} from "@/lib/types";
import type { Hex } from "viem";

type PaintResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type StoreState = {
  round: RoundState;
  canvas: Uint8Array;
  owners: (string | null)[];
  updatedAt: number[];
  users: Map<string, UserRecord>;
};

function createEmptyCounts(): TeamCounts {
  return {
    BLUE: 0,
    FUCHSIA: 0,
    YELLOW: 0,
  };
}

function roundNumber(now: number) {
  return Math.floor(now / (ROUND_DURATION_MS + BREAK_DURATION_MS)) + 1;
}

function createRound(now: number): RoundState {
  return {
    roundId: roundNumber(now),
    startedAt: now,
    endsAt: now + ROUND_DURATION_MS,
    breakEndsAt: null,
    status: "live",
    prizePoolEth: 0,
    treasuryEth: 0,
    teamPixels: createEmptyCounts(),
    teamPlaced: createEmptyCounts(),
    winner: null,
    lastSettledAt: null,
  };
}

function createUser(walletAddress: string, color?: TeamColor): UserRecord {
  const now = Date.now();
  return {
    walletAddress,
    color: color ?? null,
    pixels: 0,
    energy: MAX_ENERGY,
    lastEnergyTickAt: now,
    cooldownUntil: null,
    burstUntil: null,
    totalPlaced: 0,
    roundPlaced: 0,
    recentPaints: [],
    pendingRewardEth: 0,
    claimedRewardEth: 0,
    lastAuthMessage: null,
    createdAt: now,
  };
}

const state: StoreState = {
  round: createRound(Date.now()),
  canvas: new Uint8Array(CANVAS_SIZE),
  owners: Array.from({ length: CANVAS_SIZE }, () => null),
  updatedAt: Array.from({ length: CANVAS_SIZE }, () => 0),
  users: new Map(),
};

function normalizeWallet(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

function pruneRecentPaints(user: UserRecord, now: number) {
  user.recentPaints = user.recentPaints.filter((stamp) => now - stamp < 1_000);
}

function reconcileEnergy(user: UserRecord, now: number) {
  if (now <= user.lastEnergyTickAt) return;

  const regenRate = user.cooldownUntil ? COOLDOWN_REGEN_PER_SEC : ENERGY_REGEN_PER_SEC;
  const elapsedSeconds = (now - user.lastEnergyTickAt) / 1_000;
  const energy = user.energy + elapsedSeconds * regenRate;

  user.energy = Math.min(MAX_ENERGY, Number(energy.toFixed(2)));
  user.lastEnergyTickAt = now;

  if (user.cooldownUntil && now >= user.cooldownUntil && user.energy > COOLDOWN_EXIT_ENERGY) {
    user.cooldownUntil = null;
  }
}

function isBurstActive(user: UserRecord, now: number) {
  if (!user.burstUntil) return false;
  if (now >= user.burstUntil) {
    user.burstUntil = null;
    return false;
  }

  return true;
}

function isCooldownActive(user: UserRecord, now: number) {
  reconcileEnergy(user, now);
  return Boolean(user.cooldownUntil && (now < user.cooldownUntil || user.energy <= COOLDOWN_EXIT_ENERGY));
}

function triggerCooldown(user: UserRecord, now: number, durationMs = COOLDOWN_DURATION_MS) {
  user.cooldownUntil = now + durationMs;
  user.lastEnergyTickAt = now;
}

function snapshotUser(user: UserRecord, now: number): PublicUserState {
  reconcileEnergy(user, now);
  return {
    walletAddress: user.walletAddress,
    color: user.color,
    pixels: user.pixels,
    energy: Number(user.energy.toFixed(2)),
    cooldownUntil: user.cooldownUntil,
    burstUntil: user.burstUntil,
    totalPlaced: user.totalPlaced,
    roundPlaced: user.roundPlaced,
    pendingRewardEth: Number(user.pendingRewardEth.toFixed(6)),
    claimedRewardEth: Number(user.claimedRewardEth.toFixed(6)),
  };
}

function leaderboard(): ScoreboardRow[] {
  return [...state.users.values()]
    .sort((left, right) => {
      if (right.roundPlaced !== left.roundPlaced) {
        return right.roundPlaced - left.roundPlaced;
      }

      return right.totalPlaced - left.totalPlaced;
    })
    .slice(0, 8)
    .map((user) => ({
      walletAddress: user.walletAddress,
      color: user.color,
      roundPlaced: user.roundPlaced,
      totalPlaced: user.totalPlaced,
      pendingRewardEth: Number(user.pendingRewardEth.toFixed(6)),
    }));
}

function resetCanvas() {
  state.canvas = new Uint8Array(CANVAS_SIZE);
  state.owners = Array.from({ length: CANVAS_SIZE }, () => null);
  state.updatedAt = Array.from({ length: CANVAS_SIZE }, () => 0);
}

function startNextRound(now: number) {
  state.round = createRound(now);
  resetCanvas();

  for (const user of state.users.values()) {
    user.roundPlaced = 0;
    user.recentPaints = [];
    user.cooldownUntil = null;
    user.burstUntil = null;
    reconcileEnergy(user, now);
  }
}

function settleRound(now: number) {
  if (state.round.status !== "live" || now < state.round.endsAt) return;

  const counts = state.round.teamPixels;
  const winner = TEAM_ORDER.reduce<TeamColor>((best, current) => {
    return counts[current] > counts[best] ? current : best;
  }, "BLUE");

  state.round.winner = winner;
  state.round.status = "break";
  state.round.breakEndsAt = state.round.endsAt + BREAK_DURATION_MS;
  state.round.lastSettledAt = now;

  const winnerTotalPlaced = state.round.teamPlaced[winner];

  if (winnerTotalPlaced > 0 && state.round.prizePoolEth > 0) {
    for (const user of state.users.values()) {
      if (user.color !== winner || user.roundPlaced === 0) continue;
      const share = user.roundPlaced / winnerTotalPlaced;
      user.pendingRewardEth += state.round.prizePoolEth * share;
    }
  }
}

function syncRound(now = Date.now()) {
  settleRound(now);

  if (state.round.status === "break" && state.round.breakEndsAt && now >= state.round.breakEndsAt) {
    startNextRound(now);
  }
}

function ensureUser(walletAddress: string, color?: TeamColor) {
  const normalized = normalizeWallet(walletAddress);
  const existing = state.users.get(normalized);

  if (existing) {
    if (!existing.color && color) existing.color = color;
    return existing;
  }

  const user = createUser(normalized, color);
  state.users.set(normalized, user);
  return user;
}

function indexForPixel(x: number, y: number) {
  return y * CANVAS_WIDTH + x;
}

function validatePixel(x: number, y: number) {
  return x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT;
}

function addPlacementForUser(user: UserRecord) {
  user.totalPlaced += 1;
  user.roundPlaced += 1;

  if (user.color) {
    state.round.teamPlaced[user.color] += 1;
  }
}

function resolvePaintTargets(x: number, y: number, count: number) {
  const candidates: Array<[number, number]> = [
    [x, y],
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];

  const targets: Array<[number, number]> = [];
  const seen = new Set<string>();

  for (const [nextX, nextY] of candidates) {
    if (!validatePixel(nextX, nextY)) continue;

    const key = `${nextX}:${nextY}`;
    if (seen.has(key)) continue;

    seen.add(key);
    targets.push([nextX, nextY]);

    if (targets.length >= count) break;
  }

  return targets;
}

export const gameStore = {
  authenticate(walletAddress: string, color: TeamColor, message: string) {
    syncRound();
    const user = ensureUser(walletAddress, color);
    user.color = user.color ?? color;
    user.lastAuthMessage = message;
    return snapshotUser(user, Date.now());
  },

  getSnapshot(walletAddress?: string | null): GameSnapshot {
    const now = Date.now();
    syncRound(now);

    const user =
      walletAddress && state.users.has(normalizeWallet(walletAddress))
        ? snapshotUser(state.users.get(normalizeWallet(walletAddress))!, now)
        : null;

    return {
      now,
      round: state.round,
      canvas: [...state.canvas],
      totalUsers: state.users.size,
      user,
      leaderboard: leaderboard(),
      notes: {
        purchases:
          "Pixel packs are credited by a Base Sepolia PixelsPurchased event listener after the transaction is confirmed.",
        burst:
          "Burst is activated after its payment transaction confirms. For 90 seconds each click attempts to place 2 pixels. Use the latest contract build with receive() enabled.",
      },
    };
  },

  paint(walletAddress: string, x: number, y: number): PaintResult {
    const now = Date.now();
    syncRound(now);

    if (state.round.status !== "live") {
      return { ok: false, message: "Round is on break right now." };
    }

    if (!validatePixel(x, y)) {
      return { ok: false, message: "Pixel is outside the canvas." };
    }

    const user = state.users.get(normalizeWallet(walletAddress));
    if (!user) {
      return { ok: false, message: "Sign in with your wallet first." };
    }

    if (!user.color) {
      return { ok: false, message: "Choose a team before painting." };
    }

    reconcileEnergy(user, now);
    pruneRecentPaints(user, now);

    const burstActive = isBurstActive(user, now);

    if (isCooldownActive(user, now)) {
      return { ok: false, message: "Overheated. Cooldown is active while energy refills fast." };
    }

    if (user.pixels <= 0) {
      return { ok: false, message: "You are out of pixels. Buy a pack first." };
    }

    const cps = user.recentPaints.length + 1;
    if (cps > MAX_CPS) {
      return { ok: false, message: `Too fast. Max ${MAX_CPS} clicks per second.` };
    }

    if (cps > BASE_COOLDOWN_CPS_THRESHOLD) {
      triggerCooldown(user, now, COOLDOWN_DURATION_MS);
      return { ok: false, message: "Overheat triggered. Ease off for a few seconds and then jump back in." };
    }

    const energyCost = getEnergyCost(cps);

    if (user.energy < energyCost) {
      return { ok: false, message: "Not enough energy for this click." };
    }

    const pixelsToPaint = Math.min(user.pixels, burstActive ? BURST_PIXEL_MULTIPLIER : 1);
    if (pixelsToPaint <= 0) {
      return { ok: false, message: "You are out of pixels. Buy a pack first." };
    }

    const targets = resolvePaintTargets(x, y, pixelsToPaint);

    user.energy = Number(Math.max(0, user.energy - energyCost).toFixed(2));
    user.pixels -= targets.length;
    user.recentPaints.push(now);

    for (const [targetX, targetY] of targets) {
      const index = indexForPixel(targetX, targetY);
      const previousColorId = state.canvas[index];
      const nextColorId = COLOR_TO_ID[user.color];

      if (previousColorId > 0) {
        const previousColor = ID_TO_COLOR[previousColorId as keyof typeof ID_TO_COLOR];
        state.round.teamPixels[previousColor] -= 1;
      }

      state.canvas[index] = nextColorId;
      state.owners[index] = user.walletAddress;
      state.updatedAt[index] = now;
      state.round.teamPixels[user.color] += 1;
      addPlacementForUser(user);
    }

    return {
      ok: true,
      message: burstActive && targets.length > 1 ? `${targets.length} pixels placed.` : "Pixel placed.",
    };
  },

  creditPurchasedPixels(walletAddress: string, pixels: number, txHash: Hex) {
    const pack = PACK_BY_PIXELS[pixels as keyof typeof PACK_BY_PIXELS];
    if (!pack) {
      return { ok: false, message: "Unknown pack event." as const };
    }

    syncRound();
    const user = ensureUser(walletAddress);
    user.pixels += pack.px;
    const numericPrice = Number(pack.priceEth);
    state.round.prizePoolEth += numericPrice * PRIZE_POOL_SHARE;
    state.round.treasuryEth += numericPrice * TREASURY_SHARE;

    return {
      ok: true,
      message: "Pack credited from contract event.",
      result: {
        kind: "pack" as const,
        packPx: pack.px,
        priceEth: numericPrice,
        txHash,
      },
    };
  },

  activateBurstFromChain(walletAddress: string) {
    const now = Date.now();
    syncRound(now);

    if (state.round.status !== "live") {
      return { ok: false, message: "Burst can only be activated during a live round." as const };
    }

    const user = ensureUser(walletAddress);
    if (isBurstActive(user, now)) {
      return { ok: false, message: "Burst is already active." as const };
    }

    user.burstUntil = now + BURST_DURATION_MS;
    const numericPrice = Number(BURST.priceEth);
    state.round.prizePoolEth += numericPrice * PRIZE_POOL_SHARE;
    state.round.treasuryEth += numericPrice * TREASURY_SHARE;

    return {
      ok: true,
      message: "Burst activated from on-chain payment.",
      result: {
        kind: "burst" as const,
        priceEth: numericPrice,
      },
    };
  },

  /** @internal — exposed only so `lib/game-state.ts` can implement persistence later. */
  __debugRawState() {
    return state;
  },

  claimReward(walletAddress: string) {
    syncRound();
    const user = state.users.get(normalizeWallet(walletAddress));
    if (!user) {
      return { ok: false, message: "Unknown wallet." as const };
    }

    if (user.pendingRewardEth <= 0) {
      return { ok: false, message: "No rewards available yet." as const };
    }

    const amount = Number(user.pendingRewardEth.toFixed(6));
    user.claimedRewardEth += amount;
    user.pendingRewardEth = 0;

    return {
      ok: true,
      message: "Reward claimed.",
      amount,
    };
  },
};

registerGameStateBackend({
  snapshotForPersistence() {
    return {
      round: state.round,
      canvas: Array.from(state.canvas),
      owners: state.owners,
      updatedAt: state.updatedAt,
      users: Array.from(state.users.entries()),
    };
  },
  hydrateFromPersistence() {
    // No-op until a real persistence driver is wired. Implementing this is
    // intentionally deferred to keep the MVP behavior identical.
  },
  getSnapshot(walletAddress?: string | null) {
    return gameStore.getSnapshot(walletAddress ?? null);
  },
});
