"use client";

import { useEffect, useState } from "react";

type BottomBarProps = {
  latest: string | null;
};

export function BottomBar({ latest }: BottomBarProps) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");

  return (
    <footer className="bottombar" role="status">
      <span className="bottombar-segment">
        <span className="bottombar-label">SERVER:</span>{" "}
        <span className="bottombar-online">ONLINE</span>
      </span>

      <span className="bottombar-divider" aria-hidden="true">✦</span>

      <span className="bottombar-segment bottombar-latest">
        <span className="bottombar-label">LATEST:</span>{" "}
        <span className="bottombar-latest-text">{latest ?? "Waiting for the first move…"}</span>
      </span>

      <span className="bottombar-spacer" />

      <span className="bottombar-segment bottombar-time">
        {hh}:{mm}:{ss}
      </span>
    </footer>
  );
}
