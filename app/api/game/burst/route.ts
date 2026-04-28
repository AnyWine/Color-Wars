import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "Burst is granted only after the on-chain payment is confirmed.",
    },
    { status: 410 },
  );
}
