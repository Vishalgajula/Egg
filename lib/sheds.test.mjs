import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData, dateKey, seedData } from './farm.mjs';
import {
  flockLedger,
  currentBirds,
  shedStrength,
  shedStock,
  farmStock,
  totals,
  salesTotals,
  utilisation,
  flockAgeWeeks,
  alerts,
  isLaying,
} from './sheds.mjs';

const shed = (id, patch = {}) => ({
  id,
  code: id.toUpperCase(),
  name: `Shed ${id}`,
  capacity: 1000,
  stage: 'production',
  stageSince: '2026-01-01',
  notProducingReason: null,
  notProducingNote: '',
  openingBirds: 500,
  openingEggs: 0,
  breed: '',
  placedOn: null,
  archived: false,
  ...patch,
});

const rec = (shedId, date, patch = {}) => ({
  shedId,
  date,
  stage: 'production',
  birds: 500,
  eggs: 400,
  entry: { qty: 400, unit: 'egg' },
  damaged: 0,
  deaths: 0,
  added: 0,
  feedKg: 55,
  feedEntry: { qty: 55, unit: 'kg' },
  notes: '',
  ...patch,
});

const sale = (id, shedId, date, patch = {}) => ({
  id,
  date,
  shedId,
  customer: 'Customer',
  eggs: 300,
  entry: { qty: 10, unit: 'tray' },
  unitPriceMinor: 18000,
  priceUnit: 'tray',
  discountPercent: 0,
  notes: '',
  ...patch,
});

const farm = (sheds, records = [], sales = []) => ({
  version: 4,
  sample: false,
  settings: { name: 'Test farm', traySize: 30 },
  sheds,
  records,
  sales,
});

/* ------------------------------- ledgers -------------------------------- */

test('each shed keeps its own egg stock', () => {
  const data = farm(
    [shed('a', { openingEggs: 100 }), shed('b', { openingEggs: 0 })],
    [
      rec('a', '2026-01-01'),
      rec('b', '2026-01-01', { eggs: 50, entry: { qty: 50, unit: 'egg' } }),
    ],
    [sale('s1', 'a', '2026-01-01')],
  );
  validateData(data, '2026-01-01');
  assert.equal(shedStock(data, 'a'), 100 + 400 - 300);
  assert.equal(shedStock(data, 'b'), 50);
  assert.equal(farmStock(data), 250);
});

test('a sale is refused when its own shed cannot cover it, even if the farm can', () => {
  // Shed A holds 100 eggs; shed B holds 1,000. A sale of 300 from A must fail.
  const data = farm(
    [shed('a', { openingEggs: 100 }), shed('b', { openingEggs: 1000 })],
    [],
    [sale('s1', 'a', '2026-01-01')],
  );
  assert.throws(
    () => validateData(data, '2026-01-01'),
    /Not enough egg stock in Shed a/,
  );
});

test('stock shortages are caught on the date they happen, not just at the end', () => {
  const data = farm(
    [shed('a', { openingEggs: 0 })],
    [rec('a', '2026-01-03')],
    [sale('s1', 'a', '2026-01-02')],
  );
  assert.throws(
    () => validateData(data, '2026-01-05'),
    /Not enough egg stock in Shed a on 2026-01-02/,
  );
});

test('flock ledger carries losses and intake forward per shed', () => {
  const data = farm(
    [shed('a', { openingBirds: 500 })],
    [
      rec('a', '2026-01-01', { birds: 498, deaths: 2 }),
      rec('a', '2026-01-02', { birds: 548, deaths: 0, added: 50 }),
    ],
  );
  validateData(data, '2026-01-02');
  const rows = flockLedger(data, 'a');
  assert.deepEqual(
    rows.map((r) => r.strength),
    [498, 548],
  );
  assert.deepEqual(
    rows.map((r) => r.variance),
    [0, 0],
  );
  assert.equal(shedStrength(data, 'a'), 548);
});

test('a recount that disagrees with the log is reported, not rejected', () => {
  const data = farm(
    [shed('a', { openingBirds: 500 })],
    [rec('a', '2026-01-01', { birds: 495, deaths: 2 })],
  );
  validateData(data, '2026-01-01');
  const [row] = flockLedger(data, 'a');
  assert.equal(row.strength, 498);
  assert.equal(row.counted, 495);
  assert.equal(row.variance, -3);
});

