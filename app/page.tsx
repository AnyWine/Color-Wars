import type { Metadata } from "next";

import { GameShell } from "@/components/game-shell";

export const metadata: Metadata = {
  other: {
    "base:app_id": "69f098e9495d95989c836e2c",
  },
};

export default function Page() {
  return <GameShell />;
}
