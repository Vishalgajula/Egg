# Flockbook build plan

Phases are ordered so each one leaves the repo green (`npm run verify` passes)
and shippable. Do not start a phase before the one above it is complete.

Read [REQUIREMENTS.md](./REQUIREMENTS.md) first — it defines the data model
every phase below refers to. Agent working rules are in
[../AGENTS.md](../AGENTS.md).

---

## Where the code stands today

Already built and passing (26 domain tests):

| File                | State                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `lib/farm.mjs`      | v3 single-flock model, migrations v1 to v2 to v3, `flockLedger`, mortality |
| `lib/repository.ts` | `localRepository` + `cloudRepository`, diff-based Firestore writes         |
| `lib/firebase.ts`   | Lazy init from `VITE_FIREBASE_*`, offline persistence                      |
| `hooks/use-auth.ts` | Sign in / up / out / reset, readable error messages                        |
| `firestore.rules`   | Farm-scoped isolation, owner/editor/viewer roles                           |
| `app/page.tsx`      | Repository wired, Flock health view, mortality fields                      |

**The single-flock model in `lib/farm.mjs` is superseded by v4.** Do not build
new features on it.

---

## Phase 0 — Clean baseline — **DONE**

**Goal:** nothing unused, nothing half-wired, one command proves it.

1. ~~Finish the auth wiring~~ — login form uses `submitCredentials`, with a
   sign-in / sign-up toggle, a boot screen while auth settles and the farm
   loads, a load-failure screen with retry, and a cloud/offline sync badge in
   the top bar.
2. ~~Delete everything in REQUIREMENTS section 6~~ — 48 of 60 `components/ui`
   files removed (transitive closure from the real entry points; 12 remain),
   12 dependencies uninstalled, `.openai/` removed, `useFarmTools` and
   `totals().revenue` deleted.
3. ~~Drop `@cloudflare/workers-types` and `vinext/types` from `tsconfig.json`~~
   — now `["node", "vite/client"]`.
4. ~~Add a `verify` script~~ — `npm run verify`.

Also fixed, since `oxlint` turned out to be failing on the original commit:
`hooks/use-mobile.ts` now reads the viewport through `useSyncExternalStore`
instead of mirroring it into state with an effect, and the farm load effect no
longer calls `setState` synchronously.

**Verified:** `npm run verify` passes — typecheck, lint, 26/26 domain tests,
production build. Not verified: browser interaction, and real Firebase sign-in
(no project configured yet).

**Carried forward:** the production bundle is 1.42 MB (425 KB gzipped), mostly
Firebase and Recharts. Phase 4 should route-split it before shipping to phones.

---

## Phase 1 — Domain remodel to v4 — **DONE**

**Highest-value phase and the one to get right.** All of it is pure functions
over plain objects, fully testable with `node --test`, no React and no network.

Create `lib/sheds.mjs` and `lib/units.mjs`; keep `lib/farm.mjs` for the
migration chain only.

### 1a. Units (`lib/units.mjs`)

```
toEggs({ qty, unit }, traySize) -> int
fromEggs(eggs, unit, traySize)  -> { qty, unit }
toMinor(rupees) -> int paise
saleAmountMinor(sale, traySize) -> { grossMinor, netMinor, discountMinor }
```

Integer arithmetic only. One rounding on gross, one on net (REQUIREMENTS 4).

### 1b. Shed model (`lib/sheds.mjs`)

```
SHED_STAGES, NOT_PRODUCING_REASONS, LAYING_STAGES
validateShed(shed)
flockLedger(data, shedId)     -> [{ date, added, deaths, strength, counted, variance }]
eggLedger(data, shedId)       -> [{ date, eggs, damaged, sold, balance }]
shedTotals(data, shedId, records)
farmTotals(data, records)     -> rollup, laying-only laying rate
alerts(data)                  -> [{ severity, shedId, message }]
```

### 1c. Validation (`validateData` in `lib/farm.mjs`)

Every rule in REQUIREMENTS section 5. Each rejection needs its own test and a
message a farm worker can act on.

### 1d. Migration v3 to v4

A v3 farm becomes a **single shed** named "Main shed":

- `capacity` = highest `birds` ever recorded, rounded up to the next 100
- `openingBirds` = v3 `settings.openingBirds`, `openingEggs` = `settings.openingStock`
- `stage` = `production`, `placedOn` = null
- Every record gains `shedId` and `stage: 'production'`
- Sale `trays` becomes `eggs = trays * traySize`, `entry = { qty: trays, unit: 'tray' }`
- Sale `pricePerTray` becomes `unitPriceMinor = round(pricePerTray * 100)`, `priceUnit: 'tray'`

**Done when:** the migration is round-trip tested against `seedData()`, every
rule in section 5 has a passing test, and a multi-shed `seedData()` generates
sheds at different stages including one brooding and one empty.

---

## Phase 2 — Persistence — **DONE except emulator rules tests**

1. Extend `lib/repository.ts` with a `sheds` collection; keep the existing diff
   strategy so only changed documents are written.
2. Record document ids become `{shedId}__{date}`.
3. Extend `firestore.rules`: validate `shedId`, stage enums, canonical integer
   fields, and that record ids match `shedId__date`. Add the `worker` role.
4. Add `updatedBy` / `updatedAt` (server timestamp) to records and sales.
5. Write rules tests with `@firebase/rules-unit-testing` against the emulator —
   at minimum: a member of farm A cannot read farm B, a viewer cannot write, a
   worker cannot write yesterday.

**Done when:** rules tests pass against the emulator and a full farm round-trips
through Firestore unchanged.

