# Flockbook

A React + TypeScript poultry production prototype with Vite, Recharts, and accessible UI primitives. See [ROADMAP.md](./ROADMAP.md) for the implementation and production roadmap.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm install
npm run dev
```

The overview opens immediately with six months of clearly marked sample records. Open **Demo workspace** in the sidebar for the login page, or visit `/#login`.

Demo credentials: `owner@flockbook.demo` / `demo123`. Demo access deliberately does not provide authentication or access control.

## Features

- Production records: daily laying hens, eggs collected, feed in metric tonnes, damaged eggs, and notes. One production entry per date.
- Customer sales: any number of separate entries per date, with customer name, trays, INR price per tray, optional percentage discount, and notes. Each customer's price is independent.
- Add/edit/delete production and sales records; chronological stock validation includes every sale, even on days without production.
- Current inventory and stock movement, with configurable opening stock and tray size.
- Monthly/quarterly production and feed charts, weighted laying rate, feed per dozen, and recorded-day production comparisons.
- Mobile navigation and responsive layouts; desktop tables scroll horizontally on small screens.
- Local browser persistence, full JSON backup/restore, and separate selected-period production and sales CSV exports.
- Farm settings and a confirmed **Start fresh** flow for an empty pilot workspace.

## Short pilot

In Farm settings, download a backup if needed, choose Start fresh, then set farm name, tray size and opening stock before adding records. Tray size is locked after records exist so historical sales do not change.

Data lives in arrays saved to `localStorage`, under `flockbook.v1`. It is only available in the same browser profile and origin; clearing browser data loses it. A different device, browser, or Vercel preview URL has separate data. Anyone using the same browser can access the workspace. Export backups daily. There is no database, server, password protection, or cross-device synchronization. Use one tab at a time for editing during the pilot.

The current data format is version 2, with independent `records` and `sales` arrays. Existing version 1 browser data and backups are migrated when loaded: each old day's sale becomes one entry named **Previous daily sale**, keeping its quantity and converting the old per-egg price to a per-tray price. Production is retained separately. No customer identity is invented. The original saved data stays intact until a successful save, and new backups contain both arrays.

Sales accept a price **per tray or per egg**. Per-egg prices are multiplied by the farm's eggs-per-tray setting, and the chosen unit is retained when editing or exporting. Switching units clears the price so a fresh rate can be entered. Numeric fields stay blank when cleared and are validated before saving.

Sale total = trays × price per tray × (1 − discount / 100), rounded to the nearest paise for each sale. Inventory subtracts tray quantities regardless of price or discount. Stock is reconciled at the end of each date; intraday transaction times are not tracked. Changing or deleting a production record cannot leave a historical stock deficit.

## Deploy on Vercel

The project is ready for Vercel; no deployment has been created automatically.

1. Push this folder to your Git repository and import it into Vercel.
2. Select **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. Deploy. No environment variables or database are required.

`vercel.json` contains the matching static deployment settings. Use the stable deployment domain throughout the pilot to retain access to the same browser storage.

## Validation

```sh
npm run build
npx tsc --noEmit
node --test lib/farm.test.mjs
```

Domain tests cover inventory reconciliation, chronological shortages, deleting historical production, duplicate/future/invalid dates, invalid backups, reporting boundaries, weighted performance calculations, and seed data. Browser interaction testing has not been performed. Optional WebMCP summary/form-opening tools are feature-detected; no supported WebMCP validation context was available, so those tools are not verified.

## Architecture

- `app/page.tsx`: React workspace, login, records, inventory, reports, and settings.
- `app/globals.css`: shared theme and responsive presentation.
- `lib/farm.mjs`: pure validation and calculation functions, sample arrays.
- `components/ui`: scaffolded accessible primitives.

Future production work should replace browser persistence with a farm-scoped authenticated repository/API, while retaining the pure calculation functions and validation tests. Finance remains a later phase.
