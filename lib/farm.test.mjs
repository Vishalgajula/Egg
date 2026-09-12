import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedData,
  validateData,
  migrateData,
  periodRecords,
  dateKey,
  VERSION,
} from './farm.mjs';
import { shedStock, shedStrength, salesTotals, isLaying } from './sheds.mjs';
import { saleFromInputs, recordFromInputs } from './inputs.mjs';

const legacyDay = (date, patch = {}) => ({
  date,
  birds: 100,
  eggs: 80,
  trays: 2,
  price: 5,
  feed: 0.01,
  damaged: 2,
  notes: '',
  ...patch,
});

const legacyFarm = (records, openingStock = 0) => ({
  version: 1,
  sample: false,
  settings: { name: 'Test farm', traySize: 30, openingStock },
  records,
});

/* ------------------------------ migrations ------------------------------ */

test('a version 1 backup migrates all the way to version 4 without mutating it', () => {
  const original = legacyFarm(
    [legacyDay('2026-01-01', { price: 5.33, notes: 'Original note' })],
    10,
  );
  const copy = structuredClone(original);
  const upgraded = validateData(original, '2026-01-01');

  assert.equal(upgraded.version, VERSION);
  assert.equal(upgraded.sheds.length, 1);
  assert.equal(upgraded.sheds[0].name, 'Main shed');
  assert.equal(upgraded.records[0].notes, 'Original note');
  // The input object is never touched, so a failed load leaves storage intact.
  assert.deepEqual(original, copy);
  // Migrating an already-migrated farm is a no-op.
  assert.deepEqual(migrateData(upgraded), upgraded);
});

test('migrating to sheds preserves quantities and converts money to paise', () => {
  const upgraded = validateData(
    legacyFarm([legacyDay('2026-01-01', { price: 5.33 })], 10),
    '2026-01-01',
  );
  const [sale] = upgraded.sales;
  // 2 trays of 30 eggs. The old per-egg price of 5.33 became a per-tray price
  // of 159.90, which is 15990 paise.
  assert.equal(sale.eggs, 60);
  assert.deepEqual(sale.entry, { qty: 2, unit: 'tray' });
  assert.equal(sale.unitPriceMinor, 15990);
  assert.equal(sale.priceUnit, 'tray');
  assert.equal(salesTotals(upgraded.sales, 30).netMinor, 31980);
  // Opening stock 10 + 80 collected - 60 sold - 2 damaged.
  assert.equal(shedStock(upgraded, 'main'), 28);
});

test('migration moves opening balances onto the shed and keeps feed as kilograms', () => {
  const upgraded = validateData(
    legacyFarm([legacyDay('2026-01-01', { feed: 0.563 })], 10),
    '2026-01-01',
  );
  const [shed] = upgraded.sheds;
  assert.equal(shed.openingEggs, 10);
  assert.equal(shed.openingBirds, 100);
  assert.equal(shed.capacity >= 100, true);
  assert.equal(upgraded.records[0].feedKg, 563);
  assert.deepEqual(upgraded.records[0].feedEntry, {
    qty: 0.563,
    unit: 'tonne',
  });
  // Settings keep only what is still farm-wide.
  assert.deepEqual(Object.keys(upgraded.settings).sort(), ['name', 'traySize']);
});

test('a migrated shed starts with no unexplained flock variance', () => {
  const upgraded = validateData(
    legacyFarm([legacyDay('2026-01-01')], 10),
    '2026-01-01',
  );
  assert.equal(shedStrength(upgraded, 'main'), upgraded.records[0].birds);
});

/* ------------------------------ sample data ----------------------------- */

test('sample data covers laying, growing and brooding sheds and validates', () => {
  const data = seedData(new Date('2026-06-30T12:00:00'));
  validateData(data, '2026-06-30');
  assert.equal(data.version, VERSION);
  assert.equal(data.sheds.length, 4);
  const stages = data.sheds.map((s) => s.stage);
  assert.equal(stages.filter(isLaying).length, 2);
  assert.equal(stages.includes('growing'), true);
  assert.equal(stages.includes('brooding'), true);
  // Non-laying sheds produce no eggs and make no sales.
  for (const shed of data.sheds.filter((s) => !isLaying(s.stage))) {
    assert.equal(
      data.records
        .filter((r) => r.shedId === shed.id)
        .every((r) => r.eggs === 0),
      true,
    );
    assert.equal(
      data.sales.some((s) => s.shedId === shed.id),
      false,
    );
  }
});

test('sample data is deterministic for a given date', () => {
  const a = seedData(new Date('2026-06-30T12:00:00'), 30);
  const b = seedData(new Date('2026-06-30T12:00:00'), 30);
  assert.deepEqual(a, b);
});

/* ------------------------------ validation ------------------------------ */

test('malformed backups are rejected', () => {
  for (const bad of [
    null,
    {},
    { version: 4 },
    { version: 99, settings: {}, sheds: [], records: [], sales: [] },
    {
      version: 4,
      sample: false,
      settings: { name: '', traySize: 30 },
      sheds: [],
      records: [],
      sales: [],
    },
    {
      version: 4,
      sample: false,
      settings: { name: 'F', traySize: 0 },
      sheds: [],
      records: [],
      sales: [],
    },
  ])
    assert.throws(() => validateData(bad), Error, JSON.stringify(bad));
});

test('future dates are refused', () => {
  const data = seedData(new Date('2026-06-30T12:00:00'), 5);
  data.records.push({ ...data.records[0], date: '2026-07-05' });
  assert.throws(() => validateData(data, '2026-06-30'), /no later than today/);
});

