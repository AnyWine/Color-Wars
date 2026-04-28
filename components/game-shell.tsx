"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useConnect,
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
import { BASE_ENERGY_COST, BURST, PACKS } from "@/lib/game-config";
import type { GameSnapshot, TeamColor } from "@/lib/types";

const NOTIFICATION_LIMIT = 4;

async function postJson<T>(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as T & { ok?: boolean; message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed.");
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
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: targetChain.id });
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const walletAddress = address ?? null;

  const stateQuery = useQuery<GameSnapshot>({
    queryKey: ["game-state", walletAddress],
    queryFn: async () => {
      const params = walletAddress ? `?wallet=${walletAddress}` : "";
      const response = await fetch(`/api/game/state${params}`);
      if (!response.ok) throw new Error("Unable to load game state.");
      return (await response.json()) as GameSnapshot;
    },
    refetchInterval: 1_000,
  });

  const snapshot = stateQuery.data;
  const signedUser = snapshot?.user ?? null;
  const energyValue = signedUser?.energy ?? 0;
  const pixelBalance = signedUser?.pixels ?? 0;
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
      credentials: "same-origin",
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

    try {
      setBusyKey("paint");
      setHasPainted(true);

      if (!signedUser || signedUser.color !== selectedColor) {
        await syncSignedSession(selectedColor, "signin");
      }

      await postJson<{ message: string }>("/api/game/paint", { x, y });
      await refreshState();
    } catch (error) {
      pushNotification({ kind: "system", text: readError(error, "Paint failed.") });
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

      await publicClient.waitForTransactionReceipt({ hash });
      await syncSignedSession(selectedColor, "purchase");
      pushNotification({
        kind: "pixels",
        team: selectedColor,
        text: `Bought +${pack.px} pixels`,
      });
      await refreshState();
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

      if (!signedUser || signedUser.color !== selectedColor) {
        await syncSignedSession(selectedColor, "signin");
      }

      const hash = await sendTransactionAsync({
        to: ACTIVE_CONTRACT,
        value: parseEther(BURST.priceEth),
        chainId: targetChain.id,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      pushNotification({
        kind: "system",
        text: "Burst payment confirmed. Activating shortly…",
      });
      await refreshState();
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
      />

      <WalletConnectModal
        busyConnectorId={busyConnectorId}
        connectors={connectors}
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
              canvas={snapshot?.canvas ?? []}
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
