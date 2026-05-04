import type { COLORS, TEAM_ORDER } from "@/lib/game-config";

export type TeamColor = keyof typeof COLORS;
export type TeamOrder = (typeof TEAM_ORDER)[number];

export type TeamCounts = Record<TeamColor, number>;

export type UserRecord = {
  walletAddress: string;
  color: TeamColor | null;
  pixels: number;
  energy: number;
  lastEnergyTickAt: number;
  cooldownUntil: number | null;
  burstUntil: number | null;
  totalPlaced: number;
  roundPlaced: number;
  recentPaints: number[];
  pendingRewardEth: number;
  claimedRewardEth: number;
  lastAuthMessage: string | null;
  createdAt: number;
};

export type RoundState = {
  roundId: number;
  startedAt: number;
  endsAt: number;
  breakEndsAt: number | null;
  status: "live" | "break";
  prizePoolEth: number;
  treasuryEth: number;
  teamPixels: TeamCounts;
  teamPlaced: TeamCounts;
  winner: TeamColor | null;
  lastSettledAt: number | null;
};

export type PurchaseResult = {
  packPx?: number;
  priceEth: number;
  kind: "pack" | "burst";
};

export type PublicUserState = {
  walletAddress: string;
  color: TeamColor | null;
  pixels: number;
  energy: number;
  cooldownUntil: number | null;
  burstUntil: number | null;
  totalPlaced: number;
  roundPlaced: number;
  pendingRewardEth: number;
  claimedRewardEth: number;
};

export type ScoreboardRow = {
  walletAddress: string;
  color: TeamColor | null;
  roundPlaced: number;
  totalPlaced: number;
  pendingRewardEth: number;
};

export type GameSnapshot = {
  now: number;
  round: RoundState;
  canvas: number[];
  totalUsers: number;
  user: PublicUserState | null;
  sessionActive: boolean;
  leaderboard: ScoreboardRow[];
  notes: {
    purchases: string;
    burst: string;
  };
};
