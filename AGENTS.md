# Working on Flockbook

Egg production tracking for a working poultry farm in India. React 19 +
TypeScript + Vite, static SPA, Firestore behind an optional repository layer.

## Read before changing anything

| Document                                       | What it settles                                        |
| ---------------------------------------------- | ------------------------------------------------------ |
| [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) | The v4 multi-shed data model and every validation rule |
| [docs/PLAN.md](./docs/PLAN.md)                 | Phase order, current state, what is already decided    |
| [docs/FIREBASE.md](./docs/FIREBASE.md)         | Firebase setup, owner-run steps                        |

Work the phases in order. Do not start a phase while the previous one is
incomplete.

## Verify before claiming done

```sh
npm run verify      # tsc --noEmit && oxlint && node --test lib/*.test.mjs && vite build
```

Paste real output. A change is not done because it looks right — it is done
when the suite says so. If something fails and you cannot fix it, say which
part failed and stop; do not narrow the task and report success.

## Architecture rules

**Domain logic goes in `lib/*.mjs` as pure functions.** No React, no network,
no `localStorage`. This is what makes the farm maths testable with
`node --test` and it is the reason the existing 26 tests are worth anything.
`app/page.tsx` renders; it does not calculate.

**All writes go through `commit()` in `app/page.tsx`.** It validates, persists
through the repository, and rolls back a failed cloud write. Never call
`localStorage` or Firestore directly from a component.

**The repository abstraction is load-bearing.** `lib/repository.ts` exposes
`localRepository` and `cloudRepository` behind one interface. With no
`VITE_FIREBASE_*` env vars the app must run exactly as the offline prototype
did — a fresh clone with no Firebase project has to work. Do not break that
fallback.

**`firestore.rules` is the real security boundary,** not client validation. A
rule change needs a corresponding emulator test. Client-side checks exist for
good error messages, nothing more.

**Quantities are integers.** Eggs as egg counts, money as paise. Store the
canonical value plus what the user typed (`entry: { qty, unit }`). Never store
a derived float. See REQUIREMENTS section 4 for why.

**Derived values are never stored.** Shed strength, stock and laying rate are
computed from the ledger every time. Two sources of truth drift.

## Conventions

- Formatting is `oxfmt`, linting is `oxlint`. Run `npm run format` before
  finishing. Do not hand-format around them.
- Match the surrounding style: two-space indent, single quotes, named exports,
  `type` over `interface`.
- Comments explain _why_, not what. The existing code is sparse and deliberate
  about this — match that density rather than annotating every line.
- User-facing strings are plain English for farm staff. No jargon, no error
  codes. "Not enough egg stock on 12 March" beats "validation failed".
- Currency is INR, formatted `en-IN`. Dates are `YYYY-MM-DD` strings
  throughout; never `Date` objects in stored data, and never UTC conversion —
  `dateKey()` exists because `toISOString()` shifts the day.

## Testing

Every validation rule in REQUIREMENTS section 5 needs a test asserting both the
rejection _and_ its message. Every migration needs a round-trip test. Tests
live next to the module: `lib/farm.test.mjs`, `lib/sheds.test.mjs`.

Browser interaction is not covered by any automated test. If you change UI
behaviour, say so plainly and say what you did or did not check by hand.

## Scope

Do what the phase asks. If you find a real problem outside it, write it down in
the phase notes rather than fixing it mid-change — an unrelated refactor buried
in a feature commit is hard to review and hard to revert.

Deleting unused code is welcome when the phase calls for it (Phase 0 lists
exactly what goes). Otherwise leave it.

## Where to start

Phase 0 is done — the repo is clean and `npm run verify` passes. **Phase 1
(the v4 domain remodel) is next**, and it is pure `lib/*.mjs` work with no
React and no network, so it can be done and proven entirely with
`node --test`.

Two things are not covered by any automated check, so do not assume them:
browser interaction, and real Firebase sign-in — no project is configured yet
(see docs/FIREBASE.md).
