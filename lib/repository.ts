import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { seedData, validateData, STORAGE_KEY, VERSION } from '@/lib/farm.mjs';

export type ShedStage =
  | 'brooding'
  | 'growing'
  | 'early_production'
  | 'production'
  | 'not_producing'
  | 'empty';

export type NotProducingReason =
  | 'disease'
  | 'moulting'
  | 'old_age'
  | 'cleaning'
  | 'between_batches'
  | 'other';

/** A quantity as the user typed it. The canonical value is stored separately. */
export type Entry = { qty: number; unit: 'egg' | 'tray' };
export type FeedEntry = { qty: number; unit: 'kg' | 'tonne' };

export type Shed = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  stage: ShedStage;
  stageSince: string | null;
  notProducingReason: NotProducingReason | null;
  notProducingNote: string;
  openingBirds: number;
  openingEggs: number;
  breed: string;
  placedOn: string | null;
  archived: boolean;
};

export type RecordDay = {
  shedId: string;
  date: string;
  stage: ShedStage;
  birds: number;
  eggs: number;
  entry: Entry;
  damaged: number;
  deaths: number;
  added: number;
  feedKg: number;
  feedEntry: FeedEntry;
  notes: string;
};

export type Sale = {
  id: string;
  date: string;
  shedId: string;
  customer: string;
  eggs: number;
  entry: Entry;
  unitPriceMinor: number;
  priceUnit: 'egg' | 'tray';
  discountPercent: number;
  notes: string;
};

export type Role = 'owner' | 'editor' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_NOTES: Record<Role, string> = {
  owner: 'Full control, including who else can use this farm.',
  editor: 'Can add and change records, sales and sheds.',
  viewer: 'Can see everything, and change nothing.',
};

export type Member = { uid: string; email: string; role: Role; isYou: boolean };
export type Invitation = { email: string; role: Role };
export type Team = {
  members: Member[];
  invitations: Invitation[];
  myRole: Role;
};

export type FarmSettings = { name: string; traySize: number };

export type Farm = {
  version: number;
  sample: boolean;
  settings: FarmSettings;
  sheds: Shed[];
  records: RecordDay[];
  sales: Sale[];
};

export type Loaded = { data: Farm; notice: string };

export type Repository = {
  mode: 'local' | 'cloud';
  load(): Promise<Loaded>;
  /** `prev` lets the cloud repository write only what actually changed. */
  save(next: Farm, prev: Farm | null): Promise<void>;
  /**
   * Browser storage can report failure immediately, so local saves stay
   * synchronous and keep the prototype's "nothing was saved" error. A network
   * repository has no such path and reports failures after the fact.
   */
  saveSync?(next: Farm): void;
  /**
   * Only a shared workspace has a team. Its absence is what tells the UI to
   * hide the section entirely rather than show an empty one.
   */
  team?: {
    load(): Promise<Team>;
    invite(email: string, role: Role): Promise<void>;
    revoke(email: string): Promise<void>;
    setRole(uid: string, role: Role): Promise<void>;
    remove(uid: string): Promise<void>;
  };
};

export const emptyFarm = (name = 'My farm'): Farm => ({
  version: VERSION,
  sample: false,
  settings: { name, traySize: 30 },
  sheds: [],
  records: [],
  sales: [],
});

/** One production record per shed per day, guaranteed by the document id. */
export const recordId = (r: { shedId: string; date: string }) =>
  `${r.shedId}__${r.date}`;

/* ---------------------------------- local --------------------------------- */

const MIGRATION_NOTICE: Record<number, string> = {
  1: 'Your records have been separated into production and sales, and moved into a shed called Main shed. Nothing was lost — check the shed’s capacity and stage in Sheds.',
  2: 'Your records now track bird losses and have moved into a shed called Main shed. Check its capacity and stage in Sheds.',
  3: 'Your farm now tracks each shed separately. Everything you had is in a shed called Main shed — check its capacity and stage in Sheds.',
};

