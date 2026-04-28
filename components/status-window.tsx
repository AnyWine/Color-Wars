"use client";

import { WindowPanel } from "@/components/window-panel";
import { COLORS, MAX_ENERGY } from "@/lib/game-config";
import type { TeamColor } from "@/lib/types";

const TEAM_LABELS: Record<TeamColor, string> = {
  BLUE: "BLUE",
  FUCHSIA: "PINK",
  YELLOW: "YELLOW",
};

const PIXEL_BAR_SEGMENTS = 16;

type StatusWindowProps = {
  energy: number;
  pixels: number;
  team: TeamColor | null;
  onOpenBuy: () => void;
  buyDisabled: boolean;
};

export function StatusWindow({ energy, pixels, team, onOpenBuy, buyDisabled }: StatusWindowProps) {
  const filled = Math.max(
    0,
    Math.min(PIXEL_BAR_SEGMENTS, Math.round((energy / MAX_ENERGY) * PIXEL_BAR_SEGMENTS)),
  );

  return (
    <WindowPanel title="STATUS" tone="purple">
      <div className="status-row">
        <span className="status-label">ENERGY</span>
        <div
          className="energy-bar"
          aria-label={`Energy ${Math.round(energy)} of ${MAX_ENERGY}`}
        >
          {Array.from({ length: PIXEL_BAR_SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={`energy-cell ${index < filled ? "is-on" : ""}`}
            />
          ))}
        </div>
      </div>

      <div className="status-row">
        <span className="status-label">PIXELS</span>
        <div className="status-pixels">
          <span className="status-pixels-value">{pixels.toLocaleString()}</span>
          <button
            aria-label="Buy more pixels"
            className="status-pixels-add"
            disabled={buyDisabled}
            onClick={onOpenBuy}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      <div className="status-row">
        <span className="status-label">TEAM</span>
        <div className="status-team">
          {team ? (
            <>
              <span className="status-team-swatch" style={{ background: COLORS[team] }} />
              <span className="status-team-label">{TEAM_LABELS[team]}</span>
            </>
          ) : (
            <span className="status-team-empty">—</span>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
