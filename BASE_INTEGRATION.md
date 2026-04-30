# Base / Farcaster Mini App Integration — Color Wars

This document is a complete record of what was added to the repo to satisfy
Base's "Add Domain" verification on `dashboard.base.org` and the Farcaster
Mini App spec.

Production URL: `https://color-wars-chi.vercel.app`
Base App ID: `69f098e9495d95989c836e2c`
Farcaster custody key (manifest signer): `0x3D9228Fd2c4CFFfb9BD01558e10307A86eA40CB2` (FID 458825)

---

## What Base / the Mini App spec requires

Base's "Add Domain" form on the project page (`dashboard.base.org/apps/{appId}`)
verifies a domain by combining several checks. To pass them all, the production
URL must serve:

1. **A `base:app_id` meta tag** in the homepage `<head>` whose `content` matches the
   project's appId.
2. **A Farcaster Mini App embed** — `<meta name="fc:miniapp">` (and the legacy
   `fc:frame` for backward compat) with a stringified MiniAppEmbed JSON in the
   `<head>`.
3. **Open Graph / Twitter metadata** — `og:title`, `og:description`, `og:image`
   (3:2, ≥600×400, recommended 1200×800), `og:url`, `og:site_name`, `og:type`,
   plus matching `twitter:*` tags.
4. **A signed manifest** at `/.well-known/farcaster.json` containing:
   - `accountAssociation` — `{header, payload, signature}` produced by signing
     a domain claim with the Farcaster custody key. Without this Base treats
     the manifest as unverified.
   - `miniapp` block with: `version: "1"`, `name`, `homeUrl`, `iconUrl` (1:1,
     ≥200×200), `splashImageUrl` (1:1), `splashBackgroundColor`. Plus optional
     `description`, `tagline`, `subtitle`, `screenshotUrls`, `heroImageUrl`,
     `og*` and `primaryCategory` / `tags` for richer listings.
5. **Static assets** referenced from the manifest — `icon.png`, `splash.png`,
   `og.png` — all reachable over HTTPS with `200 OK` and `image/png` content
   type.

---

## What is in the repo (and where)

### `app/layout.tsx` — homepage `<head>` metadata

Uses the Next.js App Router `metadata` and `viewport` exports. The relevant
fields:

```ts
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://color-wars-chi.vercel.app";

const OG_IMAGE = `${SITE_URL}/og.png`;

const miniAppEmbed = JSON.stringify({
  version: "1",
  imageUrl: OG_IMAGE,
  button: {
    title: "Play Color Wars",
    action: {
      type: "launch_miniapp",
      url: SITE_URL,
      name: "Base Color Wars",
      splashImageUrl: OG_IMAGE,
      splashBackgroundColor: "#F0E8D8",
    },
  },
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Base Color Wars",
  description: "...",
  applicationName: "Base Color Wars",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Base Color Wars",
    title: "Base Color Wars",
    description: "...",
    images: [{ url: OG_IMAGE, width: 1200, height: 800, alt: "Base Color Wars" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Color Wars",
    description: "...",
    images: [OG_IMAGE],
  },
  other: {
    "base:app_id": "69f098e9495d95989c836e2c",
    "fc:miniapp": miniAppEmbed,
    "fc:frame": miniAppEmbed,
  },
};

export const viewport: Viewport = { themeColor: "#F0E8D8" };
```

Tags rendered:
- `<meta name="base:app_id" content="69f098e9495d95989c836e2c">`
- `<meta name="fc:miniapp" content="…stringified MiniAppEmbed…">`
- `<meta name="fc:frame"  content="…stringified MiniAppEmbed…">`
- `<meta property="og:title" / og:description / og:url / og:site_name / og:image / og:image:width / og:image:height / og:image:alt / og:type>`
- `<meta name="twitter:card / twitter:title / twitter:description / twitter:image>`
- `<meta name="application-name" content="Base Color Wars">`
- `<meta name="theme-color" content="#F0E8D8">`

### `app/page.tsx` — duplicate `base:app_id` (per Base's instruction text)

```ts
export const metadata: Metadata = {
  other: { "base:app_id": "69f098e9495d95989c836e2c" },
};
```

Next.js merges metadata from layout + page so this is rendered as a single
meta tag. Added because the Base "Verify with meta tag" tooltip suggests
adding it on `app/page.tsx`.

### `app/.well-known/farcaster.json/route.ts` — signed Mini App manifest

Dynamic route that always emits a fresh body and explicitly disables CDN
caching (Vercel was previously serving a stale prerendered manifest):

```ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, no-cache, no-store, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  return NextResponse.json({
    accountAssociation: {
      header:    "eyJmaWQiOjQ1ODgyNSwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDNEOTIyOEZkMmM0Q0ZGZmI5QkQwMTU1OGUxMDMwN0E4NmVBNDBDQjIifQ",
      payload:   "eyJkb21haW4iOiJjb2xvci13YXJzLWNoaS52ZXJjZWwuYXBwIn0",
      signature: "hpzuIRZIgF9SOlnsdv8mfOpeM+d1hMn+QAeiFyIaWZVDO0akBgg1IphokHJPec5lwbzzkRfngm9u6zzaWiCkSBs=",
    },
    miniapp: {
      version: "1",
      name: "Color Wars",
      subtitle: "Pixel territory on Base",
      description: "...",
      iconUrl:    `${SITE_URL}/icon.png`,
      splashImageUrl: `${SITE_URL}/splash.png`,
      splashBackgroundColor: "#F0E8D8",
      homeUrl:    SITE_URL,
      heroImageUrl: `${SITE_URL}/og.png`,
      screenshotUrls: [`${SITE_URL}/og.png`],
      tagline:    "Pixel territory on Base",
      ogTitle:    "Base Color Wars",
      ogDescription: "...",
      ogImageUrl: `${SITE_URL}/og.png`,
      primaryCategory: "games",
      tags: ["game", "pixel", "competitive", "base", "multiplayer"],
    },
  }, { headers: NO_CACHE_HEADERS });
}
```

