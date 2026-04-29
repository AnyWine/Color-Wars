import type { Metadata } from "next";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Base Color Wars",
  description: "A Base-ready Color Wars MVP with shared canvas, wallet sign-in, energy, burst, rounds, and prize pool logic.",
  other: {
    "base:app_id": "69f098e9495d95989c836e2c",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
