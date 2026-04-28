"use client";

import { PACKS } from "@/lib/game-config";

type MobileActionBarProps = {
  busyPackId: number | null;
  packsDisabled: boolean;
  onBuy: (packId: number) => void;

  burstActive: boolean;
  burstBusy: boolean;
  burstDisabled: boolean;
  burstSecondsLeft: number;
  onBurst: () => void;

  onOpenChat: () => void;
  unreadCount?: number;
};

const PACK_DOTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
};

export function MobileActionBar({
  busyPackId,
  packsDisabled,
  onBuy,
  burstActive,
  burstBusy,
  burstDisabled,
  burstSecondsLeft,
  onBurst,
  onOpenChat,
  unreadCount = 0,
}: MobileActionBarProps) {
  const burstState = burstActive ? "active" : burstBusy ? "busy" : burstDisabled ? "disabled" : "ready";

  return (
    <nav className="m-actionbar" aria-label="Game controls">
      <div className="m-actionbar-section m-actionbar-section--packs">
        <span className="m-actionbar-title">BUY PIXELS</span>
        <div className="m-pack-row">
          {PACKS.map((pack) => {
            const isBusy = busyPackId === pack.id;
            const dots = PACK_DOTS[pack.id] ?? 1;
            return (
              <button
                key={pack.id}
                aria-label={`Buy ${pack.px} pixels for ${pack.priceEth} ETH`}
                className="m-pack"
                disabled={packsDisabled || isBusy}
                onClick={() => onBuy(pack.id)}
                type="button"
              >
                <span className="m-pack-dots" aria-hidden="true">
                  {Array.from({ length: dots }, (_, i) => (
                    <span key={i} className="m-pack-dot" />
                  ))}
                </span>
                <span className="m-pack-amount">{pack.px}</span>
                <span className="m-pack-price">
                  <span className="m-pack-coin" aria-hidden="true">▣</span>
                  {pack.priceEth}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="m-actionbar-section m-actionbar-section--burst">
        <span className="m-actionbar-title">BURST</span>
        <button
          aria-label={burstActive ? `Burst active ${burstSecondsLeft}s` : "Activate burst"}
          className="m-burst"
          data-state={burstState}
          disabled={burstActive || burstBusy || burstDisabled}
          onClick={onBurst}
          type="button"
        >
          <span className="m-burst-icon" aria-hidden="true">⚡</span>
          <span className="m-burst-time">
            {burstActive ? `${burstSecondsLeft.toString().padStart(2, "0")}s` : "60s"}
          </span>
        </button>
      </div>

      <button
        aria-label={unreadCount > 0 ? `Open chat, ${unreadCount} new messages` : "Open chat"}
        className="m-chat-fab"
        onClick={onOpenChat}
        type="button"
      >
        <span aria-hidden="true">💬</span>
        {unreadCount > 0 ? <span className="m-chat-badge">{unreadCount}</span> : null}
      </button>
    </nav>
  );
}
