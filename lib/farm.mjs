// Farm data: dates, validation, migrations and sample data.
//
// Shape and rules are specified in docs/REQUIREMENTS.md. Ledgers and rollups
// live in sheds.mjs; unit and money handling lives in units.mjs.

import {
  NOT_PRODUCING_REASONS,
  SHED_STAGES,
  eggLedger,
  flockLedger,
  isLaying,
} from './sheds.mjs';
import { toEggs, toMinor } from './units.mjs';

// Keep the original key so existing browsers find their saved pilot records.
export const STORAGE_KEY = 'flockbook.v1';
export const VERSION = 4;

export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const isDateString = (v, today) =>
  typeof v === 'string' &&
  DATE_PATTERN.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v &&
  (!today || v <= today);

const whole = (v, max = 1e8) => Number.isSafeInteger(v) && v >= 0 && v <= max;

/* ------------------------------ validation ------------------------------ */

export function validateShed(shed) {
  if (!shed || typeof shed !== 'object' || Array.isArray(shed))
    throw new Error('Every shed must be a valid entry.');
  if (typeof shed.id !== 'string' || !shed.id || shed.id.length > 100)
    throw new Error('Every shed needs a unique identifier.');
  if (
    typeof shed.name !== 'string' ||
    !shed.name.trim() ||
    shed.name.length > 60
  )
    throw new Error('Give each shed a name of up to 60 characters.');
  if (
    typeof shed.code !== 'string' ||
    !shed.code.trim() ||
    shed.code.length > 10
  )
    throw new Error('Give each shed a short code of up to 10 characters.');
  if (
    !Number.isSafeInteger(shed.capacity) ||
    shed.capacity < 1 ||
    shed.capacity > 1e7
  )
    throw new Error(`Set how many birds ${shed.name} can hold.`);
  if (!SHED_STAGES.includes(shed.stage))
    throw new Error(`Choose a valid stage for ${shed.name}.`);
  if (
    shed.stage === 'not_producing' &&
    !NOT_PRODUCING_REASONS.includes(shed.notProducingReason)
  )
    throw new Error(`Say why ${shed.name} is not producing.`);
  if (!whole(shed.openingBirds))
    throw new Error(`Opening flock for ${shed.name} must be a whole number.`);
  if (!whole(shed.openingEggs))
    throw new Error(
      `Opening egg stock for ${shed.name} must be a whole number.`,
    );
  if (shed.placedOn != null && !isDateString(shed.placedOn))
    throw new Error(`Check the placement date for ${shed.name}.`);
  return shed;
}

function validateRecord(record, sheds, today) {
  const shed = sheds.get(record?.shedId);
  if (!shed)
    throw new Error('Every daily record must belong to a shed that exists.');
  if (!isDateString(record.date, today))
    throw new Error(
      `Each record needs a valid date, no later than today. Check ${shed.name}.`,
    );
  if (!SHED_STAGES.includes(record.stage))
    throw new Error(`Choose a valid stage for the ${shed.name} record.`);
  for (const [key, label] of [
    ['birds', 'Laying hens'],
    ['eggs', 'Eggs collected'],
    ['damaged', 'Damaged eggs'],
    ['deaths', 'Birds lost'],
    ['added', 'Birds added'],
  ])
    if (!whole(record[key]))
      throw new Error(
        `${label} must be a whole number that is not negative. Check ${shed.name} on ${record.date}.`,
      );
  if (
    typeof record.feedKg !== 'number' ||
    !Number.isFinite(record.feedKg) ||
    record.feedKg < 0 ||
    record.feedKg > 1e7
  )
    throw new Error(
      `Feed must be a valid amount. Check ${shed.name} on ${record.date}.`,
    );
  if (typeof record.notes !== 'string' || record.notes.length > 1000)
    throw new Error('Notes must be no more than 1,000 characters.');

  if (record.birds > shed.capacity)
    throw new Error(
      `${shed.name} holds ${record.birds} birds on ${record.date}, more than its capacity of ${shed.capacity}. Raise the capacity or check the count.`,
    );
  if (record.eggs > 0 && !isLaying(record.stage))
    throw new Error(
      `${shed.name} was not laying on ${record.date}, so it cannot have collected eggs. Check the shed or its stage.`,
    );
  if (
    record.stage === 'empty' &&
    (record.birds || record.deaths || record.added || record.feedKg)
  )
    throw new Error(
      `${shed.name} is empty on ${record.date}, so it cannot have birds, losses or feed.`,
    );
  if (record.eggs > record.birds)
    throw new Error(
      `${shed.name} collected more eggs than it has birds on ${record.date}.`,
    );
  return record;
}

