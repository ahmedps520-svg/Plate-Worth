# PlateWorth

A mobile-first Progressive Web App that scans **Saudi license plates** with the phone camera and returns rough, web-grounded estimates of:

- the **vehicle's** used-market price in SAR (low / typical / high), and
- the **plate number's** own value, based on how distinctive it is (repeating digits, sequences, low numbers, letter patterns), with comparable listings.

It uses Anthropic's **Claude** (vision + the server-side **web search** tool) from a small serverless function. Arabic and English UI with full RTL, dark mode by default, installable, and scan history that works offline.

> Estimates are rough AI guesses from online listings, not appraisals or offers. PlateWorth never identifies vehicle owners.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Local setup](#local-setup)
- [Testing the camera on your phone](#testing-the-camera-on-your-phone)
- [Configuration](#configuration)
- [Deploying to Vercel](#deploying-to-vercel)
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
- **Friendly error states**: camera blocked, not found, busy, or insecure; offline; no plate found; rate limited; AI busy or timeout; unexpected answer.
- **PWA**: manifest, icons in every needed size (including maskable and Apple touch), standalone display, offline app shell through the service worker, and an in-app "update available" prompt.

## How it works

```
Phone (PWA)                                  Vercel Function  POST /api/estimate          Anthropic
───────────                                  ─────────────────────────────────           ─────────
camera / upload
  → downscale + plate crop (JPEG, base64)
  → POST JSON ─────────────────────────────▶ validate (zod, size, magic bytes, origin)
                                             per-IP rate limit
                                             Messages API (streaming) ──────────────────▶ Claude + web_search
  ◀── NDJSON: progress, progress, … ◀─────── progress events from the stream ◀────────── (≤5 searches, SA-localized)
  ◀── NDJSON: result ◀────────────────────── JSON → zod validate (retry once) →
                                             keep only source URLs actually seen in search results
save to IndexedDB → result page
```

- **Model**: `CLAUDE_MODEL` (default `claude-sonnet-5-5`), effort `medium`, adaptive thinking.
- **Web search**: `{ type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: { country: "SA", city: "Riyadh", … } }`, with an optional domain allowlist. Set `WEB_SEARCH_TOOL_VERSION=web_search_20260209` to use the newer version with dynamic result filtering.
- **Prompting** (`server/prompt.ts`): the system prompt explains Saudi plate layout and the 17-letter Arabic↔Latin alphabet, never to guess characters, never to identify owners, and always to ground prices in current Saudi listings (Haraj, Syarah, Motory, YallaMotor, plate auctions). It requires a single JSON object as the final answer. The prompt is cached.
- **Validation** (`shared/schema.ts`): the reply is parsed and validated with zod. Harmless formatting is normalized ("85,000", swapped low/high, Arabic-Indic digits); structural problems trigger **one retry** that sends the problems back to Claude.
- **Robustness**: `pause_turn` continuation for long tool loops, a 280 s deadline, a keep-alive ping every 15 s, mapped SDK errors, and server-side refusal fallback (beta) on supported models.

## Local setup

Requirements: **Node.js 20.19+** (22 LTS recommended) and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone <your repo url> plate-worth && cd plate-worth
npm ci
cp .env.example .env        # then set ANTHROPIC_API_KEY
npm run dev
```

Open **https://localhost:5173** and accept the self-signed certificate warning once. `npm run dev` serves the app **and** `/api/estimate` (through a small Vite plugin that runs the same handler Vercel uses), so you don't need the Vercel CLI.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server over HTTPS, exposed on your LAN, with the API |
| `npm run build` | Type-check everything, then build the PWA into `dist/` |
| `npm run preview` | Serve the production build (with the API) to test the service worker |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `npm run lint` | `tsc -b` / oxlint |
| `npm run icons` | Regenerate all PWA icons from `public/favicon.svg` |

> To test the service worker locally, run `DEV_HTTPS=false npm run build && DEV_HTTPS=false npm run preview` and open `http://localhost:4173`. Chrome won't register a service worker from a self-signed HTTPS origin, but plain `localhost` counts as secure.

## Testing the camera on your phone

Browsers only allow camera access on **HTTPS** (or `localhost`), which is why the dev server uses a self-signed certificate.

1. Put your phone and computer on the **same Wi-Fi**.
2. Run `npm run dev` and note the **Network** URL it prints, e.g. `https://192.168.1.20:5173`.
3. Open that URL on the phone:
   - **iPhone (Safari):** tap **Show Details → visit this website → Visit Website**.
   - **Android (Chrome):** tap **Advanced → Proceed to 192.168.x.x (unsafe)**.
4. Accept the first-run notice, tap **Scan a plate**, and allow camera access.

If your network blocks device-to-device traffic, or you want a trusted certificate (needed to test installing the app and offline mode on the phone), use a tunnel instead. With HTTPS off (`DEV_HTTPS=false npm run dev`), run `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173` and open the `https://…` URL it prints. You may need to add that host to `server.allowedHosts` in `vite.config.ts`.

## Configuration

All settings are **server-side environment variables**. Nothing here reaches the browser bundle. See `.env.example` for details.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — (**required**) | Anthropic API key |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Model ID |
| `CLAUDE_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max` |
| `CLAUDE_MAX_TOKENS` | `32000` | Output cap per request (thinking included) |
| `CLAUDE_REFUSAL_FALLBACK` | `auto` | Server-side refusal fallback (beta): `auto` / `on` / `off` |
| `WEB_SEARCH_TOOL_VERSION` | `web_search_20250305` | Or `web_search_20260209` |
| `WEB_SEARCH_MAX_USES` | `5` | Searches per estimate (1–10) |
| `WEB_SEARCH_ALLOWED_DOMAINS` | — | Optional comma-separated allowlist |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | `10` / `600` | Requests per IP per window |
| `MAX_IMAGE_BYTES` | `4194304` | Max decoded size per image |
| `ALLOWED_ORIGINS` | — | Optional comma-separated origin allowlist |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | Optional shared rate limiting across instances |

**Cost:** each scan is usually one Claude request with up to `WEB_SEARCH_MAX_USES` searches (plus one short retry if the JSON is malformed). Web searches are billed per search on top of tokens; see [Anthropic pricing](https://www.anthropic.com/pricing). Lower `WEB_SEARCH_MAX_USES` or `CLAUDE_EFFORT` to cut cost; raise the effort if plate reading isn't accurate enough.

## Deploying to Vercel

The repo deploys as-is: Vercel serves the Vite build from `dist/`, and `api/estimate.ts` becomes the `POST /api/estimate` function (`vercel.json` sets `maxDuration: 300`, security headers, and caching).

**From the dashboard**

1. Push this repo to GitHub and click **Add New → Project** on [vercel.com](https://vercel.com), then import it. The Vite preset and `vercel.json` are picked up automatically.
2. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (and optionally `CLAUDE_MODEL`, `ALLOWED_ORIGINS=https://your-app.vercel.app`, the Upstash variables, …) for Production and Preview.
3. Deploy, then open the URL on your phone.

**From the CLI**

```bash
npm i -g vercel
vercel link
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

Notes:

- A scan with several web searches can take 20–90 s. `maxDuration: 300` relies on **Fluid compute**, which is on by default for new Vercel projects. If your project has it off and you're on the Hobby plan, lower `maxDuration` in `vercel.json` to what your plan allows, and `WEB_SEARCH_MAX_USES` to match.
- The in-memory rate limiter works per function instance. For a public deployment, add a free [Upstash Redis](https://upstash.com) database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to share limits across instances. Setting `ALLOWED_ORIGINS` also helps.
- TypeScript is pinned to **6.0.x** on purpose. Vercel's Node builder loads the project's `typescript` package through its JavaScript API, which TypeScript 7 (the native port) no longer ships.

## Installing the app (iOS and Android)

**iPhone / iPad (Safari)**

1. Open the deployed HTTPS URL in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Launch PlateWorth from the home screen. It runs full-screen; allow the camera when asked.

**Android (Chrome)**

1. Open the URL in **Chrome**.
2. Tap **Install app** when prompted, or **⋮ → Add to Home screen / Install app**.
3. Launch it from the app drawer or home screen. Long-press the icon for the **Scan** and **History** shortcuts.

**Desktop Chrome / Edge:** click the install icon in the address bar.

Once installed, the app shell and your history work offline; scanning needs a connection. When a new version is deployed, the app shows an **Update** prompt.

## API reference

`POST /api/estimate` with `Content-Type: application/json`.

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

**Errors before streaming** return JSON `{ "error": { "code", "message", "retryAfter?", "details?" } }` with status 400 (`bad_request`), 403 (`forbidden_origin`), 405, 413 (`payload_too_large`), 415, 429 (`rate_limited` + `Retry-After`) or 500 (`server_misconfigured`).

## Project structure

```
api/estimate.ts          Vercel Function entry (thin wrapper)
server/
  handler.ts             Request validation, rate limiting, NDJSON streaming
  claude.ts              Claude call: web search, pause_turn, JSON retry, source verification
  prompt.ts              System prompt + per-request user content
  config.ts              Env var parsing
  rateLimit.ts           In-memory sliding window + optional Upstash
  image.ts               Size + magic-byte checks
  vite-dev-api.ts        Serves the handler from `vite dev` / `vite preview`
shared/
  schema.ts              zod schemas: result, requests, stream events
  plate.ts               Saudi plate alphabet, digit/letter normalization
src/
  components/            PlateDisplay, CameraView, PriceRange, LoadingProgress, VehicleEditor, …
  pages/                 Home, Scan, Result, History, Settings
  lib/                   api client, IndexedDB, CSV, formatting, image prep, i18n, router, settings
public/                  Icons (generated), favicon.svg, theme-init.js
```

Tests sit next to the code they cover (`*.test.ts`): JSON validation and normalization, price formatting, CSV export, plate patterns, image crop math, request handling, the Claude loop (with a fake client), and rate limiting.

## Privacy and safety

- Photos are sent to the server only to be forwarded to Anthropic. They are **processed in memory and never stored or logged** on the server. Logs record only metadata (request type, duration, outcome, search count).
- The prompt forbids identifying or looking up owners or any personal data linked to a plate. The app only values the car and the number/letter combination.
- Rate-limit keys are SHA-256 hashes of the client IP, so raw IPs aren't stored, even in Redis.
- A first-run notice explains that images go to an AI service and that results are not appraisals.
- History lives only in the browser's IndexedDB on the device. **Settings → Clear scan history** deletes it.
- Responses use strict security headers (CSP, `Permissions-Policy: camera=(self)`, HSTS, `nosniff`).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Camera needs a secure connection" | Open the app over HTTPS (or `localhost`). On a LAN IP, accept the dev certificate first. |
| "Camera access is blocked" | Allow the camera for the site: iOS **Settings → Safari → Camera**; Android **Chrome → Site settings → Camera**. Or use **Upload a photo**. |
| "Service not set up" | `ANTHROPIC_API_KEY` is missing on the server (`.env` locally, Vercel env vars in production). Redeploy after adding it. |
| "Couldn't read a plate" | Move closer, fill the guide with the plate, avoid glare, hold the phone level. |
| Scans time out on Vercel | Check the function's max duration for your plan, or lower `WEB_SEARCH_MAX_USES` / `CLAUDE_EFFORT`. |
| Phone can't reach the dev server | Same Wi-Fi? Some routers isolate clients: use a tunnel (see above). |
