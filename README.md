# PlateWorth

**Live app:** https://ahmedps520-svg.github.io/Plate-Worth/

A mobile-first Progressive Web App that scans **Saudi license plates** with the phone camera and returns rough, web-grounded estimates of:

- the **vehicle's** used-market price in SAR (low / typical / high), and
- the **plate number's** own value, based on how distinctive it is (repeating digits, sequences, low numbers, letter patterns), with comparable listings.

It uses Anthropic's **Claude** (vision + the server-side **web search** tool). Arabic and English UI with full RTL, dark mode by default, installable, and scan history that works offline.

**No server and nothing to pay for hosting.** The app is static files on GitHub Pages. Each user pastes **their own Anthropic API key** in Settings. The key is saved only in that browser on that device and is sent only to `api.anthropic.com`. Without a key, the app can't scan, so nobody can use your Anthropic credit.

> Estimates are rough AI guesses from online listings, not appraisals or offers. PlateWorth never identifies vehicle owners.

---

## Contents

- [Getting started (using the app)](#getting-started-using-the-app)
- [Features](#features)
- [How it works](#how-it-works)
- [Security of your API key](#security-of-your-api-key)
- [Local development](#local-development)
- [Testing the camera on your phone](#testing-the-camera-on-your-phone)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Installing the app (iOS and Android)](#installing-the-app-ios-and-android)
- [Project structure](#project-structure)
- [Privacy and safety](#privacy-and-safety)
- [Troubleshooting](#troubleshooting)

## Getting started (using the app)

1. Open https://ahmedps520-svg.github.io/Plate-Worth/ on your phone.
2. Create an API key at [console.anthropic.com → API keys](https://console.anthropic.com/settings/keys). Your Anthropic account needs credit.
3. In the app, open **Settings → Anthropic API key**, paste the key, then tap **Save key**. **Check key** confirms it works; this check is free.
4. Go back to **Home → Scan a plate**.

Each scan is billed to your Anthropic account: one Claude request (Claude Sonnet 5.5) with up to 5 web searches, usually a few cents. You can **Replace** or **Remove** the key at any time in Settings.

## Features

- **Full-screen rear camera** (`getUserMedia`, `facingMode: environment`) with a plate-shaped framing guide, flashlight toggle where supported, and a gallery upload fallback.
- **Client-side image prep**: the full frame is downscaled to ≤1280 px JPEG (q≈0.8) so the car can be identified. When the photo comes from the camera, a second high-resolution crop of the framing guide is added so the plate characters stay legible.
- **Live progress** from Claude's stream: "Reading plate…", "Searching the market…" (with the actual search query), then "Estimating values…".
- **Result card**: Saudi-style plate component (white plate, green KSA band, Arabic-Indic and Western digits, Arabic and Latin letters), confidence levels, distinctive-pattern chips, vehicle guess, price ranges with a range bar, the AI's reasoning, tappable source links, and a disclaimer.
- **Correct and re-estimate**: edit make / model / years / color and re-price the vehicle without a new photo. The plate value is kept.
- **History** in IndexedDB (thumbnail, result, timestamp): view, delete, clear, and **export to CSV**. The CSV is UTF-8 with a BOM for Arabic in Excel, and cells are escaped against formula injection.
- **Arabic / English** with proper RTL, **dark / light** theme, and **optional USD** display at the fixed 3.75 SAR peg.
- **Friendly error states**: no key yet, key rejected, camera blocked, not found, busy, or insecure; offline; no plate found; Anthropic rate limit, busy, or error (with Anthropic's own message, e.g. low credit); timeout; unexpected answer.
- **PWA**: manifest, icons in every needed size (including maskable and Apple touch), standalone display, offline app shell through the service worker, and an "update available" prompt.

## How it works

```
Phone (PWA on GitHub Pages)                                        Anthropic API
───────────────────────────                                        ─────────────
Settings: your API key → localStorage (this device only)
camera / upload → downscale + plate crop (JPEG, base64)
Messages API, streaming, with your key ──────────────────────────▶ Claude Sonnet 5.5
  (anthropic-dangerous-direct-browser-access: true)                + web_search (≤5, SA-localized)
progress from the stream ◀──────────────────────────────────────── server_tool_use / results / text
final JSON → zod validation (one retry if malformed)
keep only source URLs that actually appeared in the search results
save to IndexedDB → result page
```

- **SDK**: the official `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`. It is loaded only when you scan or check a key, which keeps the app shell small.
- **Model**: `claude-sonnet-5-5`, effort `medium`, adaptive thinking (`src/lib/claude/config.ts`).
- **Web search**: `{ type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: { country: "SA", city: "Riyadh", … } }`.
- **Prompting** (`src/lib/claude/prompt.ts`): the prompt explains Saudi plate layout and the 17-letter Arabic↔Latin alphabet, says never to guess characters and never to identify owners, and requires prices grounded in current Saudi listings (Haraj, Syarah, Motory, YallaMotor, plate auctions). The final answer must be a single JSON object. The system prompt is cached.
- **Validation** (`shared/schema.ts`): harmless formatting is normalized ("85,000", swapped low/high, Arabic-Indic digits); structural problems trigger **one retry** that sends the problems back to Claude.
- **Robustness**: `pause_turn` continuation, a 180 s time budget, two automatic SDK retries, mapped SDK errors, and server-side refusal fallback (beta).

## Security of your API key

- The key is stored in this browser's `localStorage` on this device only. It is never put in the code, never in the URL, and never in your scan history or CSV exports. It is sent only to `api.anthropic.com`.
- The page's Content-Security-Policy only allows scripts from the site itself and network calls to the site and `api.anthropic.com`.
- **Good to know:** browser storage is shared by every page on the same origin. All of your GitHub Pages sites live on `ahmedps520-svg.github.io`, so code on your *other* Pages sites (e.g. `/alfikralsaad`) could technically read it. Only publish code you trust there, or use a separate Anthropic key with a spend limit for PlateWorth. Setting a **monthly spend limit** in the Anthropic Console is a good idea in any case.
- Anyone who can unlock your phone and open the app can scan with your key. Use **Remove key** on shared devices.

## Local development

Requirements: **Node.js 20.19+** (22 LTS recommended).

```bash
git clone https://github.com/ahmedps520-svg/Plate-Worth.git && cd Plate-Worth
npm ci
npm run dev
```

Open **https://localhost:5173**, accept the self-signed certificate warning once, and paste your API key in Settings, just as on the live site.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server over HTTPS, exposed on your LAN |
| `npm run build` | Type-check everything, then build the PWA into `dist/` (base path `/Plate-Worth/`) |
| `npm run preview` | Serve the production build at `http://localhost:4173/Plate-Worth/` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `npm run lint` | `tsc -b` / oxlint |
| `npm run icons` | Regenerate all PWA icons from `public/favicon.svg` |

## Testing the camera on your phone

Browsers only allow camera access on **HTTPS** (or `localhost`). The easiest test is the live site. To test local changes:

1. Put your phone and computer on the **same Wi-Fi**.
2. Run `npm run dev` and note the **Network** URL it prints, e.g. `https://192.168.1.20:5173`.
3. Open that URL on the phone:
   - **iPhone (Safari):** tap **Show Details → visit this website → Visit Website**.
   - **Android (Chrome):** tap **Advanced → Proceed to 192.168.x.x (unsafe)**.
4. Accept the first-run notice, add your key in Settings, tap **Scan a plate**, and allow camera access.

If your router isolates devices, run `DEV_HTTPS=false npm run dev` plus `cloudflared tunnel --url http://localhost:5173`, and add the tunnel host to `server.allowedHosts` in `vite.config.ts`.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main` (and to the current development branch). It runs the tests, runs `npm run build`, and publishes `dist/` to the **`gh-pages`** branch, which GitHub Pages serves.

- The build reads **`.env.production`**, which only sets the base path `/Plate-Worth/`. There are no secrets anywhere in the repo or the build.
- Pages is configured under **Settings → Pages → Deploy from a branch → `gh-pages` / (root)**. This is already done.
- The app uses hash URLs (`#/history`), so refreshes and deep links work on Pages without rewrites. GitHub Pages can't send custom headers, so the build adds a Content-Security-Policy `<meta>` tag.

## Installing the app (iOS and Android)

**iPhone / iPad (Safari)**

1. Open https://ahmedps520-svg.github.io/Plate-Worth/ in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Launch PlateWorth from the home screen and add your key in Settings. On iOS, the installed app has its own storage, separate from Safari, so add the key inside the installed app.

**Android (Chrome)**

1. Open the link in **Chrome**.
2. Tap **Install app** when prompted, or **⋮ → Add to Home screen / Install app**.
3. Launch it from the app drawer or home screen. Long-press the icon for the **Scan** and **History** shortcuts.

**Desktop Chrome / Edge:** click the install icon in the address bar.

Once installed, the app shell and your history work offline; scanning needs a connection. When a new version is deployed, the app shows an **Update** prompt.

## Project structure

```
.github/workflows/pages.yml   Build + publish to GitHub Pages (gh-pages branch)
shared/
  schema.ts                   zod schemas: result, requests, error codes
  plate.ts                    Saudi plate alphabet, digit/letter normalization
src/
  lib/claude/                 Claude call (web search, pause_turn, JSON retry, source checks), prompt, config
  lib/api.ts                  Runs an estimate with the user's key; key check (lazy-loaded)
  lib/settings.tsx            Language, theme, USD, and the device-only API key
  lib/                        IndexedDB history, CSV, formatting, image prep, i18n, router, scan session
  components/                 ApiKeyCard, PlateDisplay, CameraView, PriceRange, LoadingProgress, …
  pages/                      Home, Scan, Result, History, Settings
public/                       Icons (generated), favicon.svg, theme-init.js
.env.production               Base path for GitHub Pages
```

Tests sit next to the code they cover (`*.test.ts`): JSON validation and normalization, price formatting, CSV export, plate patterns, image crop math, the Claude loop (with a fake client), the browser API client (key handling and error mapping), and the re-estimate merge.

## Privacy and safety

- Photos go **directly from your device to Anthropic** to read the plate and look up prices. PlateWorth has no server, so nothing is stored anywhere else.
- The prompt forbids identifying or looking up owners or any personal data linked to a plate. The app only values the car and the number/letter combination.
- A first-run notice explains that images go to an AI service with your own key and that results are not appraisals.
- Your key and history live only on your device. **Settings → Remove key** and **Settings → Clear scan history** delete them.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Add your API key" | Open **Settings → Anthropic API key** and paste a key from console.anthropic.com. |
| "API key not accepted" | The key was revoked or mistyped. Use **Replace key**, then **Check key**. |
| "Anthropic returned an error" | Read the grey message under it. Low credit is the most common cause; top up in the Anthropic Console. |
| "Slow down a little" | Your key hit Anthropic's rate limit. Wait the time shown. |
| "Camera access is blocked" | Allow the camera for the site: iOS **Settings → Safari → Camera**; Android **Chrome → Site settings → Camera**. Or use **Upload a photo**. |
| "Couldn't read a plate" | Move closer, fill the guide with the plate, avoid glare, hold the phone level. |
| Key "disappeared" on iPhone | The home-screen app and Safari keep separate storage. Add the key in the one you use. |
