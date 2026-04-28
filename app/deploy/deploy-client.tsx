"use client";

import Link from "next/link";
import { useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { deployContract } from "viem/actions";
import { baseSepolia } from "viem/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";

import { COLOR_WARS_V1_ABI, COLOR_WARS_V1_BYTECODE } from "@/lib/color-wars-v1";

const deployPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
});

function formatShort(value?: string | null) {
  if (!value) return "Not available";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function DeployClient() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("Connect a wallet on Base Sepolia to deploy ColorWarsV1.");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { address, chain, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const connectWallet = async (connectorUid: string) => {
    const connector = connectors.find((entry) => entry.uid === connectorUid);
    if (!connector) return;

    try {
      setBusyKey(connectorUid);
      await connectAsync({ connector });
      setMessage("Wallet connected. Switch to Base Sepolia if needed, then deploy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const switchToBaseSepolia = async () => {
    try {
      setBusyKey("switch");
      await switchChainAsync({ chainId: baseSepolia.id });
      setMessage("Switched to Base Sepolia. You can deploy now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Network switch failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeploy = async () => {
    try {
      setBusyKey("deploy");
      setStatus("pending");
      setTxHash(null);
      setDeployedAddress(null);

      if (!walletClient) {
        throw new Error("Wallet not connected");
      }

      if (chain?.id !== baseSepolia.id) {
        throw new Error("Wrong network");
      }

      setMessage("Confirm the deployment transaction in your wallet.");

      const hash = await deployContract(walletClient, {
        abi: COLOR_WARS_V1_ABI,
        bytecode: COLOR_WARS_V1_BYTECODE as Hex,
        args: [],
        chain: baseSepolia,
        account: walletClient.account,
      });

      setTxHash(hash);
      setMessage("Deployment transaction submitted. Waiting for Base Sepolia confirmation.");

      const receipt = await deployPublicClient.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) {
        throw new Error("Deployment confirmed, but contract address was not returned.");
      }

      setDeployedAddress(receipt.contractAddress);
      setStatus("success");
      setMessage("Contract deployed successfully. Copy the address into your app config when you are ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Deployment failed.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Base Sepolia</p>
          <h1>Deploy ColorWarsV1</h1>
          <p className="hero-text">
            This page deploys the purchase contract directly from your browser wallet. No private key in `.env`, no server-side deploy step.
          </p>
        </div>

        <div className="hero-metrics">
          <div className="metric-card">
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          <div className="metric-card">
            <span>Wallet</span>
            <strong>{formatShort(address)}</strong>
          </div>
          <div className="metric-card">
            <span>Network</span>
            <strong>{chain?.id === baseSepolia.id ? baseSepolia.name : "Switch needed"}</strong>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="left-column">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Wallet</p>
                <h2>Connect signer</h2>
              </div>
            </div>

            {!isConnected ? (
              <div className="wallet-buttons">
                {connectors.map((connector) => (
                  <button
                    className="secondary-button"
                    disabled={isConnectPending || busyKey === connector.uid}
                    key={connector.uid}
                    onClick={() => void connectWallet(connector.uid)}
                    type="button"
                  >
                    {busyKey === connector.uid ? "Connecting..." : `Connect ${connector.name}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="wallet-actions">
                <button
                  className="secondary-button"
                  disabled={isSwitching || busyKey === "switch" || chain?.id === baseSepolia.id}
                  onClick={() => void switchToBaseSepolia()}
                  type="button"
                >
                  {chain?.id === baseSepolia.id ? "On Base Sepolia" : "Switch to Base Sepolia"}
                </button>
                <button className="ghost-button" onClick={() => disconnect()} type="button">
                  Disconnect
                </button>
              </div>
            )}

            <p className="status-line">{message}</p>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Deploy</p>
                <h2>Contract action</h2>
              </div>
            </div>

            <div className="wallet-actions">
              <button
                className="primary-button"
                disabled={!walletClient || chain?.id !== baseSepolia.id || busyKey === "deploy"}
                onClick={() => void handleDeploy()}
                type="button"
              >
                {busyKey === "deploy" ? "Deploying..." : "Deploy ColorWarsV1"}
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Tx hash</span>
                <strong>{txHash ? formatShort(txHash) : "Pending none"}</strong>
              </div>
              <div className="stat-card">
                <span>Contract address</span>
                <strong>{deployedAddress ? formatShort(deployedAddress) : "Not deployed yet"}</strong>
              </div>
              <div className="stat-card">
                <span>Full tx hash</span>
                <strong style={{ overflowWrap: "anywhere" }}>{txHash ?? "Not available"}</strong>
              </div>
              <div className="stat-card">
                <span>Full address</span>
                <strong style={{ overflowWrap: "anywhere" }}>{deployedAddress ?? "Not available"}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>What happens next</h2>
              </div>
            </div>

            <p className="note">
              After deployment, the page shows the contract address in local UI state only. It does not write to `.env` or persist the address automatically.
            </p>
            <p className="note">
              When you want the game to start using this contract, manually copy the deployed address into `NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS`.
            </p>
            <div className="wallet-actions">
              <Link className="secondary-button" href="/">
                Back to game
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
