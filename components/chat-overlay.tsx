"use client";

import { useEffect } from "react";

import { ChatWindow } from "@/components/chat-window";
import type { TeamColor } from "@/lib/types";

type ChatOverlayProps = {
  open: boolean;
  walletAddress: string | null;
  selectedColor: TeamColor | null;
  onClose: () => void;
};

export function ChatOverlay({ open, walletAddress, selectedColor, onClose }: ChatOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" aria-label="Chat">
      <div className="chat-overlay-backdrop" onClick={onClose} />
      <div className="chat-overlay-sheet">
        <button
          aria-label="Close chat"
          className="chat-overlay-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <ChatWindow selectedColor={selectedColor} walletAddress={walletAddress} />
      </div>
    </div>
  );
}
