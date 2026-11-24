# PlateWorth

**Live app:** https://ahmedps520-svg.github.io/Plate-Worth/

A mobile-first Progressive Web App that scans **Saudi license plates** with the phone camera and returns rough, web-grounded estimates of:

- the **vehicle's** used-market price in SAR (low / typical / high), and
- the **plate number's** own value, based on how distinctive it is (repeating digits, sequences, low numbers, letter patterns), with comparable listings.

It uses Anthropic's **Claude** (vision + the server-side **web search** tool). Arabic and English UI with full RTL, dark mode by default, installable, and scan history that works offline.

**Hosting is free and needs no paid server:**

- The **website** is static files on **GitHub Pages**, built and published by GitHub Actions.
- The **backend** is one **ForgeBase** edge function (`estimate`) that holds the Anthropic key. ForgeBase is the self-hosted, Supabase-compatible backend at [forgebase.art](https://forgebase.art).

> Estimates are rough AI guesses from online listings, not appraisals or offers. PlateWorth never identifies vehicle owners.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Going live: the one remaining step](#going-live-the-one-remaining-step)
- [Local setup](#local-setup)
- [Testing the camera on your phone](#testing-the-camera-on-your-phone)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Installing the app (iOS and Android)](#installing-the-app-ios-and-android)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Privacy and safety](#privacy-and-safety)
- [Troubleshooting](#troubleshooting)

## Features

- **Full-screen rear camera** (`getUserMedia`, `facingMode: environment`) with a plate-shaped framing guide, flashlight toggle where supported, and a gallery upload fallback.
- **Client-side image prep**: the full frame is downscaled to ≤1280 px JPEG (q≈0.8) so the car can be identified. When the photo comes from the camera, a second high-resolution crop of the framing guide is added so the plate characters stay legible. Uploads are typically 100–400 KB.
- **Live progress** streamed from the server: "Reading plate…", "Searching the market…" (with the actual search query), then "Estimating values…".
- **Result card**: Saudi-style plate component (white plate, green KSA band, Arabic-Indic and Western digits, Arabic and Latin letters), confidence levels, distinctive-pattern chips, vehicle guess, price ranges with a range bar, the AI's reasoning, tappable source links, and a disclaimer.
- **Correct and re-estimate**: edit make / model / years / color and re-price the vehicle without a new photo. The plate value is kept, since it doesn't depend on the car.
- **History** in IndexedDB (thumbnail, result, timestamp): view, delete, clear, and **export to CSV**. The CSV is UTF-8 with a BOM so Excel shows Arabic correctly, and cells are escaped against formula injection.
- **Arabic / English** with proper RTL, **dark / light** theme, and **optional USD** display at the fixed 3.75 SAR peg.
- **Friendly error states**: camera blocked, not found, busy, or insecure; offline; no plate found; rate limited; daily limit reached; AI busy or timeout; unexpected answer.
- **PWA**: manifest, icons in every needed size (including maskable and Apple touch), standalone display, offline app shell through the service worker, and an in-app "update available" prompt.

## How it works

```
Phone (PWA on GitHub Pages)              ForgeBase edge function "estimate"              Anthropic
───────────────────────────              ──────────────────────────────────              ─────────
camera / upload
  → downscale + plate crop (JPEG, base64)
  → POST JSON + anon key ──────────────▶ gateway: CORS (only the Pages origin), API key
                                         validate (zod, size, magic bytes)
                                         per-IP + daily limits (project database)
                                         Messages API (streaming) ─────────────────────▶ Claude + web_search
  ◀── NDJSON: progress, … ◀───────────── progress events from the stream ◀──────────── (≤5 searches, SA-localized)
  ◀── NDJSON: result ◀────────────────── JSON → zod validate (retry once) →
                                         keep only source URLs actually seen in search results
save to IndexedDB → result page
```

- **Model**: `CLAUDE_MODEL` (default `claude-sonnet-5-5`), effort `medium`, adaptive thinking.
- **Web search**: `{ type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: { country: "SA", city: "Riyadh", … } }`, with an optional domain allowlist. Set `WEB_SEARCH_TOOL_VERSION=web_search_20260209` to use the newer version with dynamic result filtering.
- **Prompting** (`server/prompt.ts`): the system prompt explains Saudi plate layout and the 17-letter Arabic↔Latin alphabet, never to guess characters, never to identify owners, and always to ground prices in current Saudi listings (Haraj, Syarah, Motory, YallaMotor, plate auctions). It requires a single JSON object as the final answer. The prompt is cached.
- **Validation** (`shared/schema.ts`): the reply is parsed and validated with zod. Harmless formatting is normalized ("85,000", swapped low/high, Arabic-Indic digits); structural problems trigger **one retry** that sends the problems back to Claude.
- **Robustness**: `pause_turn` continuation for long tool loops, a 110 s deadline (ForgeBase functions stop at 120 s), a keep-alive ping every 15 s, mapped SDK errors, and server-side refusal fallback (beta) on supported models.

## Going live: the one remaining step

Everything is deployed except the Anthropic key, which only you should handle:

1. Open ForgeBase Studio → project **PlateWorth** → **API & Keys → Env & secrets**.
2. Add `ANTHROPIC_API_KEY` with your key from [console.anthropic.com](https://console.anthropic.com/settings/keys) and tick **secret**.
3. Open https://ahmedps520-svg.github.io/Plate-Worth/ and scan a plate.

Until the key is added, scans show "Service not set up".

## Local setup

Requirements: **Node.js 20.19+** (22 LTS recommended) and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/ahmedps520-svg/Plate-Worth.git && cd Plate-Worth
npm ci
cp .env.example .env        # then set ANTHROPIC_API_KEY
npm run dev
```

Open **https://localhost:5173** and accept the self-signed certificate warning once. `npm run dev` serves the app **and** a local `/api/estimate` that runs the same handler as the ForgeBase function. Local scans therefore use the key in your `.env` and don't touch production.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server over HTTPS, exposed on your LAN, with a local API |
| `npm run build` | Type-check everything, then build the PWA into `dist/` (for GitHub Pages) |
| `npm run preview` | Serve the production build at `http://localhost:4173/Plate-Worth/`. It calls the real ForgeBase function. |
| `npm run build:function` | Bundle the edge function into `forgebase/dist/index.js` |
| `npm run deploy:function` | Bundle and deploy the edge function to ForgeBase (needs `FORGEBASE_MCP_TOKEN`) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `npm run lint` | `tsc -b` / oxlint |
| `npm run icons` | Regenerate all PWA icons from `public/favicon.svg` |

## Testing the camera on your phone

Browsers only allow camera access on **HTTPS** (or `localhost`). The easiest test is the live site on your phone. To test local changes:

1. Put your phone and computer on the **same Wi-Fi**.
2. Run `npm run dev` and note the **Network** URL it prints, e.g. `https://192.168.1.20:5173`.
3. Open that URL on the phone:
   - **iPhone (Safari):** tap **Show Details → visit this website → Visit Website**.
   - **Android (Chrome):** tap **Advanced → Proceed to 192.168.x.x (unsafe)**.
4. Accept the first-run notice, tap **Scan a plate**, and allow camera access.

If your router isolates devices, use a tunnel instead. Run `DEV_HTTPS=false npm run dev`, then `cloudflared tunnel --url http://localhost:5173`, and add the tunnel host to `server.allowedHosts` in `vite.config.ts`.

## Deployment

### Website → GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` (and to the current development branch). It runs the tests, runs `npm run build`, and publishes `dist/` to the **`gh-pages`** branch.

- The build reads **`.env.production`**: the base path `/Plate-Worth/`, the function URL, and ForgeBase's browser-safe **anon** key. These values are public by design. The Anthropic key is never in the website.
- One-time setup: **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / (root)**.
- The app uses hash URLs (`#/history`), so deep links and refreshes work on Pages without rewrites. GitHub Pages can't send custom headers, so the build adds a Content-Security-Policy `<meta>` tag.

### Backend → ForgeBase edge function

The ForgeBase project **PlateWorth** (`bdvrinzgnqrlflonrgiv`) contains:

- the edge function **`estimate`**: `forgebase/estimate.ts` plus `server/` and `shared/`, bundled into one minified file because ForgeBase functions are plain files without npm and are limited to 1 MB per file;
- function timeout **120 s**, with "require API key" on (callers send the anon key);
- API **CORS origins**: `https://ahmedps520-svg.github.io` plus `localhost` for testing. The gateway rejects other origins;
- a `rate_limits` table (RLS on, no policies, so it isn't reachable from apps) and two RPCs that only the service role can call (`plateworth_rate_hit`, `plateworth_rate_cleanup`), which back the per-IP and daily limits;
- **Env & secrets**: `ANTHROPIC_API_KEY` (you add it), plus any optional settings below.

To redeploy after changing server code:

```bash
# Token: ForgeBase Studio → Settings → AI assistants → New token (level "write")
FORGEBASE_MCP_TOKEN=fbmcp_… npm run deploy:function
```

Or paste `forgebase/dist/index.js` (from `npm run build:function`) into **Edge Functions → estimate → index.js** in Studio and press **Deploy**.

## Configuration

Server settings are **environment variables**: in ForgeBase under **API & Keys → Env & secrets** for production, and in `.env` for local dev. None of them reach the browser.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — (**required**) | Anthropic API key (store as a secret) |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Model ID |
| `CLAUDE_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max` |
| `CLAUDE_MAX_TOKENS` | `32000` | Output cap per request (thinking included) |
| `CLAUDE_REFUSAL_FALLBACK` | `auto` | Server-side refusal fallback (beta): `auto` / `on` / `off` |
| `WEB_SEARCH_TOOL_VERSION` | `web_search_20250305` | Or `web_search_20260209` |
| `WEB_SEARCH_MAX_USES` | `5` | Searches per estimate (1–10) |
| `WEB_SEARCH_ALLOWED_DOMAINS` | — | Optional comma-separated allowlist |
| `ESTIMATE_DEADLINE_MS` | `110000` | Time budget per estimate (keep under the 120 s function timeout) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | `10` / `600` | Scans per IP per window |
| `DAILY_SCAN_LIMIT` | `100` | Scans per UTC day for everyone together (`0` = no cap), to protect your bill |
| `MAX_IMAGE_BYTES` | `4194304` | Max decoded size per image |

**Cost:** each scan is usually one Claude request with up to `WEB_SEARCH_MAX_USES` searches (plus one short retry if the JSON is malformed). Web searches are billed per search on top of tokens; see [Anthropic pricing](https://www.anthropic.com/pricing). `DAILY_SCAN_LIMIT` caps the worst case. Lower `WEB_SEARCH_MAX_USES` or `CLAUDE_EFFORT` to cut cost per scan.

## Installing the app (iOS and Android)

**iPhone / iPad (Safari)**

1. Open https://ahmedps520-svg.github.io/Plate-Worth/ in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Launch PlateWorth from the home screen. It runs full-screen; allow the camera when asked.

**Android (Chrome)**

1. Open the link in **Chrome**.
2. Tap **Install app** when prompted, or **⋮ → Add to Home screen / Install app**.
3. Launch it from the app drawer or home screen. Long-press the icon for the **Scan** and **History** shortcuts.

**Desktop Chrome / Edge:** click the install icon in the address bar.

Once installed, the app shell and your history work offline; scanning needs a connection. When a new version is deployed, the app shows an **Update** prompt.

## API reference

`POST https://api.forgebase.art/p/bdvrinzgnqrlflonrgiv/functions/v1/estimate`, sent with `Content-Type: application/json`, `apikey: <anon key>` and `Authorization: Bearer <anon key>`. Locally the same endpoint is `POST /api/estimate`.

**Scan**

```json
{
  "type": "scan",
  "image": { "mediaType": "image/jpeg", "data": "<base64, no data: prefix>" },
  "plateCrop": { "mediaType": "image/jpeg", "data": "<optional base64>" },
  "locale": "en"
}
```

**Re-estimate after a correction (no image)**

```json
{
  "type": "reestimate",
  "plate": { "arabic": "ا ب ح", "latin": "J B A", "digits": "1234", "confidence": "high" },
  "vehicle": { "make": "Toyota", "model": "Camry", "yearRange": "2020–2022", "color": "White" },
  "locale": "ar"
}
```

**Response:** `200` with `application/x-ndjson`, one event per line:

```json
{"type":"progress","stage":"reading"}
{"type":"progress","stage":"searching","detail":"كامري 2021 للبيع"}
{"type":"ping"}
{"type":"progress","stage":"finalizing"}
{"type":"result","result":{ … },"meta":{"model":"claude-sonnet-5-5","searches":3,"durationMs":31840}}
```

The `result` object follows the schema below. Failures after streaming starts arrive as `{"type":"error","code":"…","message":"…"}`.

```ts
{
  plate: { arabic: string, latin: string, digits: string, confidence: "high" | "medium" | "low" },
  vehicle: { make, model, yearRange, color: string, confidence } | null,
  vehiclePriceSAR: { low: number, typical: number, high: number, basis: string } | null,
  plateValueSAR: { low: number, typical: number, high: number, reasoning: string } | null,
  sources: { title: string, url: string }[],
  notes: string
}
```

**Errors before streaming** return JSON `{ "error": { "code", "message", "retryAfter?", "details?" } }` with status 400 (`bad_request`), 405, 413 (`payload_too_large`), 415, 429 (`rate_limited` or `quota_exceeded`, plus `Retry-After`) or 500 (`server_misconfigured`). The ForgeBase gateway itself answers 403 for origins that aren't allowed.

## Project structure

```
.github/workflows/pages.yml   Build + publish to GitHub Pages (gh-pages branch)
forgebase/estimate.ts         ForgeBase edge function entry: handler(req, ctx) → shared handler
scripts/deploy-forgebase.mjs  Deploys the bundled function through ForgeBase's MCP API
server/
  handler.ts                  Request validation, rate limits, NDJSON streaming
  claude.ts                   Claude call: web search, pause_turn, JSON retry, source verification
  prompt.ts                   System prompt + per-request user content
  config.ts                   Env var parsing
  rateLimit.ts                ForgeBase-database limiter + in-memory fallback
  image.ts                    Size + magic-byte checks
  vite-dev-api.ts             Serves the handler at /api/estimate during `npm run dev`
shared/
  schema.ts                   zod schemas: result, requests, stream events
  plate.ts                    Saudi plate alphabet, digit/letter normalization
src/
  components/                 PlateDisplay, CameraView, PriceRange, LoadingProgress, VehicleEditor, …
  pages/                      Home, Scan, Result, History, Settings
  lib/                        API client, IndexedDB, CSV, formatting, image prep, i18n, router, settings
public/                       Icons (generated), favicon.svg, theme-init.js
.env.production               Public build settings for GitHub Pages (base path, function URL, anon key)
```

Tests sit next to the code they cover (`*.test.ts`): JSON validation and normalization, price formatting, CSV export, plate patterns, image crop math, request handling, rate and daily limits, the Claude loop (with a fake client), and the ForgeBase entry.

## Privacy and safety

- Photos go from the phone to the ForgeBase function and on to Anthropic. They are **processed in memory and never stored or logged**; logs record only metadata (request type, duration, outcome, search count).
- The prompt forbids identifying or looking up owners or any personal data linked to a plate. The app only values the car and the number/letter combination.
- Rate-limit keys are SHA-256 hashes of the client IP, so raw IPs aren't stored, not even in the database.
- The Anthropic key exists only in ForgeBase's encrypted secrets. The website carries just the browser-safe anon key, and CORS limits browser calls to the Pages origin.
- A first-run notice explains that images go to an AI service and that results are not appraisals.
- History lives only in the browser's IndexedDB on the device. **Settings → Clear scan history** deletes it.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Service not set up" | `ANTHROPIC_API_KEY` is missing in ForgeBase → PlateWorth → API & Keys → Env & secrets (or in `.env` locally). |
| "Today's scan limit is reached" | The `DAILY_SCAN_LIMIT` cap was hit; it resets at 00:00 UTC. Raise it in Env & secrets if you need more. |
| "Camera needs a secure connection" | Open the app over HTTPS (or `localhost`). On a LAN IP, accept the dev certificate first. |
| "Camera access is blocked" | Allow the camera for the site: iOS **Settings → Safari → Camera**; Android **Chrome → Site settings → Camera**. Or use **Upload a photo**. |
| "Couldn't read a plate" | Move closer, fill the guide with the plate, avoid glare, hold the phone level. |
| The live site shows a 404 | Check that Settings → Pages is set to the `gh-pages` branch and that the "Deploy to GitHub Pages" workflow succeeded. |
| "That took too long" | The 120 s function limit was hit. Lower `WEB_SEARCH_MAX_USES` or `CLAUDE_EFFORT`. |
