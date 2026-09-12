import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toEggs,
  fromEggs,
  traySizeOf,
  toMinor,
  fromMinor,
  formatMinor,
  saleAmountMinor,
  salesTotalMinor,
  toKg,
  validateEntry,
} from './units.mjs';

test('trays convert to a canonical egg count', () => {
  assert.equal(toEggs({ qty: 30, unit: 'tray' }, 30), 900);
  assert.equal(toEggs({ qty: 900, unit: 'egg' }, 30), 900);
  assert.equal(toEggs({ qty: 30, unit: 'tray' }, 12), 360);
  assert.equal(toEggs({ qty: 0, unit: 'tray' }, 30), 0);
});

test('a stored egg count survives a change of tray size', () => {
  // 30 trays of 30 is 900 eggs. Switching the farm to 12-egg trays must not
  // rewrite what was physically sold.
  const eggs = toEggs({ qty: 30, unit: 'tray' }, 30);
  const entry = { qty: 30, unit: 'tray' };
  assert.equal(eggs, 900);
  // The tray size in force at entry is still recoverable, so the sale can be
  // shown correctly as "30 trays" rather than 75 trays of the new size.
  assert.equal(traySizeOf(entry, eggs), 30);
  assert.equal(traySizeOf({ qty: 900, unit: 'egg' }, 900), null);
});

test('display splits an awkward egg count into trays and loose eggs', () => {
  assert.deepEqual(fromEggs(905, 'tray', 30), {
    qty: 30,
    unit: 'tray',
    remainder: 5,
  });
  assert.deepEqual(fromEggs(905, 'egg', 30), {
    qty: 905,
    unit: 'egg',
    remainder: 0,
  });
});

test('entries must be whole and non-negative, in a known unit', () => {
  for (const bad of [
    { qty: -1, unit: 'egg' },
    { qty: 1.5, unit: 'tray' },
    { qty: 5, unit: 'dozen' },
    null,
  ])
    assert.throws(() => validateEntry(bad), Error, JSON.stringify(bad));
  assert.throws(() => toEggs({ qty: 1, unit: 'tray' }, 0), /Eggs per tray/);
});

test('rupees convert to paise without float drift', () => {
  assert.equal(toMinor(180.5), 18050);
  assert.equal(toMinor(180.55), 18055);
  assert.equal(toMinor(6.02), 602);
  assert.equal(toMinor(0.1) + toMinor(0.2), toMinor(0.3));
  assert.equal(fromMinor(18055), 180.55);
  assert.equal(formatMinor(18055), '₹180.55');
});

test('summing many sales in paise stays exact', () => {
  // The same sum in floating point drifts off the true total.
  const sale = {
    eggs: 900,
    unitPriceMinor: 18055,
    priceUnit: 'tray',
    discountPercent: 0,
  };
  // 900 eggs is 30 trays at ₹180.55, so ₹5,416.50 a sale.
  const perSale = 30 * 18055;
  const { netMinor, eggs, count } = salesTotalMinor(Array(500).fill(sale), 30);
  assert.equal(netMinor, perSale * 500);
  assert.equal(eggs, 450000);
  assert.equal(count, 500);
  assert.equal(Number.isSafeInteger(netMinor), true);
});

test('sale value rounds once on gross and once on net', () => {
  // 900 eggs at ₹180.55 per 30-egg tray = 30 trays exactly.
  assert.deepEqual(
    saleAmountMinor(
      {
        eggs: 900,
        unitPriceMinor: 18055,
        priceUnit: 'tray',
        discountPercent: 0,
      },
      30,
    ),
    { grossMinor: 541650, netMinor: 541650, discountMinor: 0 },
  );
  // A price per egg applies directly, no tray conversion.
  assert.deepEqual(
    saleAmountMinor(
      { eggs: 900, unitPriceMinor: 602, priceUnit: 'egg', discountPercent: 0 },
      30,
    ),
    { grossMinor: 541800, netMinor: 541800, discountMinor: 0 },
  );
});

test('a discount reduces value and never quantity', () => {
  const sale = {
    eggs: 900,
    unitPriceMinor: 18000,
    priceUnit: 'tray',
    discountPercent: 10,
  };
  const { grossMinor, netMinor, discountMinor } = saleAmountMinor(sale, 30);
  assert.equal(grossMinor, 540000);
  assert.equal(netMinor, 486000);
  assert.equal(discountMinor, 54000);
  assert.equal(sale.eggs, 900);
});

test('a part-tray price per tray still yields whole paise', () => {
  // 905 eggs at ₹180.55 per 30-egg tray: 6018.33 paise per egg, rounded once.
  const { grossMinor } = saleAmountMinor(
    { eggs: 905, unitPriceMinor: 18055, priceUnit: 'tray', discountPercent: 0 },
    30,
  );
  assert.equal(grossMinor, Math.round(905 * (18055 / 30)));
  assert.equal(Number.isSafeInteger(grossMinor), true);
});

test('feed converts to kilograms', () => {
  assert.equal(toKg({ qty: 0.563, unit: 'tonne' }), 563);
  assert.equal(toKg({ qty: 563, unit: 'kg' }), 563);
  assert.throws(() => toKg({ qty: 1, unit: 'bags' }), /kilograms or tonnes/);
  assert.throws(() => toKg({ qty: -1, unit: 'kg' }), /non-negative/);
});

test('a missing amount is reported as missing, not as a typo', () => {
  // This surfaced from stored data in an unexpected shape, where the bare
  // "Enter a valid amount" gave no clue which value or record was at fault.
  assert.throws(
    () => toMinor(undefined, 'price per tray'),
    /No price per tray was found where one was expected/,
  );
  assert.throws(() => toMinor(null), /No amount was found/);
  assert.throws(() => toMinor('180', 'price'), /Enter a valid price/);
  assert.throws(() => toMinor(-1, 'price'), /Enter a valid price/);
});