export const localRepository: Repository = {
  mode: 'local',
  async load() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return {
        data: seedData() as Farm,
        notice:
          'Browser storage is unavailable, so records cannot be saved. Sample data is shown.',
      };
    }
    if (!raw) return { data: seedData() as Farm, notice: '' };
    try {
      const parsed = JSON.parse(raw);
      return {
        data: validateData(parsed) as Farm,
        notice: MIGRATION_NOTICE[parsed?.version as number] ?? '',
      };
    } catch {
      return {
        data: seedData() as Farm,
        notice:
          'Saved data could not be loaded. Original storage is preserved until you save. Restore a backup before entering new records.',
      };
    }
  },
  async save(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
  saveSync(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
};

/* ---------------------------------- cloud --------------------------------- */

// Firestore caps a batch at 500 operations.
const BATCH_LIMIT = 500;

type BatchOp = (b: ReturnType<typeof writeBatch>) => void;

async function commitAll(db: Firestore, ops: BatchOp[]) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

/** Invitations are keyed by lowercased email — see firestore.rules. */
export const emailKey = (email: string) => email.trim().toLowerCase();

/** A stored document of unknown vintage. */
type Legacy = Record<string, unknown>;

/*
 * Which shape a stored document is in, decided by what it actually contains
 * rather than by a version flag that may not have kept up. A version 4 record
 * belongs to a shed and remembers the unit it was typed in; a version 4 sale
 * holds an egg count and a price in paise.
 */
const isCurrentRecord = (r: Legacy) =>
  typeof r.shedId === 'string' &&
  r.shedId !== '' &&
  typeof r.feedKg === 'number';

const isCurrentSale = (s: Legacy) =>
  typeof s.shedId === 'string' &&
  s.shedId !== '' &&
  typeof s.unitPriceMinor === 'number';

/**
 * Resolve this user's farm.
 *
 * Order matters: an existing membership wins, then a pending invitation, and
 * only failing both is a new farm created. Checking the invitation before
 * creating is what lets a farm worker sign up and land in their employer's
 * farm rather than an empty one of their own.
 */
async function resolveFarmId(db: Firestore, uid: string, email: string) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const existing = snap.exists() ? (snap.data().farmId as string) : null;
  if (existing) return existing;

  if (email) {
    const key = emailKey(email);
    const invite = await getDoc(doc(db, 'invites', key)).catch(() => null);
    if (invite?.exists()) {
      const { farmId, role } = invite.data() as { farmId: string; role: Role };
      const farmRef = doc(db, 'farms', farmId);
      // The rules permit exactly this shape of update and no other.
      await updateDoc(farmRef, {
        [`members.${uid}`]: role,
        [`memberEmails.${uid}`]: key,
      });
      await setDoc(userRef, { farmId });
      // The invitation has done its job; leaving it would let a removed member
      // rejoin simply by signing out and back in.
      await deleteDoc(doc(db, 'invites', key)).catch(() => {});
      return farmId;
    }
  }

  const farmRef = doc(collection(db, 'farms'));
  const farm = emptyFarm(email ? `${email.split('@')[0]}’s farm` : 'My farm');
  await setDoc(farmRef, {
    ...farm.settings,
    version: farm.version,
    sample: farm.sample,
    ownerUid: uid,
    members: { [uid]: 'owner' },
    memberEmails: { [uid]: emailKey(email) },
  });
  await setDoc(userRef, { farmId: farmRef.id });
  return farmRef.id;
}

const byKey = <T>(rows: T[], key: (row: T) => string) =>
  new Map(rows.map((row) => [key(row), row]));

/**
 * Write only what changed, comparing the new farm against the one on screen.
 * Rewriting every document on each save would burn the free tier's daily write
 * quota within a few edits.
 */
function diff<T>(
  prev: T[],
  next: T[],
  key: (row: T) => string,
  write: (b: ReturnType<typeof writeBatch>, id: string, row: T) => void,
  remove: (b: ReturnType<typeof writeBatch>, id: string) => void,
): BatchOp[] {
  const before = byKey(prev, key);
  const after = byKey(next, key);
  const ops: BatchOp[] = [];
  for (const [id, row] of after)
    if (JSON.stringify(before.get(id)) !== JSON.stringify(row))
      ops.push((b) => write(b, id, row));
  for (const id of before.keys())
    if (!after.has(id)) ops.push((b) => remove(b, id));
  return ops;
}

