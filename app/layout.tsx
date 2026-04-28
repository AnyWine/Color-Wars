import type { Metadata } from "next";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Base Color Wars",
  description: "A Base-ready Color Wars MVP with shared canvas, wallet sign-in, energy, burst, rounds, and prize pool logic.",
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
