"use client";

import { WindowPanel } from "@/components/window-panel";

const TIPS: ReadonlyArray<string> = [
  "Buy pixels to paint",
  "Burst doubles your power",
  "The team with most pixels wins!",
];

export function TipsWindow() {
  return (
    <WindowPanel title="TIPS" tone="green" className="tips-window">
      <ol className="tip-list">
        {TIPS.map((tip, index) => (
          <li key={tip}>
            <span className="tip-index">{index + 1}.</span>
            <span>{tip}</span>
          </li>
        ))}
      </ol>
    </WindowPanel>
  );
}