test('a shed cannot lose more birds than it holds', () => {
  const data = farm(
    [shed('a', { openingBirds: 10 })],
    [
      rec('a', '2026-01-01', {
        birds: 0,
        eggs: 0,
        entry: { qty: 0, unit: 'egg' },
        deaths: 50,
      }),
    ],
  );
  assert.throws(
    () => validateData(data, '2026-01-01'),
    /More birds have been recorded as lost than Shed a held/,
  );
});

/* ------------------------------ stage rules ----------------------------- */

test('only a laying shed may record eggs', () => {
  for (const stage of ['brooding', 'growing', 'not_producing']) {
    const sheds = [
      shed('a', {
        stage,
        notProducingReason: stage === 'not_producing' ? 'moulting' : null,
      }),
    ];
    assert.throws(
      () =>
        validateData(
          farm(sheds, [rec('a', '2026-01-01', { stage })]),
          '2026-01-01',
        ),
      /cannot have collected eggs/,
      stage,
    );
  }
  // The two laying stages are accepted.
  for (const stage of ['production', 'early_production'])
    validateData(
      farm([shed('a', { stage })], [rec('a', '2026-01-01', { stage })]),
      '2026-01-01',
    );
});

test('an empty shed cannot have birds, losses or feed', () => {
  assert.throws(
    () =>
      validateData(
        farm(
          [shed('a', { stage: 'empty', openingBirds: 0 })],
          [
            rec('a', '2026-01-01', {
              stage: 'empty',
              birds: 20,
              eggs: 0,
              entry: { qty: 0, unit: 'egg' },
              feedKg: 0,
            }),
          ],
        ),
        '2026-01-01',
      ),
    /is empty on 2026-01-01/,
  );
});

test('a shed not producing must say why', () => {
  assert.throws(
    () =>
      validateData(farm([shed('a', { stage: 'not_producing' })]), '2026-01-01'),
    /Say why Shed a is not producing/,
  );
  validateData(
    farm([
      shed('a', { stage: 'not_producing', notProducingReason: 'disease' }),
    ]),
    '2026-01-01',
  );
});

test('birds cannot exceed the shed capacity', () => {
  assert.throws(
    () =>
      validateData(
        farm(
          [shed('a', { capacity: 400 })],
          [rec('a', '2026-01-01', { birds: 500 })],
        ),
        '2026-01-01',
      ),
    /more than its capacity of 400/,
  );
});

test('one record per shed per day, and a sale must name a real shed', () => {
  assert.throws(
    () =>
      validateData(
        farm([shed('a')], [rec('a', '2026-01-01'), rec('a', '2026-01-01')]),
        '2026-01-01',
      ),
    /already has a record for 2026-01-01/,
  );
  assert.throws(
    () =>
      validateData(
        farm([shed('a')], [], [sale('s1', 'ghost', '2026-01-01')]),
        '2026-01-01',
      ),
    /must name the shed its eggs came from/,
  );
  // The same date in two different sheds is perfectly normal.
  validateData(
    farm(
      [shed('a'), shed('b')],
      [rec('a', '2026-01-01'), rec('b', '2026-01-01')],
    ),
    '2026-01-01',
  );
});

test('a sale whose entry disagrees with its egg count is rejected', () => {
  assert.throws(
    () =>
      validateData(
        farm(
          [shed('a', { openingEggs: 5000 })],
          [],
          // 10 trays of 30 is 300 eggs, not 500.
          [sale('s1', 'a', '2026-01-01', { eggs: 500 })],
        ),
        '2026-01-01',
      ),
    /quantity and unit no longer agree/,
  );
});

/* -------------------------------- rollups ------------------------------- */

test('laying rate counts only laying sheds', () => {
  const records = [
    // 900 eggs from 1,000 laying bird-days.
    rec('a', '2026-01-01', {
      birds: 1000,
      eggs: 900,
      entry: { qty: 900, unit: 'egg' },
    }),
    // A brooding shed of 1,000 chicks contributes birds but no eggs.
    rec('b', '2026-01-01', {
      stage: 'brooding',
      birds: 1000,
      eggs: 0,
      entry: { qty: 0, unit: 'egg' },
    }),
  ];
  const t = totals(records);
  assert.equal(t.layingRate, 90);
  // Counting every bird would have produced a misleading 45%.
  assert.equal((t.eggs / t.birdDays) * 100, 45);
  assert.equal(t.eggs, 900);
  assert.equal(t.birdDays, 2000);
  assert.equal(t.layingBirdDays, 1000);
});