/* --------------------------------- dates -------------------------------- */

test('the local date helper avoids UTC day shifts', () => {
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(dateKey(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
});

test('monthly and quarterly filters handle year boundaries', () => {
  const rows = [
    { date: '2025-12-31' },
    { date: '2026-01-01' },
    { date: '2026-02-15' },
    { date: '2026-03-31' },
    { date: '2026-04-01' },
  ];
  assert.deepEqual(
    periodRecords(rows, '2026-01', 'monthly').map((r) => r.date),
    ['2026-01-01'],
  );
  assert.deepEqual(
    periodRecords(rows, '2026-02', 'quarterly').map((r) => r.date),
    ['2026-01-01', '2026-02-15', '2026-03-31'],
  );
});

/* -------------------------------- inputs -------------------------------- */

const blankSale = {
  id: 's1',
  date: '2026-01-01',
  shedId: 'a',
  customer: 'C',
  notes: '',
};

test('blank sale inputs cannot be saved as zero', () => {
  for (const inputs of [
    {
      qty: '',
      qtyUnit: 'tray',
      price: '180',
      priceUnit: 'tray',
      discount: '0',
    },
    { qty: '10', qtyUnit: 'tray', price: '', priceUnit: 'tray', discount: '0' },
    {
      qty: '10',
      qtyUnit: 'tray',
      price: '180',
      priceUnit: 'tray',
      discount: '',
    },
  ])
    assert.throws(() => saleFromInputs(blankSale, inputs, 30), Error);
});

test('a sale can be entered in trays or in eggs and mean the same thing', () => {
  const byTray = saleFromInputs(
    blankSale,
    {
      qty: '10',
      qtyUnit: 'tray',
      price: '180',
      priceUnit: 'tray',
      discount: '0',
    },
    30,
  );
  const byEgg = saleFromInputs(
    blankSale,
    {
      qty: '300',
      qtyUnit: 'egg',
      price: '6',
      priceUnit: 'egg',
      discount: '0',
    },
    30,
  );
  assert.equal(byTray.eggs, 300);
  assert.equal(byEgg.eggs, 300);
  // Both are ₹1,800, reached from different units.
  assert.equal(salesTotals([byTray], 30).netMinor, 180000);
  assert.equal(salesTotals([byEgg], 30).netMinor, 180000);
  // Each remembers how it was typed.
  assert.deepEqual(byTray.entry, { qty: 10, unit: 'tray' });
  assert.deepEqual(byEgg.entry, { qty: 300, unit: 'egg' });
});

test('sale inputs reject bad numbers and a missing shed', () => {
  for (const inputs of [
    {
      qty: '1.5',
      qtyUnit: 'tray',
      price: '180',
      priceUnit: 'tray',
      discount: '0',
    },
    {
      qty: '10',
      qtyUnit: 'tray',
      price: '180.555',
      priceUnit: 'tray',
      discount: '0',
    },
    {
      qty: '10',
      qtyUnit: 'tray',
      price: '0',
      priceUnit: 'tray',
      discount: '0',
    },
    {
      qty: '10',
      qtyUnit: 'tray',
      price: '180',
      priceUnit: 'tray',
      discount: '101',
    },
    {
      qty: '10',
      qtyUnit: 'dozen',
      price: '180',
      priceUnit: 'tray',
      discount: '0',
    },
  ])
    assert.throws(
      () => saleFromInputs(blankSale, inputs, 30),
      Error,
      JSON.stringify(inputs),
    );
  assert.throws(
    () =>
      saleFromInputs(
        { ...blankSale, shedId: '' },
        {
          qty: '10',
          qtyUnit: 'tray',
          price: '180',
          priceUnit: 'tray',
          discount: '0',
        },
        30,
      ),
    /which shed/,
  );
});

test('production can be entered in trays or eggs, and feed in kg or tonnes', () => {
  const base = {
    shedId: 'a',
    date: '2026-01-01',
    stage: 'production',
    notes: '',
  };
  const common = { birds: '500', deaths: '0', added: '0', damaged: '5' };
  const inTrays = recordFromInputs(
    base,
    {
      ...common,
      eggs: '15',
      eggUnit: 'tray',
      feed: '0.055',
      feedUnit: 'tonne',
    },
    30,
  );
  const inEggs = recordFromInputs(
    base,
    { ...common, eggs: '450', eggUnit: 'egg', feed: '55', feedUnit: 'kg' },
    30,
  );
  assert.equal(inTrays.eggs, 450);
  assert.equal(inEggs.eggs, 450);
  assert.equal(inTrays.feedKg, 55);
  assert.equal(inEggs.feedKg, 55);
  assert.deepEqual(inTrays.entry, { qty: 15, unit: 'tray' });
  assert.deepEqual(inTrays.feedEntry, { qty: 0.055, unit: 'tonne' });
});

test('blank production fields are refused rather than treated as zero', () => {
  const base = {
    shedId: 'a',
    date: '2026-01-01',
    stage: 'production',
    notes: '',
  };
  const ok = {
    birds: '500',
    deaths: '0',
    added: '0',
    damaged: '5',
    eggs: '450',
    eggUnit: 'egg',
    feed: '55',
    feedUnit: 'kg',
  };
  for (const key of ['birds', 'deaths', 'added', 'damaged', 'eggs', 'feed'])
    assert.throws(
      () => recordFromInputs(base, { ...ok, [key]: '' }, 30),
      Error,
      key,
    );
});
