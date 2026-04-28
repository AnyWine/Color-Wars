import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

import { ACTIVE_CHAIN, ACTIVE_CONTRACT, isContractConfigured } from "@/lib/base";
import { PACK_BY_PIXELS } from "@/lib/color-wars-v1";
import { logger } from "@/lib/logger";
import { ensurePurchaseListener } from "@/lib/pixel-purchase-listener";

type PurchasePayload = {
  walletAddress?: string;
  px?: number;
};

export async function POST(request: NextRequest) {
  try {
    ensurePurchaseListener();

    let body: PurchasePayload;
    try {
      body = (await request.json()) as PurchasePayload;
    } catch {
      return NextResponse.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
    }

    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return NextResponse.json({ ok: false, message: "Valid wallet address is required." }, { status: 400 });
    }
    if (typeof body.px !== "number") {
      return NextResponse.json({ ok: false, message: "Pack size is required." }, { status: 400 });
    }

    const pack = PACK_BY_PIXELS[body.px as keyof typeof PACK_BY_PIXELS];
    if (!pack) {
      return NextResponse.json({ ok: false, message: "Unknown pack." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      mode: "onchain",
      message: isContractConfigured
        ? "Use the frontend wallet flow to buy this pack on Base Sepolia."
        : "Contract is not configured yet. Set NEXT_PUBLIC_COLOR_WARS_V1_ADDRESS after deployment.",
      contractAddress: ACTIVE_CONTRACT ?? null,
      chainId: ACTIVE_CHAIN.id,
      chainName: ACTIVE_CHAIN.name,
      pack: {
        id: pack.id,
        px: pack.px,
        priceEth: pack.priceEth,
      },
    });
  } catch (error) {
    logger.error("purchase_unexpected", { error: (error as Error)?.message });
    return NextResponse.json({ ok: false, message: "Internal error." }, { status: 500 });
  }
}
