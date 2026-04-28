import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { ok: false, message: "Claim is disabled. On-chain reward flow not implemented yet." },
    { status: 410 },
  );
}
