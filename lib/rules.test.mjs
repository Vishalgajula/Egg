// Security rules tests. These run against the Firestore emulator, which is the
// only way to find out what the rules actually do rather than what they look
// like they do.
//
//   firebase emulators:exec --only firestore "node --test lib/rules.test.mjs"
//
// Skipped automatically when no emulator is listening, so `npm run verify`
// stays runnable without one.

import test from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

const HOST = '127.0.0.1';
const PORT = 8080;

const reachable = await fetch(`http://${HOST}:${PORT}/`)
  .then(() => true)
  .catch(() => false);

const OWNER = 'owner-uid';
const OTHER = 'other-uid';
const VIEWER = 'viewer-uid';
const FARM = 'farm-a';
const FOREIGN = 'farm-b';

const shed = (patch = {}) => ({
  id: 'shed-1',
  code: 'S1',
  name: 'North layer shed',
  capacity: 2000,
  stage: 'production',
  stageSince: '2026-01-01',
  notProducingReason: null,
  notProducingNote: '',
  openingBirds: 1800,
  openingEggs: 0,
  breed: 'BV300',
  placedOn: null,
  archived: false,
  ...patch,
});

const record = (patch = {}) => ({
  shedId: 'shed-1',
  date: '2026-01-05',
  stage: 'production',
  birds: 1800,
  eggs: 1600,
  entry: { qty: 1600, unit: 'egg' },
  damaged: 10,
  deaths: 2,
  added: 0,
  feedKg: 200,
  feedEntry: { qty: 200, unit: 'kg' },
  notes: '',
  ...patch,
});

const sale = (patch = {}) => ({
  id: 'sale-1',
  date: '2026-01-05',
  shedId: 'shed-1',
  customer: 'Sunrise Wholesale',
  eggs: 900,
  entry: { qty: 30, unit: 'tray' },
  unitPriceMinor: 18000,
  priceUnit: 'tray',
  discountPercent: 0,
  notes: '',
  ...patch,
});

