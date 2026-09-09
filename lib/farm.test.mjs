import test from 'node:test';
import assert from 'node:assert/strict';
import { saleFromInputs } from './sale-inputs.mjs';
import {
  seedData,
  validateData,
  stockOf,
  totals,
  periodRecords,
  dateKey,
  migrateData,
  saleAmount,
  salesTotals,
  inventoryLedger,
} from './farm.mjs';
const day = (date, patch = {}) => ({
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

const sale = (id, date, patch = {}) => ({
  id,
  date,
  customer: 'Customer ' + id,
  trays: 1,
  pricePerTray: 180,
  discountPercent: 0,
  notes: '',
  ...patch,
});
const splitFarm = (records = [], sales = [], openingStock = 0) => ({
  version: 2,
  sample: false,
  settings: { name: 'Test farm', traySize: 30, openingStock },
  records: records.map(({ trays: _trays, price: _price, ...r }) => r),
  sales,
});
test('five customers can buy on the same day at different prices', () => {
  const sales = [
    sale('1', '2026-01-01', { trays: 130, pricePerTray: 150 }),
    sale('2', '2026-01-01', { trays: 3 }),
    sale('3', '2026-01-01', { trays: 2 }),
    sale('4', '2026-01-01', {
      trays: 5,
      pricePerTray: 170,
      discountPercent: 10,
    }),
    sale('5', '2026-01-01', { trays: 1, pricePerTray: 175 }),
  ];
  const d = splitFarm(
    [day('2026-01-01', { birds: 5000, eggs: 4500, damaged: 0 })],
    sales,
  );
  validateData(d);
  assert.equal(stockOf(d), 270);
  assert.equal(salesTotals(sales).amount, 21340);
  assert.equal(salesTotals(sales).discount, 85);
  assert.equal(salesTotals(sales).count, 5);
});
test('customer discounts affect sale value but never egg quantities', () => {
  const s = sale('1', '2026-01-01', {
    trays: 3,
    pricePerTray: 167.5,
    discountPercent: 5,
  });
  assert.equal(saleAmount(s), 477.38);
  assert.equal(stockOf(validateData(splitFarm([], [s], 120))), 30);
});
test('sales without production use opening stock and appear in the ledger', () => {
  const d = splitFarm(
    [],
    [sale('1', '2026-01-01'), sale('2', '2026-01-02', { trays: 2 })],
    120,
  );
  validateData(d);
  assert.deepEqual(
    inventoryLedger(d).map((r) => r.balance),
    [90, 30],
  );
  assert.equal(totals(d.records).days, 0);
});
test('cumulative customer sales cannot overdraw a day even if future production covers them', () => {
  const d = splitFarm(
    [day('2026-01-02')],
    [sale('1', '2026-01-01'), sale('2', '2026-01-01')],
    30,
  );
  assert.throws(() => validateData(d), /Not enough egg stock on 2026-01-01/);
});
test('editing a sale replaces its quantity and deleting returns stock', () => {
  const original = splitFarm([], [sale('1', '2026-01-01')], 120);
  const edited = { ...original, sales: [{ ...original.sales[0], trays: 3 }] };
  validateData(edited);
  assert.equal(stockOf(edited), 30);
  assert.equal(stockOf({ ...edited, sales: [] }), 120);
  assert.throws(
    () =>
      validateData({ ...edited, sales: [{ ...edited.sales[0], trays: 5 }] }),
    /Not enough egg stock/,
  );
});
test('old backups migrate without mutating input or losing stock and sales value', () => {
  const original = farm(
      [day('2026-01-01', { price: 5.33, notes: 'Original note' })],
      10,
    ),
    copy = structuredClone(original);
  const upgraded = validateData(original);
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.sales.length, 1);
  assert.equal(upgraded.sales[0].pricePerTray, 159.9);
  assert.equal(salesTotals(upgraded.sales).amount, 319.8);
  assert.equal(stockOf(upgraded), 28);
  assert.equal(upgraded.records[0].notes, 'Original note');
  assert.equal('trays' in upgraded.records[0], false);
  assert.deepEqual(original, copy);
  assert.deepEqual(migrateData(upgraded), upgraded);
});
test('sales validate customer, IDs, price, discount, quantity and date', () => {
  for (const patch of [
    { customer: ' ' },
    { trays: 0 },
    { trays: 1.5 },
    { pricePerTray: NaN },
    { pricePerTray: 1.001 },
    { discountPercent: -1 },
    { discountPercent: 101 },
    { discountPercent: Infinity },
    { date: '2026-02-30' },
    { date: '2027-01-01' },
  ])
    assert.throws(() =>
      validateData(
        splitFarm([], [sale('1', '2026-01-01', patch)], 1000),
        '2026-09-09',
      ),
    );
  const duplicate = sale('1', '2026-01-01');
  assert.throws(
    () => validateData(splitFarm([], [duplicate, duplicate], 1000)),
    /unique/,
  );
});
test('sample data includes wholesale, retail and discounted regular customer entries', () => {
  const d = seedData(new Date(2026, 8, 9));
  assert.equal(d.sales.length, 540);
  assert.ok(d.sales.some((s) => s.trays >= 100));
  assert.ok(d.sales.some((s) => s.trays === 3));
  assert.ok(d.sales.some((s) => s.discountPercent === 5));
  validateData(d, '2026-09-09');
});
const farm = (records, openingStock = 0) => ({
  version: 1,
  sample: false,
  settings: { name: 'Test farm', traySize: 30, openingStock },
  records,
});
test('stock reconciles collection, sales, damage and opening balance', () => {
  const d = farm([day('2026-01-01')], 10);
  validateData(d);
  assert.equal(stockOf(d), 28);
  assert.equal(totals(d.records).revenue, 300);
});
test('rejects historical shortages even when the final balance is positive', () => {
  const d = farm([
    day('2026-01-02', { trays: 0 }),
    day('2026-01-01', { trays: 3 }),
  ]);
  assert.throws(() => validateData(d), /Not enough egg stock on 2026-01-01/);
});
test('deleting production cannot silently invalidate a later sale', () => {
  const d = farm([
    day('2026-01-01', { trays: 0, damaged: 0 }),
    day('2026-01-02', { eggs: 0, trays: 2, damaged: 0 }),
  ]);
  validateData(d);
  assert.equal(stockOf(d), 20);
  assert.throws(
    () => validateData({ ...d, records: d.records.slice(1) }),
    /Not enough egg stock/,
  );
});
test('prevents duplicates, invalid dates and future records', () => {
  for (const records of [
    [day('2026-01-01'), day('2026-01-01')],
    [day('2026-02-30')],
    [day('2027-01-01')],
  ])
    assert.throws(() => validateData(farm(records), '2026-09-09'), /date/);
});
test('validates imported numbers and damaged stock', () => {
  for (const patch of [
    { feed: NaN },
    { price: Infinity },
    { eggs: 101 },
    { birds: 1.5 },
    { trays: -1 },
    { damaged: 1000 },
    { price: 0 },
  ])
    assert.throws(() => validateData(farm([day('2026-01-01', patch)])));
});
test('monthly and quarterly filters handle year boundaries', () => {
  const records = [
    day('2025-12-31'),
    day('2026-01-01'),
    day('2026-03-31'),
    day('2026-04-01'),
  ];
  assert.equal(periodRecords(records, '2026-02', 'quarterly').length, 2);
  assert.equal(periodRecords(records, '2025-12', 'monthly').length, 1);
  assert.equal(periodRecords(records, '2026-04', 'quarterly').length, 1);
});
test('laying rate is weighted by bird-days and feed uses metric tonnes', () => {
  const t = totals([
    day('2026-01-01', { birds: 100, eggs: 80 }),
    day('2026-01-02', { birds: 200, eggs: 100 }),
  ]);
  assert.equal(t.rate, 60);
  assert.equal(t.days, 2);
  assert.ok(Math.abs(t.feedPerDozen - (20 / 180) * 12) < 1e-9);
  assert.equal(totals([]).rate, 0);
});
test('six months of example records are deterministic and valid', () => {
  const d = seedData(new Date(2026, 8, 9));
  validateData(d, '2026-09-09');
  assert.equal(d.records.length, 180);
  assert.equal(d.records.at(-1).date, '2026-09-09');
  assert.ok(stockOf(d) > 0);
  assert.deepEqual(seedData(new Date(2026, 8, 9)), d);
});
test('malformed backups fail intentionally', () => {
  for (const value of [
    null,
    {},
    farm([null]),
    { ...farm([]), settings: { name: '', openingStock: 0, traySize: 30 } },
  ])
    assert.throws(() => validateData(value));
});
test('local date helper avoids UTC day shifts', () => {
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('blank sales inputs cannot be saved as zero; replacement values become numbers', () => {
  const base = sale('edit', '2026-01-01');
  for (const field of ['trays', 'price', 'discount'])
    assert.throws(
      () =>
        saleFromInputs(
          base,
          {
            trays: '10',
            price: '180',
            discount: '0',
            unit: 'tray',
            [field]: '',
          },
          30,
        ),
      /Enter trays/,
    );
  const saved = saleFromInputs(
    base,
    { trays: '10', price: '180', discount: '0', unit: 'tray' },
    30,
  );
  assert.equal(saved.trays, 10);
  assert.equal(saved.pricePerTray, 180);
  assert.equal(saleAmount(saved), 1800);
});
test('per-egg and per-tray entry produce identical discounted sales and stock', () => {
  const base = sale('units', '2026-01-01');
  const egg = saleFromInputs(
    base,
    { trays: '10', price: '5.55', discount: '5', unit: 'egg' },
    30,
  );
  const tray = saleFromInputs(
    base,
    { trays: '10', price: '166.50', discount: '5', unit: 'tray' },
    30,
  );
  assert.equal(egg.pricePerTray, 166.5);
  assert.equal(saleAmount(egg), 1581.75);
  assert.equal(saleAmount(tray), saleAmount(egg));
  assert.equal(stockOf(validateData(splitFarm([], [egg], 600))), 300);
  assert.equal(
    validateData(JSON.parse(JSON.stringify(splitFarm([], [egg], 600)))).sales[0]
      .priceUnit,
    'egg',
  );
});
test('per-egg conversion respects custom tray sizes and rejects invalid input', () => {
  const base = sale('custom', '2026-01-01');
  assert.equal(
    saleFromInputs(
      base,
      { trays: '2', price: '6.25', discount: '0', unit: 'egg' },
      12,
    ).pricePerTray,
    75,
  );
  for (const patch of [
    { price: '0' },
    { price: '5.555' },
    { price: 'abc' },
    { trays: '1.5' },
    { unit: 'box' },
    { discount: '101' },
  ])
    assert.throws(() =>
      saleFromInputs(
        base,
        { trays: '10', price: '180', discount: '0', unit: 'tray', ...patch },
        30,
      ),
    );
  assert.throws(
    () =>
      validateData(
        splitFarm(
          [],
          [{ ...base, pricePerTray: 167.5, priceUnit: 'egg' }],
          600,
        ),
      ),
    /Price per egg/,
  );
});