test('feed per dozen ignores feed eaten by non-laying sheds', () => {
  const t = totals([
    rec('a', '2026-01-01', {
      birds: 1000,
      eggs: 900,
      entry: { qty: 900, unit: 'egg' },
      feedKg: 110,
    }),
    rec('b', '2026-01-01', {
      stage: 'growing',
      birds: 1000,
      eggs: 0,
      entry: { qty: 0, unit: 'egg' },
      feedKg: 70,
    }),
  ]);
  // 110 kg over 900 eggs, not 180 kg.
  assert.equal(t.feedPerDozen, ((110 * 1000) / 900) * 12);
  assert.equal(t.layingFeedKg, 110);
  assert.equal(t.feedKg, 180);
});

test('an empty period does not divide by zero', () => {
  const t = totals([]);
  assert.equal(t.layingRate, 0);
  assert.equal(t.feedPerDozen, 0);
  assert.equal(t.mortalityRate, 0);
  assert.equal(t.days, 0);
});

test('sale totals stay in integer paise', () => {
  const t = salesTotals(
    [
      sale('1', 'a', '2026-01-01'),
      sale('2', 'a', '2026-01-01', { discountPercent: 10 }),
    ],
    30,
  );
  // 300 eggs is 10 trays at ₹180 = ₹1,800 each; the second is 10% off.
  assert.equal(t.grossMinor, 180000 + 180000);
  assert.equal(t.netMinor, 180000 + 162000);
  assert.equal(t.discountMinor, 18000);
  assert.equal(t.eggs, 600);
  assert.equal(Number.isSafeInteger(t.netMinor), true);
});

test('utilisation and flock age read off the shed', () => {
  const data = farm([
    shed('a', { capacity: 1000, openingBirds: 950, placedOn: '2026-01-01' }),
  ]);
  assert.equal(utilisation(data, 'a'), 95);
  assert.equal(flockAgeWeeks(data.sheds[0], '2026-01-29'), 4);
  assert.equal(flockAgeWeeks(shed('b'), '2026-01-29'), null);
});

test('isLaying names exactly the two producing stages', () => {
  assert.deepEqual(
    [
      'brooding',
      'growing',
      'early_production',
      'production',
      'not_producing',
      'empty',
    ].filter(isLaying),
    ['early_production', 'production'],
  );
});

/* -------------------------------- alerts -------------------------------- */

test('alerts flag over capacity and a mortality spike', () => {
  const over = farm([shed('a', { capacity: 100, openingBirds: 150 })], []);
  const messages = alerts(over, '2026-01-10').map((a) => a.message);
  assert.equal(
    messages.some((m) => /more birds than its capacity/.test(m)),
    true,
  );

  const spike = farm(
    [shed('b', { capacity: 1000, openingBirds: 500 })],
    [rec('b', '2026-01-01', { birds: 480, deaths: 20 })],
  );
  assert.equal(
    alerts(spike, '2026-01-01').some((a) => /lost 20 birds/.test(a.message)),
    true,
  );
});

test('a healthy sample farm raises no alerts', () => {
  const data = seedData();
  validateData(data);
  assert.deepEqual(alerts(data, dateKey()), []);
});

test('a shed with no opening flock still reports the birds that were counted', () => {
  // The common real case: a shed is added without an opening flock, then
  // records are entered with a counted bird figure and no intake or losses.
  // A purely derived strength would report zero birds for ever.
  const data = farm(
    [shed('a', { openingBirds: 0, capacity: 1000 })],
    [
      rec('a', '2026-01-01', { birds: 500, deaths: 0, added: 0 }),
      rec('a', '2026-01-02', { birds: 498, deaths: 0, added: 0 }),
    ],
  );
  validateData(data, '2026-01-02');
  assert.equal(shedStrength(data, 'a'), 0); // what the log predicts
  assert.equal(currentBirds(data, 'a'), 498); // what somebody counted
  // Occupancy follows the real birds, not the prediction.
  assert.equal(utilisation(data, 'a'), 49.8);
});

test('with no records at all, the opening flock is the best figure available', () => {
  const data = farm([shed('a', { openingBirds: 300 })]);
  assert.equal(currentBirds(data, 'a'), 300);
  assert.equal(currentBirds(data, 'missing'), 0);
});