function validateSale(sale, sheds, traySize, today) {
  if (!sale || typeof sale !== 'object' || Array.isArray(sale))
    throw new Error('Every sale must be a valid entry.');
  if (typeof sale.id !== 'string' || !sale.id || sale.id.length > 100)
    throw new Error('Every sale must have a unique valid ID.');
  const shed = sheds.get(sale.shedId);
  if (!shed)
    throw new Error('Every sale must name the shed its eggs came from.');
  if (!isDateString(sale.date, today))
    throw new Error('Each sale must have a valid date, no later than today.');
  if (
    typeof sale.customer !== 'string' ||
    !sale.customer.trim() ||
    sale.customer.length > 100
  )
    throw new Error('Enter a customer name (up to 100 characters).');
  if (!Number.isSafeInteger(sale.eggs) || sale.eggs < 1 || sale.eggs > 1e8)
    throw new Error('A sale must be for at least one egg.');
  if (!['egg', 'tray'].includes(sale.priceUnit))
    throw new Error('Choose whether the price is per egg or per tray.');
  if (!Number.isSafeInteger(sale.unitPriceMinor) || sale.unitPriceMinor < 1)
    throw new Error('Enter a price greater than zero.');
  if (
    typeof sale.discountPercent !== 'number' ||
    !Number.isFinite(sale.discountPercent) ||
    sale.discountPercent < 0 ||
    sale.discountPercent > 100
  )
    throw new Error('Discount must be between 0% and 100%.');
  if (typeof sale.notes !== 'string' || sale.notes.length > 1000)
    throw new Error('Sale notes must be no more than 1,000 characters.');
  // The entry is what the user typed; it must still describe the stored eggs.
  if (sale.entry && toEggs(sale.entry, traySize) !== sale.eggs)
    throw new Error('This sale’s quantity and unit no longer agree.');
  return sale;
}

export function validateData(input, today = dateKey()) {
  const data = migrateData(input, today);
  if (
    !data ||
    data.version !== VERSION ||
    typeof data.sample !== 'boolean' ||
    !data.settings ||
    !Array.isArray(data.sheds) ||
    !Array.isArray(data.records) ||
    !Array.isArray(data.sales)
  )
    throw new Error('Please choose a valid Flockbook backup.');

  const s = data.settings;
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80)
    throw new Error('Enter a farm name of up to 80 characters.');
  if (!Number.isSafeInteger(s.traySize) || s.traySize < 1 || s.traySize > 100)
    throw new Error('Eggs per tray must be a whole number between 1 and 100.');

  const sheds = new Map();
  for (const shed of data.sheds) {
    validateShed(shed);
    if (sheds.has(shed.id)) throw new Error('Two sheds share an identifier.');
    sheds.set(shed.id, shed);
  }

  const seen = new Set();
  for (const r of data.records) {
    validateRecord(r, sheds, today);
    const key = `${r.shedId}__${r.date}`;
    if (seen.has(key))
      throw new Error(
        `${sheds.get(r.shedId).name} already has a record for ${r.date}. Edit that record instead.`,
      );
    seen.add(key);
  }

  const ids = new Set();
  for (const sale of data.sales) {
    validateSale(sale, sheds, s.traySize, today);
    if (ids.has(sale.id)) throw new Error('Two sales share an identifier.');
    ids.add(sale.id);
  }

  // Ledgers are checked per shed, because each shed holds its own stock.
  for (const shed of data.sheds) {
    for (const row of eggLedger(data, shed.id))
      if (row.balance < 0)
        throw new Error(
          `Not enough egg stock in ${shed.name} on ${row.date}. Check sales, production, damage, or the opening stock.`,
        );
    for (const row of flockLedger(data, shed.id))
      if (row.strength < 0)
        throw new Error(
          `More birds have been recorded as lost than ${shed.name} held on ${row.date}. Check losses, birds added, or the opening flock.`,
        );
  }
  return data;
}

/* ------------------------------ migrations ------------------------------ */