/**
 * Firestore's own wording ("Missing or insufficient permissions") tells a farm
 * owner nothing about what to do. Nearly every time it appears it means the
 * rules in this repo have not been uploaded since the schema last changed.
 */
function explainLoadFailure(e: unknown): never {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied')
    throw new Error(
      'Your farm database refused the request. This usually means the security rules have not been uploaded since the last update — run "firebase deploy --only firestore:rules" and reload.',
    );
  if (code === 'unavailable')
    throw new Error(
      'Could not reach your farm database. Check the connection and try again.',
    );
  if (code === 'unauthenticated')
    throw new Error('Your session has expired. Sign in again to continue.');
  throw e;
}

export function cloudRepository(uid: string, email: string): Repository {
  const { db } = getFirebase();
  let farmId: string | null = null;
  const id = async () =>
    (farmId ??= await resolveFarmId(db, uid, email).catch(explainLoadFailure));

  return {
    mode: 'cloud',

    async load() {
      const fid = await id();
      const [farmSnap, sheds, records, sales] = await Promise.all([
        getDoc(doc(db, 'farms', fid)),
        getDocs(collection(db, 'farms', fid, 'sheds')),
        getDocs(collection(db, 'farms', fid, 'records')),
        getDocs(collection(db, 'farms', fid, 'sales')),
      ]).catch(explainLoadFailure);

      const stored = farmSnap.data() ?? {};
      const rawRecords = records.docs.map((d) => d.data() as Legacy);
      const rawSales = sales.docs.map((d) => d.data() as Legacy);

      /*
       * The farm document carries a version, but its subcollections are
       * written one document at a time and can outrun it: a farm created
       * before version 4 still says 3 while every record saved since is
       * already in version 4 shape. Trusting that flag re-ran the migration
       * over migrated data and blew up on the missing fields.
       *
       * So shape is decided per document, and the flag is only a fallback for
       * the farm's own settings.
       */
      const legacyRecords = rawRecords.filter((r) => !isCurrentRecord(r));
      const legacySales = rawSales.filter((s) => !isCurrentSale(s));
      const needsMigration =
        legacyRecords.length > 0 ||
        legacySales.length > 0 ||
        ((stored.version as number) ?? VERSION) < VERSION;

      let data: Farm;
      if (!needsMigration) {
        data = {
          version: VERSION,
          sample: Boolean(stored.sample),
          settings: {
            name: (stored.name as string) ?? 'My farm',
            traySize: (stored.traySize as number) ?? 30,
          },
          sheds: sheds.docs.map((d) => d.data() as Shed),
          records: rawRecords as unknown as RecordDay[],
          sales: rawSales as unknown as Sale[],
        };
      } else {
        // Migrate only what is actually old, then fold the rest back in.
        const migrated = validateData({
          version: 3,
          sample: Boolean(stored.sample),
          settings: {
            name: (stored.name as string) ?? 'My farm',
            traySize: (stored.traySize as number) ?? 30,
            // Opening balances lived on the farm before version 4.
            openingStock: (stored.openingStock as number) ?? 0,
            openingBirds: (stored.openingBirds as number) ?? 0,
          },
          records: legacyRecords,
          sales: legacySales,
        }) as Farm;
        data = {
          ...migrated,
          sheds: [
            ...sheds.docs.map((d) => d.data() as Shed),
            // The migration invents a shed only when it had rows to house.
            ...migrated.sheds.filter(
              (s) => !sheds.docs.some((d) => d.id === s.id),
            ),
          ],
          records: [
            ...migrated.records,
            ...(rawRecords.filter(isCurrentRecord) as unknown as RecordDay[]),
          ],
          sales: [
            ...migrated.sales,
            ...(rawSales.filter(isCurrentSale) as unknown as Sale[]),
          ],
        };
      }

      // The same validator guards cloud data as guards a restored backup.
      const validated = validateData(data) as Farm;

      // Stamp the farm as current so this never has to be worked out again.
      // Best effort: a viewer cannot write, and that must not block a load.
      if (((stored.version as number) ?? 0) !== VERSION)
        updateDoc(doc(db, 'farms', fid), { version: VERSION }).catch(() => {});

      return {
        data: validated,
        notice: needsMigration
          ? 'Your records have been brought up to date and are now organised by shed. Check each shed’s capacity and stage in Sheds.'
          : '',
      };
    },

    async save(next, prev) {
      const fid = await id();
      const ops: BatchOp[] = [];

      if (
        !prev ||
        JSON.stringify(prev.settings) !== JSON.stringify(next.settings) ||
        prev.sample !== next.sample
      )
        ops.push((b) =>
          b.set(
            doc(db, 'farms', fid),
            { ...next.settings, version: next.version, sample: next.sample },
            { merge: true },
          ),
        );

      ops.push(
        ...diff(
          prev?.sheds ?? [],
          next.sheds,
          (s) => s.id,
          (b, sid, shed) => b.set(doc(db, 'farms', fid, 'sheds', sid), shed),
          (b, sid) => b.delete(doc(db, 'farms', fid, 'sheds', sid)),
        ),
        ...diff(
          prev?.records ?? [],
          next.records,
          recordId,
          (b, rid, row) => b.set(doc(db, 'farms', fid, 'records', rid), row),
          (b, rid) => b.delete(doc(db, 'farms', fid, 'records', rid)),
        ),
        ...diff(
          prev?.sales ?? [],
          next.sales,
          (s) => s.id,
          (b, sid, row) => b.set(doc(db, 'farms', fid, 'sales', sid), row),
          (b, sid) => b.delete(doc(db, 'farms', fid, 'sales', sid)),
        ),
      );

      await commitAll(db, ops).catch(explainLoadFailure);
    },

    team: {
      async load() {
        const fid = await id();
        const snap = await getDoc(doc(db, 'farms', fid)).catch(
          explainLoadFailure,
        );
        const farm = snap.data() ?? {};
        const roles = (farm.members ?? {}) as Record<string, Role>;
        const emails = (farm.memberEmails ?? {}) as Record<string, string>;
        const pending = (farm.pendingInvites ?? {}) as Record<string, Role>;
        return {
          members: Object.entries(roles)
            .map(([memberUid, role]) => ({
              uid: memberUid,
              email: emails[memberUid] ?? 'Unknown address',
              role,
              isYou: memberUid === uid,
            }))
            // Owner first, then editors, then viewers.
            .sort(
              (a, b) =>
                ['owner', 'editor', 'viewer'].indexOf(a.role) -
                  ['owner', 'editor', 'viewer'].indexOf(b.role) ||
                a.email.localeCompare(b.email),
            ),
          invitations: Object.entries(pending)
            .filter(([email]) => !Object.values(emails).includes(email))
            .map(([email, role]) => ({ email, role })),
          myRole: roles[uid] ?? 'viewer',
        };
      },

      async invite(email, role) {
        const fid = await id();
        const key = emailKey(email);
        if (!key.includes('@')) throw new Error('Enter a valid email address.');
        // Two writes: the invitation the new person can find by their own
        // email, and a copy on the farm so an owner can see what is pending.
        // The invitation document is the one that grants access.
        await setDoc(doc(db, 'invites', key), {
          farmId: fid,
          role,
          email: key,
        }).catch(explainLoadFailure);
        await updateDoc(
          doc(db, 'farms', fid),
          new FieldPath('pendingInvites', key),
          role,
        ).catch(explainLoadFailure);
      },

      async revoke(email) {
        const fid = await id();
        const key = emailKey(email);
        await deleteDoc(doc(db, 'invites', key)).catch(explainLoadFailure);
        await updateDoc(
          doc(db, 'farms', fid),
          new FieldPath('pendingInvites', key),
          deleteField(),
        ).catch(explainLoadFailure);
      },

      async setRole(memberUid, role) {
        const fid = await id();
        await updateDoc(doc(db, 'farms', fid), {
          [`members.${memberUid}`]: role,
        }).catch(explainLoadFailure);
      },

      async remove(memberUid) {
        const fid = await id();
        await updateDoc(doc(db, 'farms', fid), {
          [`members.${memberUid}`]: deleteField(),
          [`memberEmails.${memberUid}`]: deleteField(),
        }).catch(explainLoadFailure);
      },
    },
  };
}
