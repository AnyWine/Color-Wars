"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import type { Connector } from "wagmi";

import { BottomBar } from "@/components/bottom-bar";
import { BurstWindow } from "@/components/burst-window";
import { ChatOverlay } from "@/components/chat-overlay";
import { BuyPixelsWindow } from "@/components/buy-pixels-window";
import { CanvasWindow } from "@/components/canvas-window";
import { ChatWindow } from "@/components/chat-window";
import {
  type NotificationEntry,
  NotificationsWindow,
} from "@/components/notifications-window";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { MobileStatusStrip } from "@/components/mobile-status-strip";
import { StatusWindow } from "@/components/status-window";
import { TipsWindow } from "@/components/tips-window";
import { TopBar } from "@/components/top-bar";
import { WalletConnectModal } from "@/components/wallet-connect-modal";
import { ACTIVE_CONTRACT, ACTIVE_CONTRACT_ABI, isContractConfigured, targetChain } from "@/lib/base";
import { BASE_ENERGY_COST, BURST, CANVAS_WIDTH, COLOR_TO_ID, PACKS } from "@/lib/game-config";
import type { GameSnapshot, PublicUserState, TeamColor } from "@/lib/types";
import { useFarcasterMiniApp } from "@/lib/use-farcaster-mini-app";

const NOTIFICATION_LIMIT = 12;
const STATE_POLL_MS = 2_000;
// Optimistic pixel TTL — long enough for Redis persistence + 2s polling to
// catch up on the next snapshot without the cell blinking out mid-round-trip.
const OPTIMISTIC_PIXEL_TTL_MS = 15_000;

async function postJson<T>(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  const data = (await response.json()) as T & {
    ok?: boolean;
    message?: string;
    diagnostic?: Record<string, unknown>;
  };
  if (!response.ok) {
    const base = data.message ?? "Request failed.";
    // When the server attaches diagnostic info (e.g. auth signature
    // failures), surface a compact summary in the thrown error so it
    // shows up in the on-screen toast — useful when the user has no
    // access to Vercel runtime logs.
    if (data.diagnostic) {
      const summary = JSON.stringify(data.diagnostic).slice(0, 200);
      throw new Error(`${base} (${summary})`);
    }
    throw new Error(base);
  }

  return data;
}