test(
  'firestore security rules',
  { skip: !reachable && 'emulator not running' },
  async (t) => {
    const env = await initializeTestEnvironment({
      projectId: 'flockbook-rules-test',
      firestore: {
        host: HOST,
        port: PORT,
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
    t.after(() => env.cleanup());

    // Seed two farms straight past the rules.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'farms', FARM), {
        name: 'Farm A',
        traySize: 30,
        version: 4,
        sample: false,
        ownerUid: OWNER,
        members: { [OWNER]: 'owner', [VIEWER]: 'viewer' },
      });
      await setDoc(doc(db, 'farms', FOREIGN), {
        name: 'Farm B',
        traySize: 30,
        version: 4,
        sample: false,
        ownerUid: OTHER,
        members: { [OTHER]: 'owner' },
      });
    });

    const owner = env.authenticatedContext(OWNER).firestore();
    const viewer = env.authenticatedContext(VIEWER).firestore();
    const stranger = env.authenticatedContext(OTHER).firestore();
    const anon = env.unauthenticatedContext().firestore();

    await t.test('an owner can write and read their own farm', async () => {
      await assertSucceeds(
        setDoc(doc(owner, 'farms', FARM, 'sheds', 'shed-1'), shed()),
      );
      await assertSucceeds(
        setDoc(
          doc(owner, 'farms', FARM, 'records', 'shed-1__2026-01-05'),
          record(),
        ),
      );
      await assertSucceeds(
        setDoc(doc(owner, 'farms', FARM, 'sales', 'sale-1'), sale()),
      );
      await assertSucceeds(getDocs(collection(owner, 'farms', FARM, 'sheds')));
      await assertSucceeds(
        getDocs(collection(owner, 'farms', FARM, 'records')),
      );
      await assertSucceeds(getDocs(collection(owner, 'farms', FARM, 'sales')));
      await assertSucceeds(getDoc(doc(owner, 'farms', FARM)));
    });

    await t.test('a farm is invisible to everyone outside it', async () => {
      await assertFails(getDoc(doc(stranger, 'farms', FARM)));
      await assertFails(
        getDocs(collection(stranger, 'farms', FARM, 'records')),
      );
      await assertFails(
        setDoc(
          doc(stranger, 'farms', FARM, 'records', 'shed-1__2026-01-06'),
          record({ date: '2026-01-06' }),
        ),
      );
      await assertFails(getDoc(doc(anon, 'farms', FARM)));
    });

    await t.test('a viewer may read but never write', async () => {
      await assertSucceeds(
        getDocs(collection(viewer, 'farms', FARM, 'records')),
      );
      await assertFails(
        setDoc(
          doc(viewer, 'farms', FARM, 'records', 'shed-1__2026-01-07'),
          record({ date: '2026-01-07' }),
        ),
      );
      await assertFails(
        deleteDoc(doc(viewer, 'farms', FARM, 'sheds', 'shed-1')),
      );
    });

    await t.test('a record id must match its shed and date', async () => {
      await assertFails(
        setDoc(
          doc(owner, 'farms', FARM, 'records', 'wrong-id'),
          record({ date: '2026-01-08' }),
        ),
      );
      await assertFails(
        setDoc(
          doc(owner, 'farms', FARM, 'records', 'shed-1__2026-01-09'),
          record({ date: '2026-01-10' }),
        ),
      );
    });

    await t.test('only a laying shed may record eggs', async () => {
      await assertFails(
        setDoc(
          doc(owner, 'farms', FARM, 'records', 'shed-1__2026-02-01'),
          record({ date: '2026-02-01', stage: 'brooding', eggs: 500 }),
        ),
      );
      // The same record with no eggs is fine.
      await assertSucceeds(
        setDoc(
          doc(owner, 'farms', FARM, 'records', 'shed-1__2026-02-02'),
          record({
            date: '2026-02-02',
            stage: 'brooding',
            eggs: 0,
            entry: { qty: 0, unit: 'egg' },
          }),
        ),
      );
    });

    await t.test('malformed records and sales are refused', async () => {
      for (const [label, patch] of [
        ['negative eggs', { eggs: -1 }],
        ['fractional birds', { birds: 10.5 }],
        ['bad stage', { stage: 'sleeping' }],
        ['bad date', { date: '05-01-2026' }],
        ['missing entry unit', { entry: { qty: 5 } }],
      ]) {
        await assertFails(
          setDoc(
            doc(owner, 'farms', FARM, 'records', `shed-1__2026-03-01`),
            record({ date: '2026-03-01', ...patch }),
          ),
          label,
        );
      }
      for (const [label, patch] of [
        ['zero eggs', { eggs: 0 }],
        ['price as rupees float', { unitPriceMinor: 180.5 }],
        ['discount over 100', { discountPercent: 101 }],
        ['no customer', { customer: '' }],
        ['no shed', { shedId: '' }],
      ]) {
        await assertFails(
          setDoc(
            doc(owner, 'farms', FARM, 'sales', 'sale-2'),
            sale({ id: 'sale-2', ...patch }),
          ),
          label,
        );
      }
    });

    await t.test('a shed not producing must carry a reason', async () => {
      await assertFails(
        setDoc(
          doc(owner, 'farms', FARM, 'sheds', 'shed-2'),
          shed({
            id: 'shed-2',
            stage: 'not_producing',
            notProducingReason: null,
          }),
        ),
      );
      await assertSucceeds(
        setDoc(
          doc(owner, 'farms', FARM, 'sheds', 'shed-2'),
          shed({
            id: 'shed-2',
            stage: 'not_producing',
            notProducingReason: 'moulting',
          }),
        ),
      );
    });

    await t.test('ownership cannot be reassigned by an update', async () => {
      await assertFails(
        setDoc(doc(owner, 'farms', FARM), {
          name: 'Farm A',
          traySize: 30,
          version: 4,
          sample: false,
          ownerUid: OTHER,
          members: { [OWNER]: 'owner' },
        }),
      );
    });

    await t.test('an owner invites by email; nobody else can', async () => {
      const invite = {
        farmId: FARM,
        role: 'editor',
        email: 'worker@example.com',
      };
      await assertSucceeds(
        setDoc(doc(owner, 'invites', 'worker@example.com'), invite),
      );
      // A viewer on the farm cannot invite anyone.
      await assertFails(
        setDoc(doc(viewer, 'invites', 'sneak@example.com'), {
          ...invite,
          email: 'sneak@example.com',
        }),
      );
      // Nor can somebody outside the farm invite into it.
      await assertFails(
        setDoc(doc(stranger, 'invites', 'sneak2@example.com'), {
          ...invite,
          email: 'sneak2@example.com',
        }),
      );
      // The role is constrained: nobody can be invited straight to owner.
      await assertFails(
        setDoc(doc(owner, 'invites', 'boss@example.com'), {
          farmId: FARM,
          role: 'owner',
          email: 'boss@example.com',
        }),
      );
    });

    await t.test(
      'an invitation is readable only by the person it names',
      async () => {
        const worker = env
          .authenticatedContext('worker-uid', { email: 'worker@example.com' })
          .firestore();
        await assertSucceeds(
          getDoc(doc(worker, 'invites', 'worker@example.com')),
        );
        // Somebody else's invitation stays private.
        await assertFails(
          getDoc(doc(stranger, 'invites', 'worker@example.com')),
        );
        // And the collection cannot be listed, so this is not a user directory.
        await assertFails(getDocs(collection(owner, 'invites')));
      },
    );

    await t.test(
      'an invited person joins at the invited role and no higher',
      async () => {
        const worker = env
          .authenticatedContext('worker-uid', { email: 'worker@example.com' })
          .firestore();
        // Claiming the invitation as the role it grants.
        await assertSucceeds(
          updateDoc(doc(worker, 'farms', FARM), {
            'members.worker-uid': 'editor',
            'memberEmails.worker-uid': 'worker@example.com',
          }),
        );
        // Having joined, the editor can now write records.
        await assertSucceeds(
          setDoc(
            doc(worker, 'farms', FARM, 'records', 'shed-1__2026-04-01'),
            record({ date: '2026-04-01' }),
          ),
        );
      },
    );

    await t.test(
      'an invitation cannot be used to grant a bigger role',
      async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'invites', 'greedy@example.com'), {
            farmId: FARM,
            role: 'viewer',
            email: 'greedy@example.com',
          });
        });
        const greedy = env
          .authenticatedContext('greedy-uid', { email: 'greedy@example.com' })
          .firestore();
        // Invited as a viewer, trying to arrive as an editor.
        await assertFails(
          updateDoc(doc(greedy, 'farms', FARM), {
            'members.greedy-uid': 'editor',
          }),
        );
        // And cannot smuggle in a change to the farm itself while joining.
        await assertFails(
          updateDoc(doc(greedy, 'farms', FARM), {
            'members.greedy-uid': 'viewer',
            name: 'Stolen farm',
          }),
        );
        // The honest claim works.
        await assertSucceeds(
          updateDoc(doc(greedy, 'farms', FARM), {
            'members.greedy-uid': 'viewer',
          }),
        );
      },
    );

    await t.test('somebody with no invitation cannot join', async () => {
      const nobody = env
        .authenticatedContext('nobody-uid', { email: 'nobody@example.com' })
        .firestore();
      await assertFails(
        updateDoc(doc(nobody, 'farms', FARM), {
          'members.nobody-uid': 'editor',
        }),
      );
    });

    await t.test('an owner cannot demote or remove themselves', async () => {
      await assertFails(
        updateDoc(doc(owner, 'farms', FARM), {
          [`members.${OWNER}`]: 'viewer',
        }),
      );
    });

    await t.test('a user document belongs to that user alone', async () => {
      await assertSucceeds(
        setDoc(doc(owner, 'users', OWNER), { farmId: FARM }),
      );
      await assertFails(setDoc(doc(owner, 'users', OTHER), { farmId: FARM }));
      await assertFails(getDoc(doc(stranger, 'users', OWNER)));
    });
  },
);
