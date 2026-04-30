"use client";

import { useEffect, useRef, useState } from "react";

import { WindowPanel } from "@/components/window-panel";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat-store";
import { COLORS } from "@/lib/game-config";
import type { TeamColor } from "@/lib/types";

type ChatWindowProps = {
  walletAddress: string | null;
  selectedColor: TeamColor | null;
};

const POLL_INTERVAL_MS = 1_500;
const VISIBLE_LIMIT = 20;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatRelative(now: number, timestamp: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function ChatWindow({ walletAddress, selectedColor }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/chat", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages(data.messages);
      } catch {
        /* swallow */
      }
    };

    void load();
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 3_000);
    return () => window.clearTimeout(id);
  }, [error]);

  const canSend = Boolean(walletAddress) && draft.trim().length > 0 && !sending;

  const send = async () => {
    if (!walletAddress) {
      setError("Connect wallet to chat.");
      return;
    }
    const text = draft.trim();
    if (text.length === 0) return;

    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, team: selectedColor, text }),
        credentials: "include",
      });
      const data = (await response.json()) as { ok?: boolean; message?: ChatMessage | string };
      if (!response.ok) {
        const reason = typeof data.message === "string" ? data.message : "Send failed.";
        setError(reason);
        return;
      }
      setDraft("");
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  };

  const visibleMessages = messages.slice(-VISIBLE_LIMIT);

  return (
    <WindowPanel title="CHAT" tone="pink" className="chat-window" bodyClassName="chat-body">
      <div className="chat-list" ref={listRef}>
        {visibleMessages.length === 0 ? (
          <p className="chat-empty">No messages yet.</p>
        ) : (
          visibleMessages.map((message) => {
            const isSystem = message.id.startsWith("system");
            const dotColor = message.team ? COLORS[message.team] : "#7e6ad9";
            return (
              <div key={message.id} className={`chat-line ${isSystem ? "is-system" : ""}`}>
                <span className="chat-dot" style={{ background: dotColor }} />
                <span className="chat-author">
                  {isSystem ? "System" : shortAddress(message.address)}:
                </span>
                <span className="chat-text">{message.text}</span>
                <span className="chat-time" title={new Date(message.timestamp).toLocaleString()}>
                  {formatRelative(now, message.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void send();
        }}
      >
        <input
          aria-label="Chat message"
          className="chat-input"
          disabled={!walletAddress || sending}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={walletAddress ? "Type a message…" : "Connect wallet to chat"}
          type="text"
          value={draft}
        />
        <button
          aria-label="Send message"
          className="chat-send"
          disabled={!canSend}
          type="submit"
        >
          ▶
        </button>
      </form>

      {error ? <div className="chat-error">{error}</div> : null}
    </WindowPanel>
  );
}
