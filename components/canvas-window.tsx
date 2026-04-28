"use client";

import { WindowPanel } from "@/components/window-panel";
import { PixelCanvas } from "@/components/pixel-canvas";
import { TeamPicker } from "@/components/team-picker";
import type { TeamColor } from "@/lib/types";

type CanvasWindowProps = {
  canvas: number[];
  paintDisabled: boolean;
  onPaint: (x: number, y: number) => void;
  selectedColor: TeamColor | null;
  showStartHint: boolean;
  onSelectTeam: (team: TeamColor) => void;
  busyTeam: TeamColor | null;
  shakeKey?: number;
};

export function CanvasWindow({
  canvas,
  paintDisabled,
  onPaint,
  selectedColor,
  showStartHint,
  onSelectTeam,
  busyTeam,
  shakeKey = 0,
}: CanvasWindowProps) {
  return (
    <WindowPanel title="CANVAS" tone="green" className="canvas-window" bodyClassName="canvas-window-body">
      <div
        key={shakeKey}
        className={`canvas-stage ${shakeKey > 0 ? "is-shake" : ""}`}
        data-team={selectedColor ?? "none"}
      >
        <PixelCanvas
          canvas={canvas}
          disabled={paintDisabled}
          onPaint={onPaint}
          selectedColor={selectedColor}
        />

        {selectedColor === null ? (
          <TeamPicker busyTeam={busyTeam} onSelect={onSelectTeam} />
        ) : showStartHint ? (
          <div className="canvas-start-hint" aria-hidden="true">
            <p className="canvas-start-hint-title">Tap to start painting</p>
            <p className="canvas-start-hint-sub">Capture territory for your team!</p>
          </div>
        ) : null}
      </div>
    </WindowPanel>
  );
}
