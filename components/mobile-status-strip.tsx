"use client";

import { COLORS, MAX_ENERGY } from "@/lib/game-config";
import type { TeamColor } from "@/lib/types";

const TEAM_LABELS: Record<TeamColor, string> = {
  BLUE: "BLUE",
  FUCHSIA: "PINK",
  YELLOW: "YELLOW",
};

type MobileStatusStripProps = {
  energy: number;
  pixels: number;
  team: TeamColor | null;
};

export function MobileStatusStrip({ energy, pixels, team }: MobileStatusStripProps) {
  const fillPct = Math.max(0, Math.min(100, (energy / MAX_ENERGY) * 100));

  return (
    <div className="m-statusbar" role="status" aria-label="Status">
      <div className="m-statusbar-cell">
        <span className="m-statusbar-label">ENERGY</span>
        <span className="m-statusbar-bar">
          <span
            className="m-statusbar-bar-fill"
            style={{ width: `${fillPct}%` }}
          />
        </span>
      </div>
      <div className="m-statusbar-cell">
        <span className="m-statusbar-label">PIXELS</span>
        <span className="m-statusbar-value">{pixels.toLocaleString()}</span>
        <span className="m-statusbar-coin" aria-hidden="true">▣</span>
      </div>
      <div className="m-statusbar-cell">
        <span className="m-statusbar-label">TEAM</span>
        {team ? (
          <>
            <span
              className="m-statusbar-swatch"
              style={{ background: COLORS[team] }}
            />
            <span className="m-statusbar-value">{TEAM_LABELS[team]}</span>
          </>
        ) : (
          <span className="m-statusbar-value m-statusbar-value-muted">—</span>
        )}
      </div>
    </div>
  );
}
