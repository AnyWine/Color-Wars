export const COLORS = {
  BLUE: "#0052FF",
  FUCHSIA: "#FF00A8",
  YELLOW: "#FFD600",
} as const;

export const TEAM_ORDER = ["BLUE", "FUCHSIA", "YELLOW"] as const;

export const COLOR_TO_ID = {
  BLUE: 1,
  FUCHSIA: 2,
  YELLOW: 3,
} as const;

export const ID_TO_COLOR = {
  1: "BLUE",
  2: "FUCHSIA",
  3: "YELLOW",
} as const;

export const CANVAS_WIDTH = 200;
export const CANVAS_HEIGHT = 200;
export const CANVAS_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT;

export const PACKS = [
  { id: 1, px: 100, priceEth: "0.0005" },
  { id: 2, px: 500, priceEth: "0.0025" },
  { id: 3, px: 1000, priceEth: "0.005" },
] as const;

export const BURST_DURATION_MS = 60_000;
export const BURST_PIXEL_MULTIPLIER = 2;

export const BURST = {
  priceEth: "0.0015",
} as const;

export const MAX_ENERGY = 120;
export const ENERGY_REGEN_PER_SEC = 3;
export const COOLDOWN_REGEN_PER_SEC = 8;
export const BASE_ENERGY_COST = 0.4;
export const COOLDOWN_DURATION_MS = 4_000;
export const COOLDOWN_EXIT_ENERGY = 40;
export const BASE_COOLDOWN_CPS_THRESHOLD = 9;
export const MAX_CPS = 12;

export const ROUND_DURATION_MS = 20 * 60 * 1000;
export const BREAK_DURATION_MS = 5 * 60 * 1000;

export const PRIZE_POOL_SHARE = 0.3;
export const TREASURY_SHARE = 0.7;

export const EMPTY_PIXEL_COLOR = "#0F172A";
export const GRID_PIXEL_COLOR = "#172036";

export function getEnergyCost(cps: number) {
  if (cps <= 3) return 0.4;
  if (cps <= 5) return 0.7;
  if (cps <= 7) return 1.2;
  if (cps <= 9) return 2;
  return 3;
}
