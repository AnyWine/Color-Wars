import type { Metadata } from "next";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://color-wars-chi.vercel.app";

const OG_IMAGE = `${SITE_URL}/og.png`;
const TITLE = "Base Color Wars";
const DESCRIPTION =
  "A Base-ready Color Wars MVP with shared canvas, wallet sign-in, energy, burst, rounds, and prize pool logic.";

const miniAppEmbed = JSON.stringify({
  version: "1",
  imageUrl: OG_IMAGE,
  button: {
    title: "Play Color Wars",
    action: {
      type: "launch_miniapp",
      url: SITE_URL,
      name: TITLE,
      splashImageUrl: OG_IMAGE,
      splashBackgroundColor: "#F0E8D8",
    },
  },
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 800,
        alt: "Base Color Wars",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  other: {
    "base:app_id": "69f098e9495d95989c836e2c",
    "fc:miniapp": miniAppEmbed,
    "fc:frame": miniAppEmbed,
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
