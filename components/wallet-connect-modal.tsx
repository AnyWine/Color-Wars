"use client";

import { useEffect } from "react";
import type { Connector } from "wagmi";

type WalletConnectModalProps = {
  open: boolean;
  busyConnectorId: string | null;
  connectors: readonly Connector[];
  onClose: () => void;
  onSelect: (connector: Connector) => void;
};

const KNOWN_LABELS: Record<string, string> = {
  metaMaskSDK: "MetaMask",
  metaMask: "MetaMask",
  injected: "Browser Wallet",
  coinbaseWalletSDK: "Coinbase Wallet",
};

function labelFor(connector: Connector) {
  return KNOWN_LABELS[connector.id] ?? connector.name ?? connector.id;
}

export function WalletConnectModal({
  open,
  busyConnectorId,
  connectors,
  onClose,
  onSelect,
}: WalletConnectModalProps) {
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
    <div className="modal" role="dialog" aria-label="Connect wallet" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <header className="modal-header">
          <span>CONNECT WALLET</span>
          <button aria-label="Close" className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-hint">Pick a wallet, then sign to start the session.</p>
          <ul className="connector-list">
            {connectors.map((connector) => {
              const isBusy = busyConnectorId === connector.id;
              return (
                <li key={connector.uid ?? connector.id}>
                  <button
                    className="connector-row"
                    disabled={busyConnectorId !== null}
                    onClick={() => onSelect(connector)}
                    type="button"
                  >
                    <span className="connector-label">{labelFor(connector)}</span>
                    <span className="connector-cta">{isBusy ? "…" : "CONNECT"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