function readError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function GameShell() {
  const [selectedColor, setSelectedColor] = useState<TeamColor | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyTeam, setBusyTeam] = useState<TeamColor | null>(null);
  const [busyPackId, setBusyPackId] = useState<number | null>(null);
  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [latestActivity, setLatestActivity] = useState<string | null>(null);
  const [hasPainted, setHasPainted] = useState(false);
  const [expectedPixelBalance, setExpectedPixelBalance] = useState<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const lastBurstUntilRef = useRef<number | null>(null);
  const lastRoundIdRef = useRef<number | null>(null);
  const lastOutOfPixelsRef = useRef(false);
  const lastOutOfEnergyRef = useRef(false);

  const queryClient = useQueryClient();
  const { address, chainId } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: targetChain.id });
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const walletAddress = address ?? null;

  // Farcaster / Base Mini App auto-connect + ready() handshake. No-op outside
  // of a Mini App. Inside one (e.g. when the user opens the URL through Base
  // App), the wallet auto-connects via the host SDK so the user does not see
  // the wallet picker modal.
  const { isMiniApp } = useFarcasterMiniApp(Boolean(walletAddress));

  const stateQuery = useQuery<GameSnapshot>({
    queryKey: ["game-state", walletAddress],
    queryFn: async () => {
      const params = walletAddress ? `?wallet=${walletAddress}` : "";
      const response = await fetch(`/api/game/state${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load game state.");
      return (await response.json()) as GameSnapshot;
    },
    refetchInterval: STATE_POLL_MS,
    staleTime: STATE_POLL_MS - 200,
    refetchOnWindowFocus: true,
  });

  const snapshot = stateQuery.data;
  const signedUser = snapshot?.user ?? null;

  // Optimistic paint overlay: index -> { colorId, expiresAt }. Painted cells
  // appear instantly on the client and are wiped once the next authoritative
  // server snapshot reflects them (or after the TTL, whichever comes first).
  const [optimisticPixels, setOptimisticPixels] = useState<
    Map<number, { colorId: number; expiresAt: number }>
  >(() => new Map());
  // Optimistic pixel delta, applied locally between the request leaving the
  // client and the server snapshot returning. Reset whenever the server-side
  // user record reflects the new balance.
  const [optimisticPixelsDelta, setOptimisticPixelsDelta] = useState(0);
  const lastServerPixelsRef = useRef<number | null>(null);

  const optimisticCanvas = useMemo(() => {
    if (!snapshot || optimisticPixels.size === 0) return snapshot?.canvas ?? [];
    const next = snapshot.canvas.slice();
    for (const [index, entry] of optimisticPixels) {
      if (index >= 0 && index < next.length) next[index] = entry.colorId;
    }
    return next;
  }, [snapshot, optimisticPixels]);

  // Reconcile optimistic state once the authoritative snapshot reflects it.
  useEffect(() => {
    if (!snapshot) return;

    if (optimisticPixels.size > 0) {
      const now = Date.now();
      let changed = false;
      const next = new Map(optimisticPixels);
      for (const [index, entry] of optimisticPixels) {
        if (snapshot.canvas[index] === entry.colorId || now > entry.expiresAt) {
          next.delete(index);
          changed = true;
        }
      }
      if (changed) setOptimisticPixels(next);
    }

    // Reset the pixel delta whenever the server-side balance has moved (either
    // because our paint landed, or because of a chain credit / refund). This
    // also handles the rollback path: if the server rejected our paint, the
    // server pixels will not have decreased so we still reset the delta to 0.
    const serverPixels = signedUser?.pixels ?? null;
    if (serverPixels !== null && lastServerPixelsRef.current !== serverPixels) {
      lastServerPixelsRef.current = serverPixels;
      if (optimisticPixelsDelta !== 0) setOptimisticPixelsDelta(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const energyValue = signedUser?.energy ?? 0;
  const pixelBalance = Math.max(0, (signedUser?.pixels ?? 0) + optimisticPixelsDelta);
  const burstSecondsLeft =
    signedUser?.burstUntil && snapshot?.now
      ? Math.max(0, Math.ceil((signedUser.burstUntil - snapshot.now) / 1_000))
      : 0;
  const isBurstActive = burstSecondsLeft > 0;
  const canUseGame = Boolean(walletAddress && selectedColor);
  const outOfEnergy = canUseGame && energyValue < BASE_ENERGY_COST;
  const cooldownActive = Boolean(
    signedUser?.cooldownUntil && snapshot?.now && snapshot.now < signedUser.cooldownUntil,
  );

  const timeLeftSeconds = snapshot
    ? Math.max(0, Math.ceil((snapshot.round.endsAt - snapshot.now) / 1_000))
    : 0;
  const roundStatus: "live" | "break" | "loading" = snapshot
    ? snapshot.round.status
    : "loading";
  const totalPlayers = snapshot?.totalUsers ?? 0;

  const pushNotification = useCallback((entry: Omit<NotificationEntry, "id">) => {
    setNotifications((current) => {
      const next: NotificationEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      const merged = [next, ...current];
      return merged.slice(0, NOTIFICATION_LIMIT);
    });
    setLatestActivity(entry.text);
  }, []);

  useEffect(() => {
    if (expectedPixelBalance === null) return;
    if (pixelBalance < expectedPixelBalance) return;
    setExpectedPixelBalance(null);
  }, [expectedPixelBalance, pixelBalance]);

  // Session resume: when wagmi reconnects after a refresh and the server
  // still has a valid signed session for this wallet (cookie TTL 60 min),
  // restore the chosen team locally so the user is dropped straight back
  // into the game without re-signing.
  //
  // Gating on snapshot.sessionActive is critical — /api/game/state also
  // returns user records via the ?wallet= query fallback even when no valid
  // session cookie is present, so without this check we would silently
  // restore selectedColor after disconnect or cookie expiry and trap the
  // user (chooseTeam early-returns once selectedColor is set, so they could
  // never re-sign in).
  useEffect(() => {
    if (selectedColor !== null) return;
    if (!walletAddress) return;
    if (!snapshot?.sessionActive) return;
    const serverColor = signedUser?.color ?? null;
    if (
      serverColor &&
      signedUser?.walletAddress &&
      signedUser.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    ) {
      setSelectedColor(serverColor);
    }
  }, [selectedColor, signedUser, snapshot?.sessionActive, walletAddress]);

  // Burst activation notification
  useEffect(() => {
    const burstUntil = signedUser?.burstUntil ?? null;
    if (burstUntil && burstUntil !== lastBurstUntilRef.current && isBurstActive) {
      lastBurstUntilRef.current = burstUntil;
      pushNotification({
        kind: "burst",
        team: selectedColor,
        text: "Burst activated! Doubled paint for 60s.",
      });
    } else if (!burstUntil) {
      lastBurstUntilRef.current = null;
    }
  }, [isBurstActive, pushNotification, selectedColor, signedUser?.burstUntil]);

  // Round-changed notification
  useEffect(() => {
    if (!snapshot) return;
    const roundId = snapshot.round.roundId;
    if (lastRoundIdRef.current === null) {
      lastRoundIdRef.current = roundId;
      return;
    }
    if (lastRoundIdRef.current !== roundId) {
      lastRoundIdRef.current = roundId;
      pushNotification({
        kind: "round",
        text: `Round ${roundId} ${snapshot.round.status === "live" ? "started" : "ended"}`,
      });
    }
  }, [pushNotification, snapshot]);

  // Out-of-pixels notification (rising edge)
  useEffect(() => {
    if (!signedUser) return;
    const out = pixelBalance === 0 && hasPainted && roundStatus === "live";
    if (out && !lastOutOfPixelsRef.current) {
      lastOutOfPixelsRef.current = true;
      pushNotification({
        kind: "pixels",
        team: selectedColor,
        text: "Out of pixels — buy more to keep painting.",
      });
    } else if (pixelBalance > 0) {
      lastOutOfPixelsRef.current = false;
    }
  }, [hasPainted, pixelBalance, pushNotification, roundStatus, selectedColor, signedUser]);

  const refreshState = async () => {
    await queryClient.invalidateQueries({ queryKey: ["game-state"] });
  };

  const ensureBaseChain = async () => {
    if (chainId === targetChain.id) return true;
    try {
      await switchChainAsync({ chainId: targetChain.id });
      return true;
    } catch (error) {
      pushNotification({ kind: "system", text: readError(error, "Switch chain failed.") });
      return false;
    }
  };

  const syncSignedSession = async (team: TeamColor, reason: "signin" | "purchase" | "burst") => {
    if (!walletAddress) {
      throw new Error("Connect wallet first.");
    }

    const nonceResponse = await fetch(`/api/game/auth/nonce?wallet=${walletAddress}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!nonceResponse.ok) {
      throw new Error("Could not start sign-in.");
    }
    const { nonce } = (await nonceResponse.json()) as { nonce: string };

    const message = `Base Color Wars sign-in\nwallet:${walletAddress}\nteam:${team}\nreason:${reason}\nnonce:${nonce}\ntime:${new Date().toISOString()}`;
    const signature = await signMessageAsync({ message });

    await postJson("/api/game/auth", {
      walletAddress,
      color: team,
      message,
      signature,
    });
  };

  const openConnectModal = () => {
    if (walletAddress) return;
    setConnectModalOpen(true);
  };

  const disconnectWallet = async () => {
    try {
      await disconnectAsync();
    } catch {
      // wagmi sometimes throws if already disconnected — ignore.
    }
    // Drop the server-side session cookie so the next connect requires a
    // fresh signature instead of silently resuming a different account.
    try {
      await fetch("/api/game/auth", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Best-effort logout — even if the server call fails the client-side
      // wallet has already been disconnected, so the user is safe.
    }
    setSelectedColor(null);
    setHasPainted(false);
    lastServerPixelsRef.current = null;
    setOptimisticPixels(new Map());
    setOptimisticPixelsDelta(0);
    await queryClient.invalidateQueries({ queryKey: ["game-state"] });
  };

  const connectWith = async (connector: Connector) => {
    try {
      setBusyConnectorId(connector.id);
      await connectAsync({ connector });
      setConnectModalOpen(false);
    } catch (error) {
      pushNotification({ kind: "system", text: readError(error, "Wallet connection failed.") });
    } finally {
      setBusyConnectorId(null);
    }
  };

  const chooseTeam = async (team: TeamColor) => {
    if (selectedColor !== null) return;

    setSelectedColor(team);

    if (!walletAddress) return;

    try {
      setBusyTeam(team);
      const chainReady = await ensureBaseChain();
      if (!chainReady) return;
      await syncSignedSession(team, "signin");
      await refreshState();
    } catch (error) {
      pushNotification({ kind: "system", text: readError(error, "Team sign-in failed.") });
    } finally {
      setBusyTeam(null);
    }
  };

  const paintPixel = async (x: number, y: number) => {
    if (!walletAddress || !selectedColor) return;

    if (energyValue < BASE_ENERGY_COST || cooldownActive) {
      if (!lastOutOfEnergyRef.current) {
        lastOutOfEnergyRef.current = true;
        pushNotification({
          kind: "system",
          text: cooldownActive ? "Cooling down…" : "No energy",
        });
      }
      setShakeKey((current) => current + 1);
      return;
    }

    lastOutOfEnergyRef.current = false;

    if (pixelBalance <= 0) {
      pushNotification({ kind: "pixels", team: selectedColor, text: "Out of pixels — buy more to keep painting." });
      setShakeKey((current) => current + 1);
      return;
    }

    setHasPainted(true);

    // Optimistic UI: paint the pixel locally before the server confirms. This
    // gets rolled back inside the catch-block (or by the next snapshot) if the
    // server rejects.
    const colorId = COLOR_TO_ID[selectedColor];
    const cellIndex = y * CANVAS_WIDTH + x;
    const expiresAt = Date.now() + OPTIMISTIC_PIXEL_TTL_MS;
    setOptimisticPixels((current) => {
      const next = new Map(current);
      next.set(cellIndex, { colorId, expiresAt });
      return next;
    });
    setOptimisticPixelsDelta((current) => current - 1);

    try {
      setBusyKey("paint");

      // Do NOT re-auth on every paint click. The session cookie set by the
      // initial team sign-in carries the team — the server reads it from the
      // cookie. Wallet signature is requested exactly once at sign-in.
      const result = await postJson<{ message: string; user?: PublicUserState }>(
        "/api/game/paint",
        { x, y },
      );

      // Patch the latest user record straight into the cache (pixels, energy,
      // burstUntil) so the HUD reconciles without waiting for the next poll.
      // Do NOT trigger a full state refetch here — the 2 s polling cycle will
      // pull the new canvas. Refetching on every click adds 200–800 ms of UI
      // delay for no gameplay benefit.
      if (result.user && walletAddress) {
        queryClient.setQueryData<GameSnapshot | undefined>(
          ["game-state", walletAddress],
          (current) => (current ? { ...current, user: result.user! } : current),
        );
        setOptimisticPixelsDelta(0);
        lastServerPixelsRef.current = result.user.pixels;
      }
    } catch (error) {
      // Rollback: drop the optimistic cell and the local pixel delta. The next
      // snapshot will reflect the real server state.
      setOptimisticPixels((current) => {
        if (!current.has(cellIndex)) return current;
        const next = new Map(current);
        next.delete(cellIndex);
        return next;
      });
      setOptimisticPixelsDelta((current) => current + 1);
      pushNotification({ kind: "system", text: readError(error, "Paint failed.") });
      setShakeKey((current) => current + 1);
    } finally {
      setBusyKey(null);
    }
  };

  const buyPack = async (packId: number) => {
    if (!walletAddress || !selectedColor) return;

    const pack = PACKS.find((entry) => entry.id === packId);
    if (!pack) return;

    if (!isContractConfigured || !ACTIVE_CONTRACT) {
      pushNotification({ kind: "system", text: "Contract not configured." });
      return;
    }

    if (!publicClient) {
      pushNotification({ kind: "system", text: "Network not ready." });
      return;
    }

    const chainReady = await ensureBaseChain();
    if (!chainReady) return;

    try {
      setBusyPackId(pack.id);
      setExpectedPixelBalance(pixelBalance + pack.px);

      const hash = await writeContractAsync({
        address: ACTIVE_CONTRACT,
        abi: ACTIVE_CONTRACT_ABI,
        functionName: "buyPixels",
        args: [BigInt(pack.id)],
        value: parseEther(pack.priceEth),
        chainId: targetChain.id,
      });

      // Client-side receipt wait has a timeout so the UI never freezes
      // indefinitely if the RPC is slow or the tx gets stuck. If it times
      // out we still proceed to call the server (which will do its own
      // waitForTransactionReceipt with a 30 s timeout as the authoritative
      // check).
      try {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      } catch {
        /* ignore client-side timeout — server will verify */
      }
      // Do NOT re-sign on purchase. The session cookie from initial sign-in
      // is reused for the server-side verification call below.

      // Server verifies the on-chain receipt (PixelsPurchased event) and
      // returns the updated user with the new pixel balance. Patch into
      // cache directly; full state will catch up on the next 2 s poll.
      const result = await postJson<{ message: string; user?: PublicUserState }>(
        "/api/game/purchase",
        { txHash: hash },
      );
      if (result.user && walletAddress) {
        queryClient.setQueryData<GameSnapshot | undefined>(
          ["game-state", walletAddress],
          (current) => (current ? { ...current, user: result.user! } : current),
        );
        setExpectedPixelBalance(null);
      }

      pushNotification({
        kind: "pixels",
        team: selectedColor,
        text: `Bought +${pack.px} pixels`,
      });
    } catch (error) {
      setExpectedPixelBalance(null);
      pushNotification({ kind: "system", text: readError(error, "Pack purchase failed.") });
    } finally {
      setBusyPackId(null);
    }
  };

  const activateBurst = async () => {
    if (!walletAddress || !selectedColor) return;

    if (!isContractConfigured || !ACTIVE_CONTRACT) {
      pushNotification({ kind: "system", text: "Contract not configured." });
      return;
    }

    if (!publicClient) {
      pushNotification({ kind: "system", text: "Network not ready." });
      return;
    }

    const chainReady = await ensureBaseChain();
    if (!chainReady) return;

    try {
      setBusyKey("burst");

      // Do NOT re-sign on burst. The initial sign-in is enough — burst uses
      // the existing session cookie.
      const hash = await sendTransactionAsync({
        to: ACTIVE_CONTRACT,
        value: parseEther(BURST.priceEth),
        chainId: targetChain.id,
      });

      // Client wait bounded by 30 s so the UI never freezes; server still
      // does its own authoritative waitForTransactionReceipt below.
      try {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      } catch {
        /* ignore client-side timeout — server will verify */
      }

      // Server verifies the on-chain tx and activates burst. The updated user
      // record (with burstUntil) is patched into the cache directly; full
      // state catches up on the next 2 s poll.
      const result = await postJson<{ message: string; user?: PublicUserState }>(
        "/api/game/burst",
        { txHash: hash },
      );
      if (result.user && walletAddress) {
        queryClient.setQueryData<GameSnapshot | undefined>(
          ["game-state", walletAddress],
          (current) => (current ? { ...current, user: result.user! } : current),
        );
      }

      pushNotification({
        kind: "system",
        text: "Burst is live for 60 s — paint hard!",
      });
    } catch (error) {
      pushNotification({ kind: "system", text: readError(error, "Burst activation failed.") });
    } finally {
      setBusyKey(null);
    }
  };

  const isPaintBusy = busyKey === "paint";
  const isBurstBusy = busyKey === "burst";
  const isRoundLive = roundStatus === "live";

  const paintDisabled = !canUseGame || !isRoundLive || isPaintBusy || outOfEnergy || cooldownActive;
  const packsDisabled =
    !canUseGame || !isContractConfigured || !isRoundLive || busyPackId !== null;
  const burstDisabled =
    !canUseGame || !isContractConfigured || !isRoundLive || isBurstBusy;
  const buyShortcutDisabled = packsDisabled;

  return (
    <div className={`os ${isBurstActive ? "is-burst-live" : ""}`} data-team={selectedColor ?? "none"}>
      <TopBar
        roundStatus={roundStatus}
        timeLeftSeconds={timeLeftSeconds}
        players={totalPlayers}
        teamPixels={
          snapshot?.round.teamPixels ?? { BLUE: 0, FUCHSIA: 0, YELLOW: 0 }
        }
        walletAddress={walletAddress}
        walletBusy={isConnectPending || busyConnectorId !== null}
        onConnectWallet={openConnectModal}
        onDisconnectWallet={() => void disconnectWallet()}
      />

      <WalletConnectModal
        busyConnectorId={busyConnectorId}
        connectors={connectors.filter((c) => (isMiniApp ? c.id === "farcaster" : c.id !== "farcaster"))}
        onClose={() => setConnectModalOpen(false)}
        onSelect={(connector) => void connectWith(connector)}
        open={connectModalOpen}
      />

      <main className="os-main">
        <aside className="os-left">
          <StatusWindow
            buyDisabled={buyShortcutDisabled}
            energy={energyValue}
            onOpenBuy={() => {
              const first = PACKS[0]?.id;
              if (typeof first === "number") void buyPack(first);
            }}
            pixels={pixelBalance}
            team={selectedColor}
          />
          <BuyPixelsWindow
            busyPackId={busyPackId}
            disabled={packsDisabled}
            onBuy={(packId) => void buyPack(packId)}
            pixelBalance={pixelBalance}
          />
          <BurstWindow
            active={isBurstActive}
            busy={isBurstBusy}
            disabled={burstDisabled}
            onActivate={() => void activateBurst()}
            secondsLeft={burstSecondsLeft}
          />
        </aside>

        <section className="os-center">
          <MobileStatusStrip
            energy={energyValue}
            pixels={pixelBalance}
            team={selectedColor}
          />
          <div className="os-canvas-wrapper">
            <CanvasWindow
              busyTeam={busyTeam}
              canvas={optimisticCanvas}
              onPaint={(x, y) => void paintPixel(x, y)}
              onSelectTeam={(team) => void chooseTeam(team)}
              paintDisabled={paintDisabled}
              selectedColor={selectedColor}
              shakeKey={shakeKey}
              showStartHint={!hasPainted}
            />
          </div>
          <NotificationsWindow entries={notifications} />
        </section>

        <aside className="os-right">
          <ChatWindow selectedColor={selectedColor} walletAddress={walletAddress} />
          <TipsWindow />
        </aside>
      </main>

      <MobileActionBar
        burstActive={isBurstActive}
        burstBusy={isBurstBusy}
        burstDisabled={burstDisabled}
        burstSecondsLeft={burstSecondsLeft}
        busyPackId={busyPackId}
        onBurst={() => void activateBurst()}
        onBuy={(packId) => void buyPack(packId)}
        onOpenChat={() => setChatOverlayOpen(true)}
        packsDisabled={packsDisabled}
      />

      <ChatOverlay
        onClose={() => setChatOverlayOpen(false)}
        open={chatOverlayOpen}
        selectedColor={selectedColor}
        walletAddress={walletAddress}
      />

      <BottomBar latest={latestActivity} />
    </div>
  );
}
