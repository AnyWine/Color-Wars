"use client";

import { WindowPanel } from "@/components/window-panel";
import { PACKS } from "@/lib/game-config";

type BuyPixelsWindowProps = {
  busyPackId: number | null;
  disabled: boolean;
  pixelBalance: number;
  onBuy: (packId: number) => void;
};

function packCost(priceEth: string) {
  const value = Number.parseFloat(priceEth);
  if (Number.isNaN(value)) return "";
  return value.toFixed(4);
}

export function BuyPixelsWindow({ busyPackId, disabled, pixelBalance, onBuy }: BuyPixelsWindowProps) {
  return (
    <WindowPanel title="BUY PIXELS" tone="orange">
      <p className="hint">Use pixels to paint the map</p>

      <div className="pack-list">
        {PACKS.map((pack) => {
          const isBusy = busyPackId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              className="pack-row"
              disabled={disabled || isBusy}
              onClick={() => onBuy(pack.id)}
              aria-label={`Buy ${pack.px} pixels for ${pack.priceEth} ETH`}
            >
              <span className="pack-row-amount">
                <span className="pack-row-value">{pack.px}</span>
                <span className="pack-row-unit">px</span>
              </span>
              <span className="pack-row-price">
                {isBusy ? "…" : packCost(pack.priceEth)}
                <span className="coin" aria-hidden="true">●</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="muted">
        You have: <strong>{pixelBalance.toLocaleString()}</strong> pixels
      </p>
    </WindowPanel>
  );
}
