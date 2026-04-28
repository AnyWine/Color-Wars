"use client";

import { COLORS, TEAM_ORDER } from "@/lib/game-config";
import type { TeamColor } from "@/lib/types";

const TEAM_LABELS: Record<TeamColor, string> = {
  BLUE: "BLUE",
  FUCHSIA: "PINK",
  YELLOW: "YELLOW",
};

type TeamPickerProps = {
  busyTeam: TeamColor | null;
  onSelect: (team: TeamColor) => void;
};

export function TeamPicker({ busyTeam, onSelect }: TeamPickerProps) {
  return (
    <div className="team-picker" role="dialog" aria-label="Choose your team">
      <p className="team-picker-title">Choose your team</p>
      <p className="team-picker-sub">Pick a side to start painting</p>
      <div className="team-picker-buttons">
        {TEAM_ORDER.map((team) => (
          <button
            key={team}
            type="button"
            className="team-picker-button"
            data-team={team}
            disabled={busyTeam !== null}
            onClick={() => onSelect(team)}
            style={{
              ["--team-color" as string]: COLORS[team],
            }}
            aria-label={`Join ${TEAM_LABELS[team]} team`}
          >
            <span className="team-picker-swatch" />
            <span className="team-picker-label">{TEAM_LABELS[team]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
