"use client";

import type { ReactNode } from "react";

type WindowPanelProps = {
  title: string;
  tone: "purple" | "orange" | "pink" | "green" | "blue" | "cream";
  className?: string;
  bodyClassName?: string;
  rightSlot?: ReactNode;
  showControls?: boolean;
  children: ReactNode;
};

export function WindowPanel({
  title,
  tone,
  className = "",
  bodyClassName = "",
  rightSlot,
  showControls = true,
  children,
}: WindowPanelProps) {
  return (
    <section className={`win win--${tone} ${className}`.trim()} role="group" aria-label={title}>
      <header className="win-header">
        <span className="win-title">{title}</span>
        <span className="win-header-spacer" />
        {rightSlot}
        {showControls ? (
          <span className="win-controls" aria-hidden="true">
            <span className="win-ctrl">_</span>
            <span className="win-ctrl">▢</span>
            <span className="win-ctrl">×</span>
          </span>
        ) : null}
      </header>
      <div className={`win-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