export function migrateData(data, today = dateKey()) {
  let d = data;
  if (d?.version === 1) d = migrateV1ToV2(d, today);
  if (d?.version === 2) d = migrateV2ToV3(d);
  if (d?.version === 3) d = migrateV3ToV4(d);
  return d;
}

function validateLegacyV1(data, today) {
  if (
    !data ||
    data.version !== 1 ||
    !data.settings ||
    !Array.isArray(data.records)
  )
    throw new Error('Please choose a valid Flockbook backup.');
  const dates = new Set();
  for (const r of data.records) {
    if (!isDateString(r?.date, today) || dates.has(r.date))
      throw new Error(
        'Each record must have a unique valid date, no later than today.',
      );
    dates.add(r.date);
    for (const k of ['birds', 'eggs', 'trays', 'damaged'])
      if (!whole(r[k]))
        throw new Error(
          'Birds, eggs, trays, and damaged eggs must be non-negative whole numbers.',
        );
  }
  return data;
}

function migrateV1ToV2(data, today) {
  validateLegacyV1(data, today);
  return {
    ...data,
    version: 2,
    records: data.records.map(
      ({ date, birds, eggs, feed, damaged, notes }) => ({
        date,
        birds,
        eggs,
        feed,
        damaged,
        notes: notes ?? '',
      }),
    ),
    sales: data.records
      .filter((r) => r.trays > 0)
      .map((r) => ({
        id: `legacy-${r.date}`,
        date: r.date,
        customer: 'Previous daily sale',
        trays: r.trays,
        pricePerTray: Math.round(r.price * data.settings.traySize * 100) / 100,
        discountPercent: 0,
        notes:
          'Converted from a combined daily record. Customer was not recorded.',
      })),
  };
}

// Version 3 added flock movement: birds that died and birds brought in.
function migrateV2ToV3(data) {
  const ordered = [...data.records].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  return {
    ...data,
    version: 3,
    settings: { ...data.settings, openingBirds: ordered[0]?.birds ?? 0 },
    records: data.records.map((r) => ({ ...r, deaths: 0, added: 0 })),
  };
}

/**
 * Version 4 splits a farm into sheds. A single-flock farm becomes one shed
 * holding everything it already had, so no history is reinterpreted: tray
 * quantities become egg counts at the tray size that was in force, and rupee
 * prices become paise.
 */
function migrateV3ToV4(data) {
  const traySize = data.settings.traySize;
  const ordered = [...data.records].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const biggest = data.records.reduce((n, r) => Math.max(n, r.birds), 0);
  const shed = {
    id: 'main',
    code: 'S1',
    name: 'Main shed',
    // Capacity was never recorded, so take the largest count ever seen and
    // round up. The owner can correct it; nothing depends on the guess.
    capacity: Math.max(100, Math.ceil((biggest || 100) / 100) * 100),
    stage: 'production',
    stageSince: ordered[0]?.date ?? null,
    notProducingReason: null,
    notProducingNote: '',
    openingBirds: data.settings.openingBirds ?? 0,
    openingEggs: data.settings.openingStock ?? 0,
    breed: '',
    placedOn: null,
    archived: false,
  };
  return {
    version: VERSION,
    sample: data.sample,
    settings: { name: data.settings.name, traySize },
    sheds: [shed],
    records: data.records.map((r) => ({
      shedId: shed.id,
      date: r.date,
      stage: 'production',
      birds: r.birds,
      eggs: r.eggs,
      entry: { qty: r.eggs, unit: 'egg' },
      damaged: r.damaged,
      deaths: r.deaths ?? 0,
      added: r.added ?? 0,
      feedKg: (r.feed ?? 0) * 1000,
      feedEntry: { qty: r.feed ?? 0, unit: 'tonne' },
      notes: r.notes ?? '',
    })),
    sales: data.sales.map((s) => ({
      id: s.id,
      date: s.date,
      shedId: shed.id,
      customer: s.customer,
      eggs: s.trays * traySize,
      entry: { qty: s.trays, unit: 'tray' },
      unitPriceMinor: toMinor(s.pricePerTray, 'price per tray'),
      priceUnit: 'tray',
      discountPercent: s.discountPercent,
      notes: s.notes ?? '',
    })),
  };
}

/* ------------------------------ sample data ----------------------------- */

