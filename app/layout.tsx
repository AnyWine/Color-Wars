import type { Metadata, Viewport } from "next";

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
  applicationName: TITLE,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: TITLE,
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
  // base:app_id is rendered as a raw <meta> tag in <head> below so Base's
  // verifier sees it as plain HTML at the top of <head>, not as a Next.js-
  // generated metadata node mixed in with the Farcaster JSON embeds.
  other: {
    "fc:miniapp": miniAppEmbed,
    "fc:frame": miniAppEmbed,
  },
};

export const viewport: Viewport = {
  themeColor: "#F0E8D8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Raw Base verification meta — kept outside the Next.js metadata API
          so it renders as plain, unencoded HTML at the top of <head> where
          Base's verifier can parse it without interference from the
          Farcaster JSON embeds that follow.
        */}
        <meta name="base:app_id" content="69f098e9495d95989c836e2c" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
