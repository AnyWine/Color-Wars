"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CANVAS_HEIGHT, CANVAS_WIDTH, COLORS } from "@/lib/game-config";
import type { TeamColor } from "@/lib/types";

const EMPTY_CELL_COLOR = "#fbf2dc";

const palette: Record<number, string> = {
  0: EMPTY_CELL_COLOR,
  1: COLORS.BLUE,
  2: COLORS.FUCHSIA,
  3: COLORS.YELLOW,
};

type PixelCanvasProps = {
  canvas: number[];
  disabled: boolean;
  onPaint: (x: number, y: number) => void;
  selectedColor: TeamColor | null;
};

type PaintPop = {
  id: number;
  x: number;
  y: number;
  team: TeamColor | null;
};

function hexToRgb(hex: string) {
  const safe = hex.replace("#", "");
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

export function PixelCanvas({ canvas, disabled, onPaint, selectedColor }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const popIdRef = useRef(0);
  const [pops, setPops] = useState<PaintPop[]>([]);

  const colorMap = useMemo(() => {
    return Object.fromEntries(
      Object.entries(palette).map(([id, color]) => [id, hexToRgb(color)]),
    ) as Record<string, { r: number; g: number; b: number }>;
  }, []);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;

    const context = node.getContext("2d");
    if (!context) return;

    const imageData = context.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

    for (let index = 0; index < CANVAS_WIDTH * CANVAS_HEIGHT; index += 1) {
      const value = canvas[index] ?? 0;
      const pixel = colorMap[String(value)] ?? colorMap["0"];
      const offset = index * 4;

      imageData.data[offset] = pixel.r;
      imageData.data[offset + 1] = pixel.g;
      imageData.data[offset + 2] = pixel.b;
      imageData.data[offset + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
  }, [canvas, colorMap]);

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const relativeX = offsetX / rect.width;
    const relativeY = offsetY / rect.height;

    const x = Math.min(CANVAS_WIDTH - 1, Math.max(0, Math.floor(relativeX * CANVAS_WIDTH)));
    const y = Math.min(CANVAS_HEIGHT - 1, Math.max(0, Math.floor(relativeY * CANVAS_HEIGHT)));

    onPaint(x, y);

    popIdRef.current += 1;
    const id = popIdRef.current;
    setPops((current) => [...current, { id, x: offsetX, y: offsetY, team: selectedColor }]);
    window.setTimeout(() => {
      setPops((current) => current.filter((pop) => pop.id !== id));
    }, 220);
  };

  return (
    <>
      <canvas
        aria-label="Color Wars canvas"
        className={`pixel-canvas ${disabled ? "is-disabled" : ""}`}
        data-team={selectedColor ?? "none"}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointer}
        ref={canvasRef}
        width={CANVAS_WIDTH}
      />
      {pops.map((pop) => (
        <span
          key={pop.id}
          aria-hidden="true"
          className="paint-pop"
          data-team={pop.team ?? "none"}
          style={{ left: `${pop.x}px`, top: `${pop.y}px` }}
        />
      ))}
    </>
  );
}