The `accountAssociation` object was generated via the **Farcaster Manifest
Tool** (Farcaster.xyz → Settings → Developers → Mini Apps) by signing the
payload `{"domain":"color-wars-chi.vercel.app"}` with the user's Farcaster
custody key (FID 458825).

### Static assets in `public/`

- `public/icon.png` — 512×512 (1:1) — used as `iconUrl`.
- `public/splash.png` — 1024×1024 (1:1) — used as `splashImageUrl`.
- `public/og.png` — 1200×800 (3:2) — used as `og:image`,
  `fc:miniapp.imageUrl`, `heroImageUrl`, `screenshotUrls[0]`, `ogImageUrl`.

All three are committed to the repo so Vercel serves them statically with
the correct `image/png` content type.

---

## PR history

| PR | Title | What it added |
|----|-------|---------------|
| #1 | Pacing + cleanup, base:app_id meta tag | First `<meta name="base:app_id">` via `metadata.other` in `app/layout.tsx`. Round duration 15→20 min. README cleanup. |
| #2 | Mini App embed metadata for Base "Add Domain" | `fc:miniapp` + `fc:frame` JSON, full OG + Twitter card stack, hero `public/og.png`. |
| #3 | Farcaster Mini App manifest at `/.well-known/farcaster.json` | First version of the manifest route + `public/icon.png`, `public/splash.png`. |
| #4 | Drop empty `accountAssociation`, add `screenshotUrls` | Removed the placeholder `{header:"",payload:"",signature:""}` (which strict validators reject) and exported `metadata.other.base:app_id` from `app/page.tsx` too. |
| #5 | Manifest force-dynamic + no-store cache headers | Vercel CDN was serving a stale prerendered manifest (`x-vercel-cache: HIT`, `age=949`). Switched the route to dynamic with explicit no-cache headers so future manifest changes go live immediately. |
| #6 | Signed `accountAssociation` + extra OG / theme metadata | Final signed manifest. Added `og:site_name`, `application-name`, `theme-color` (the last via `viewport.themeColor`). |

---

## How to verify the prod state

```sh
# 1. base:app_id meta tag rendered in homepage <head>
curl -s https://color-wars-chi.vercel.app/ | grep -E 'base:app_id|fc:miniapp|og:site_name|theme-color' | wc -l
# expected: 4 lines (one per pattern, fc:miniapp may match twice for fc:frame)

# 2. Manifest serves the signed accountAssociation, no CDN cache
curl -sI https://color-wars-chi.vercel.app/.well-known/farcaster.json | grep -iE 'x-vercel-cache|cache-control'
# expected: x-vercel-cache: MISS|BYPASS, no-store / no-cache in cache-control

curl -s https://color-wars-chi.vercel.app/.well-known/farcaster.json | jq '.accountAssociation.signature'
# expected: a non-empty string ("hpzuIRZ…SBs=")

# 3. All referenced images return 200 + image/png
for u in icon.png splash.png og.png; do
  curl -sI https://color-wars-chi.vercel.app/$u | grep -iE 'HTTP/2|content-type'
done
```

---

## Current state

All requirements that the docs and the form text describe are satisfied on
production. The Base dashboard form `dashboard.base.org/apps/69f098e9495d95989c836e2c`
"Add Domain" still rejects with `web resource must have metadata`, even
though:

- `base:app_id` meta tag matches the project ID.
- All OG / Twitter / `fc:miniapp` tags are present.
- Manifest is signed and reachable.
- Icon / splash / hero images are served with correct content types.
- No Vercel deployment-protection on production.

If the verification keeps failing after redeploy, the next debug avenues are:

- Open the **Configuration** tab inside the project on
  `dashboard.base.org/apps/{appId}` and make sure every field that page
  exposes (name, icon, description, primary category, etc.) is filled in
  via the dashboard UI itself — Base may require the project metadata to be
  complete inside their dashboard *as well as* on the deployed domain.
- Re-fetch the manifest via the Farcaster Manifest Tool to confirm
  Farcaster's own validator considers it valid.
- Reach out to Base Builders Discord with the project's app id and the
  full dashboard error — the form's tooltip is misleadingly generic.

---

## Reusing for a different domain

If the production domain ever changes (e.g. moving from `color-wars-chi.vercel.app`
to a custom domain like `colorwars.gg`):

1. Set `NEXT_PUBLIC_SITE_URL=https://new-domain` in Vercel project env
   (Production + Preview).
2. Re-sign the manifest via the Farcaster Manifest Tool against the new
   domain — `accountAssociation.payload` is bound to the exact domain string
   so the existing one will be rejected.
3. Replace the three strings in `app/.well-known/farcaster.json/route.ts`
   with the new `{header, payload, signature}` and redeploy.
4. Re-submit the "Add Domain" form on `dashboard.base.org` for the new
   domain.