---

## Phase 3 — Shed UI — **DONE**

1. **Sheds view**: list with capacity, strength, utilisation, stage badge,
   alerts. Add / edit / archive. Stage changes stamp `stageSince`.
2. **Daily round**: one screen that walks shed by shed for a date, pre-filled
   from yesterday, with a clear per-shed save. This replaces the single
   production dialog.
3. **Unit toggles** on egg quantity, feed, sale quantity and sale price.
   Switching a unit clears the field rather than converting it — the existing
   sales dialog already behaves this way and should be the pattern.
4. **Shed filter** across records, sales, inventory and reports; every view
   defaults to "All sheds" with a farm rollup.
5. Sale dialog gains a required shed selector showing that shed's live stock.

**Done when:** a farm with four sheds at different stages can be operated end
to end, and the laying rate reported matches a hand calculation over laying
sheds only.

---

## Phase 4 — Mobile and installable app — **PWA done, mobile partly**

1. Bottom tab bar under 768px; sidebar above it.
2. `inputMode="numeric"` on every number field, minimum 44px tap targets,
   sticky save buttons, tables collapsing to cards on narrow screens.
3. PWA via `vite-plugin-pwa` (`registerType: 'autoUpdate'`):
   - `manifest.webmanifest` — name, short name, `display: standalone`,
     `start_url: '/'`, theme colour matching the yolk-yellow header
   - icons at 192px, 512px, and a 512px maskable
   - `apple-touch-icon` and `apple-mobile-web-app-capable` for iOS
4. An **Install app** button in Farm settings, driven by the captured
   `beforeinstallprompt` event and hidden when already installed.
5. Offline behaviour: Firestore's persistent cache already holds the data, so
   the service worker only needs the app shell. Show a clear offline banner and
   a pending-writes count rather than pretending everything saved.

**Done when:** Chrome on Android offers Install, the installed app opens
without browser chrome, and a day's records entered in aeroplane mode sync on
reconnect.

---

## Phase 5 — Reports and alerts

Per-shed and farm trends, age-aware lay curve comparison (REQUIREMENTS 7.1),
feed efficiency by shed, mortality trend, and the alert list surfaced on the
overview. CSV export gains a shed column.

---

## Phase 6 — Finance (not before Phase 5 ships)

Customer accounts, outstanding balances, payments, feed purchases and
expenses, then profitability per shed.

---

## Decisions already made

| Decision                          | Why                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase over Supabase / Neon     | Free tier never pauses; client SDK needs no API layer; offline persistence built in                                                                                          |
| Static SPA on Vercel              | No server to run; `vercel.json` already correct                                                                                                                              |
| Shed as unit of record            | Farm-level rollups are wrong when sheds differ in age (REQUIREMENTS 1)                                                                                                       |
| Each shed holds its own egg stock | Confirmed by the owner. A sale draws from one named shed, so shed-wise sales reconcile against shed-wise inventory                                                           |
| One sale draws from one shed      | A split order is entered as one sale per shed. Deferred, not rejected — it loses no information, so multi-shed sale lines can be retrofitted mechanically (REQUIREMENTS 3.2) |
| Canonical eggs and paise integers | Removes rounding drift and unlocks tray size                                                                                                                                 |
| Paise never shown to a user       | Internal representation only; every displayed and typed figure is rupees (REQUIREMENTS 4)                                                                                    |
| Strength derived, never stored    | Two sources of truth drift                                                                                                                                                   |
| Variance reported, not rejected   | A recount that disagrees with the log is signal, not error                                                                                                                   |
| Finance deferred to Phase 6       | Sheds must be solid first                                                                                                                                                    |

---

## Swapping the database later

Firebase was chosen for the trial, not for ever. The code is arranged so that
changing it is a contained job.

**What is storage-agnostic already.** `lib/units.mjs`, `lib/sheds.mjs` and
`lib/farm.mjs` are pure functions over plain objects. They have no import from
Firebase, no network call and no `localStorage`. All 47 domain tests run under
`node --test` with nothing else present. None of that changes when the database
does.

**The whole seam is `Repository` in `lib/repository.ts`:**

```ts
type Repository = {
  mode: 'local' | 'cloud';
  load(): Promise<{ data: Farm; notice: string }>;
  save(next: Farm, prev: Farm | null): Promise<void>;
  saveSync?(next: Farm): void; // only where failure is immediate
};
```

Two implementations exist (`localRepository`, `cloudRepository`). A third is
all Postgres needs. `app/page.tsx` picks one and never learns which.

**What Postgres additionally requires**, and the reason it was not the trial
choice: Firestore's client SDK enforces access rules server-side, so the app
can be a static page with no backend. Postgres cannot be reached safely from a
browser, so a move means:

1. An API layer — serverless functions, or a small server.
2. Authentication that is no longer Firebase's: sessions or JWTs of your own,
   unless you keep Firebase Auth and verify its tokens server-side.
3. Re-implementing `firestore.rules` as server-side authorisation. The rules
   file is the specification for what that must enforce, and
   `lib/rules.test.mjs` is the list of cases it must still pass.
4. Replacing offline persistence, which Firestore gave for free. A farm with
   poor signal will notice if this is dropped.

**A relational schema falls straight out of REQUIREMENTS section 2:** `farms`,
`sheds`, `records` (unique on `shed_id, date`), `sales`. Quantities are already
integers and money is already paise, so the column types are `integer`
throughout with no floating point anywhere.

**Exporting the data** needs no special tooling: Farm settings → Download full
backup produces the entire farm as one JSON document, in exactly the shape
`validateData` accepts.
