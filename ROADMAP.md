# Flockbook roadmap

The detailed specification and build plan now live in `docs/`. This page is the
map.

| Document                                       | What it covers                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) | The v4 multi-shed data model, units, validation rules, what to remove |
| [docs/PLAN.md](./docs/PLAN.md)                 | Phase-by-phase build plan and current state of the code               |
| [docs/FIREBASE.md](./docs/FIREBASE.md)         | Firebase project setup, run by the owner                              |
| [AGENTS.md](./AGENTS.md)                       | Conventions for anyone — human or agent — changing this code          |

---

## 1. Production prototype — done

React interface with a demo login. One daily production entry per farm for
laying hens, egg collection, feed, damaged eggs and, since v3, bird deaths and
intake. Separate customer sales entries, each with its own tray quantity, INR
price and optional discount. Editable records, calculated inventory, monthly
and quarterly charts, laying rate, feed efficiency and period comparisons.
Arrays saved in browser storage with backup export and import.

## 2. Accounts and cloud storage — in progress

Firebase Authentication and Firestore behind a repository abstraction, so the
app still runs entirely offline when no Firebase project is configured.
Farm-scoped isolation with owner, editor and viewer roles enforced by
`firestore.rules`. See PLAN.md Phase 0 and Phase 2.

## 3. Multi-shed model — specified, not built

One farm holds many sheds. Each shed has its own capacity, strength, bird stage
and reason for not producing; its own production, feed, egg stock and sales.
Quantities can be entered in eggs or trays, prices per egg or per tray.

**This supersedes the single-flock model in `lib/farm.mjs`.** The full
specification is in REQUIREMENTS.md; the build order is PLAN.md Phases 1 to 3.

## 4. Mobile and installable — planned

Bottom navigation, numeric keypads, card layouts on narrow screens, and a
daily round flow that walks shed by shed. Installable from Chrome as a
progressive web app, working offline against Firestore's local cache.
PLAN.md Phase 4.

## 5. Reports and alerts — planned

Per-shed trends, age-aware lay curve comparison, feed efficiency by shed,
mortality trends, and alerts for mortality spikes, production drops and sheds
over capacity. PLAN.md Phase 5.

## 6. Finance — deferred

Customer accounts, invoices, payments, expenses, feed purchases, balances and
per-shed profitability. Not to be started before Phase 5 ships. PLAN.md
Phase 6.

---

## Calculation rules

Superseded by [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) sections 3 to 5,
which define these per shed. The rules that carry over unchanged:

- Bird count means live laying hens that day. Feed is recorded in metric
  tonnes or kilograms; one tonne is 1,000 kg.
- Missing dates are not zero-production days; comparisons use recorded-day
  averages.
- Opening balances precede the earliest entry.
- Each sale's discount is a percentage; discounts affect sale value, never
  inventory quantity.
- Stock is reconciled at the end of each date. Intraday transaction times are
  not tracked.
- No future dates. Changing or deleting a record cannot leave a historical
  stock deficit.

The rules that change at v4: laying rate counts only sheds in
`early_production` or `production`; stock and flock ledgers are per shed;
quantities are stored as integer egg counts and prices as integer paise.
