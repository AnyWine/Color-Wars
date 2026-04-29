import { NextResponse } from "next/server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://color-wars-chi.vercel.app";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, no-cache, no-store, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  return NextResponse.json(
    {
      miniapp: {
        version: "1",
        name: "Color Wars",
        subtitle: "Pixel territory on Base",
        description:
          "Claim pixels on a shared canvas. Defend your team's territory across short rounds — energy gates spam, bursts flip momentum, and the largest team color when the round ends takes the prize pool.",
        iconUrl: `${SITE_URL}/icon.png`,
        splashImageUrl: `${SITE_URL}/splash.png`,
        splashBackgroundColor: "#F0E8D8",
        homeUrl: SITE_URL,
        heroImageUrl: `${SITE_URL}/og.png`,
        screenshotUrls: [`${SITE_URL}/og.png`],
        tagline: "Pixel territory on Base",
        ogTitle: "Base Color Wars",
        ogDescription:
          "Claim pixels, defend your team's territory, and win the prize pool on Base.",
        ogImageUrl: `${SITE_URL}/og.png`,
        primaryCategory: "games",
        tags: ["game", "pixel", "competitive", "base", "multiplayer"],
      },
    },
    { headers: NO_CACHE_HEADERS },
  );
}
