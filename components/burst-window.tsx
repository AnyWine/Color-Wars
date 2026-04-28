"use client";

import { WindowPanel } from "@/components/window-panel";

type BurstWindowProps = {
  active: boolean;
  busy: boolean;
  disabled: boolean;
  secondsLeft: number;
  onActivate: () => void;
};

export function BurstWindow({ active, busy, disabled, secondsLeft, onActivate }: BurstWindowProps) {
  const state = active ? "active" : busy ? "busy" : disabled ? "disabled" : "ready";
  const progressPct = active ? Math.max(0, Math.min(100, (secondsLeft / 60) * 100)) : 0;

  return (
    <WindowPanel title="BURST MODE" tone="pink">
      <button
        aria-label={active ? `Burst active ${secondsLeft} seconds left` : "Activate burst"}
        className="burst-cta"
        data-state={state}
        disabled={active || busy || disabled}
        onClick={onActivate}
        type="button"
      >
        <span className="burst-cta-icon" aria-hidden="true">⚡</span>
        <span className="burst-cta-body">
          <span className="burst-cta-title">
            {active ? "BURST ACTIVE" : busy ? "..." : "BURST"}
          </span>
          <span className="burst-cta-time">
            {active ? `${secondsLeft.toString().padStart(2, "0")}s` : "60s"}
          </span>
        </span>
      </button>
      {active ? (
        <div className="burst-progress" aria-hidden="true">
          <span className="burst-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}
      <p className="burst-hint">{active ? "2× pixels per click" : "Doubles your power!"}</p>
    </WindowPanel>
  );
}
