"use client";

import { COLORS, TEAM_ORDER } from "@/lib/game-config";
import type { TeamCounts } from "@/lib/types";

const TEAM_LABELS: Record<keyof typeof COLORS, string> = {
  BLUE: "BLUE",
  FUCHSIA: "PINK",
  YELLOW: "YELLOW",
};

type TopBarProps = {
  roundStatus: "live" | "break" | "loading";
  timeLeftSeconds: number;
  players: number;
  teamPixels: TeamCounts;
  walletAddress: string | null;
  walletBusy: boolean;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
};

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60).toString().padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TopBar({
  roundStatus,
  timeLeftSeconds,
  players,
  teamPixels,
  walletAddress,
  walletBusy,
  onConnectWallet,
  onDisconnectWallet,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-brand-icon" aria-hidden="true">♥</span>
        <span className="topbar-brand-name">COLOR WARS</span>
        <span className="topbar-controls" aria-hidden="true">
          <span className="dot dot-blue" />
          <span className="dot dot-yellow" />
          <span className="dot dot-pink" />
        </span>
      </div>

      <div className="topbar-stat">
        <span className="topbar-icon" aria-hidden="true">⏱</span>
        <div className="topbar-stat-rows">
          <span>
            <span className="topbar-stat-label">ROUND:</span>{" "}
            <span className={`topbar-stat-value ${roundStatus === "live" ? "is-live" : ""}`}>
              {roundStatus === "live" ? "LIVE" : roundStatus === "break" ? "BREAK" : "…"}
            </span>
          </span>
          <span>
            <span className="topbar-stat-label">TIME LEFT:</span>{" "}
            <span className="topbar-stat-value">{formatTime(timeLeftSeconds)}</span>
          </span>
        </div>
      </div>

      <div className="topbar-stat topbar-stat--inline">
        <span className="topbar-icon" aria-hidden="true">👤</span>
        <span className="topbar-stat-label">PLAYERS:</span>{" "}
        <span className="topbar-stat-value">{players}</span>
      </div>

      <div className="topbar-scores">
        {TEAM_ORDER.map((team) => (
          <div key={team} className="score-chip" data-team={team}>
            <span className="score-chip-swatch" style={{ background: COLORS[team] }} />
            <span className="score-chip-name">{TEAM_LABELS[team]}</span>
            <span className="score-chip-value">{teamPixels[team].toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="topbar-wallet">
        {walletAddress ? (
          <button
            className="wallet-chip wallet-chip--button"
            disabled={walletBusy}
            onClick={onDisconnectWallet}
            title="Click to disconnect"
            type="button"
          >
            <span className="wallet-chip-address">{formatAddress(walletAddress)}</span>
            <span className="wallet-chip-disconnect" aria-hidden="true">×</span>
          </button>
        ) : (
          <button
            className="wallet-connect"
            disabled={walletBusy}
            onClick={onConnectWallet}
            type="button"
          >
            {walletBusy ? "..." : "CONNECT"}
          </button>
        )}
      </div>
    </header>
  );
}
