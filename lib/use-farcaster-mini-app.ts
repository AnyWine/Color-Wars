"use client";

import { useEffect, useRef, useState } from "react";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";

type State = {
  isMiniApp: boolean;
  ready: boolean;
};

/**
 * When the page is opened inside a Farcaster Mini App host (Base App,
 * Warpcast, etc.), this hook:
 *   1. Auto-connects the `farcasterMiniApp` wagmi connector — the host
 *      provides an EIP-1193 provider via `@farcaster/miniapp-sdk`, so the
 *      user does not need to pick a wallet from the modal.
 *   2. Calls `sdk.actions.ready()` so the host dismisses its splash screen
 *      and renders the app.
 *
 * Outside a Mini App it is a no-op (`isMiniApp = false`).
 */
export function useFarcasterMiniApp(isWalletConnected: boolean): State {
  const { connectAsync, connectors } = useConnect();
  const [state, setState] = useState<State>({ isMiniApp: false, ready: false });
  const triedConnect = useRef(false);
  const calledReady = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const inMiniApp = await sdk.isInMiniApp();
        if (cancelled) return;
        setState((prev) => ({ ...prev, isMiniApp: inMiniApp }));
        if (!inMiniApp) return;

        if (!isWalletConnected && !triedConnect.current) {
          triedConnect.current = true;
          const farcaster = (connectors as readonly Connector[]).find(
            (c) => c.id === "farcaster",
          );
          if (farcaster) {
            try {
              await connectAsync({ connector: farcaster });
            } catch {
              // host may not have a wallet attached yet — surface nothing,
              // user can still use whatever fallback the modal exposes.
            }
          }
        }

        if (!calledReady.current) {
          calledReady.current = true;
          try {
            await sdk.actions.ready();
          } catch {
            // ready() may throw if called twice or outside a mini app —
            // safe to ignore.
          }
          if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
        }
      } catch {
        // SDK import or detection failed — treat as a regular browser.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectAsync, connectors, isWalletConnected]);

  return state;
}