const SAMPLE_SHEDS = [
  {
    id: 'shed-north',
    code: 'S1',
    name: 'North layer shed',
    capacity: 2600,
    stage: 'production',
    weeksOld: 42,
    birds: 2480,
    lay: 0.88,
  },
  {
    id: 'shed-south',
    code: 'S2',
    name: 'South layer shed',
    capacity: 2200,
    stage: 'production',
    weeksOld: 31,
    birds: 2090,
    lay: 0.91,
  },
  {
    id: 'shed-pullet',
    code: 'S3',
    name: 'Pullet house',
    capacity: 1600,
    stage: 'growing',
    weeksOld: 12,
    birds: 1520,
    lay: 0,
  },
  {
    id: 'shed-brooder',
    code: 'S4',
    name: 'Brooder house',
    capacity: 1200,
    stage: 'brooding',
    weeksOld: 4,
    birds: 1150,
    lay: 0,
  },
];

export function seedData(now = new Date(), days = 180) {
  const traySize = 30;
  const sheds = [];
  const records = [];
  const sales = [];
  const dayOf = (i) =>
    dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
  const customers = ['Sunrise Wholesale', 'Lakshmi Stores', 'Walk-in customer'];
  const prices = [15600, 16800, 18000];

  for (const spec of SAMPLE_SHEDS) {
    sheds.push({
      id: spec.id,
      code: spec.code,
      name: spec.name,
      capacity: spec.capacity,
      stage: spec.stage,
      stageSince: dayOf(days - 1),
      notProducingReason: null,
      notProducingNote: '',
      openingBirds: spec.birds,
      openingEggs: spec.lay ? 1200 : 0,
      breed: 'BV300',
      placedOn: dayOf(spec.weeksOld * 7),
      archived: false,
    });

    let flock = spec.birds;
    for (let i = days - 1; i >= 0; i--) {
      const date = dayOf(i);
      const deaths = i % 9 === 0 ? 2 : i % 4 === 0 ? 1 : 0;
      flock -= deaths;
      const eggs = spec.lay
        ? Math.round(flock * spec.lay + Math.sin(i * 0.7) * 40)
        : 0;
      const damaged = spec.lay ? 4 + (i % 6) : 0;
      // Layers eat more than growers; both scale with the flock.
      const feedKg = Math.round(flock * (spec.lay ? 0.112 : 0.068) * 10) / 10;
      records.push({
        shedId: spec.id,
        date,
        stage: spec.stage,
        birds: flock,
        eggs,
        entry: { qty: eggs, unit: 'egg' },
        damaged,
        deaths,
        added: 0,
        feedKg,
        feedEntry: { qty: feedKg, unit: 'kg' },
        notes: '',
      });

      if (!spec.lay) continue;
      // Split the day's full trays across a few customers. Splitting whole
      // trays rather than shares of the collection keeps only loose eggs in
      // store, which is how a farm actually clears its stock.
      const dayTrays = Math.floor((eggs - damaged) / traySize);
      const shares = [
        Math.round(dayTrays * 0.6),
        Math.round(dayTrays * 0.25),
        0,
      ];
      shares[2] = dayTrays - shares[0] - shares[1];
      shares.forEach((trays, n) => {
        if (trays < 1) return;
        sales.push({
          id: `${spec.id}-${date}-${n}`,
          date,
          shedId: spec.id,
          customer: customers[n],
          eggs: trays * traySize,
          entry: { qty: trays, unit: 'tray' },
          unitPriceMinor: prices[n],
          priceUnit: 'tray',
          discountPercent: n === 1 ? 5 : 0,
          notes: '',
        });
      });
    }
  }

  return {
    version: VERSION,
    sample: true,
    settings: { name: 'Green Valley Poultry', traySize },
    sheds,
    records,
    sales,
  };
}

/** Filter dated rows to a month, or the quarter containing it. */
export function periodRecords(rows, month, mode) {
  const [year, m] = month.split('-').map(Number);
  const start = mode === 'quarterly' ? Math.floor((m - 1) / 3) * 3 : m - 1;
  const end = new Date(year, start + (mode === 'quarterly' ? 3 : 1), 1);
  const from = dateKey(new Date(year, start, 1));
  return rows
    .filter((r) => r.date >= from && r.date < dateKey(end))
    .sort((a, b) => a.date.localeCompare(b.date));
}
