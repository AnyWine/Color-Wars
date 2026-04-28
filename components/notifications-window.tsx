"use client";

import { WindowPanel } from "@/components/window-panel";
import type { TeamColor } from "@/lib/types";
import { COLORS } from "@/lib/game-config";

export type NotificationKind = "system" | "burst" | "pixels" | "round";

export type NotificationEntry = {
  id: string;
  kind: NotificationKind;
  text: string;
  team?: TeamColor | null;
};

type NotificationsWindowProps = {
  entries: NotificationEntry[];
};

export function NotificationsWindow({ entries }: NotificationsWindowProps) {
  if (entries.length === 0) return null;

  return (
    <WindowPanel title="NOTIFICATIONS" tone="blue" className="notifications-window">
      <ul className="notification-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`notification notification--${entry.kind}`}>
            <span
              className="notification-dot"
              style={{
                background: entry.team ? COLORS[entry.team] : "#7e6ad9",
              }}
            />
            <span className="notification-text">{entry.text}</span>
          </li>
        ))}
      </ul>
    </WindowPanel>
  );
}
