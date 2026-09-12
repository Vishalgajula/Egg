// Turning form text into validated records.
//
// Inputs stay as strings while a user is typing, so a cleared field is blank
// rather than silently zero. Conversion happens once, on save, and produces
// the canonical integers the rest of the model relies on.

import { QUANTITY_UNITS, toEggs, toKg, toMinor } from './units.mjs';

const WHOLE = /^[0-9]+$/;
const DECIMAL_2 = /^[0-9]+(\.[0-9]{1,2})?$/;
const DECIMAL_3 = /^[0-9]+(\.[0-9]{1,3})?$/;

function requireTraySize(traySize) {
  if (!Number.isSafeInteger(traySize) || traySize < 1 || traySize > 100)
    throw new Error('Check your farm’s eggs per tray setting.');
}

/** A whole count typed into a field, in eggs or trays. */
function quantity(value, unit, traySize, label) {
  if (!String(value).trim()) throw new Error(`Enter ${label}.`);
  if (!WHOLE.test(value)) throw new Error(`${label} must be a whole number.`);
  if (!QUANTITY_UNITS.includes(unit))
    throw new Error(`Choose whether ${label} is counted in eggs or trays.`);
  const qty = Number(value);
  if (!Number.isSafeInteger(qty)) throw new Error(`${label} is too large.`);
  return { entry: { qty, unit }, eggs: toEggs({ qty, unit }, traySize) };
}

/**
 * Build a sale from its form inputs.
 *
 * `inputs` is `{ qty, qtyUnit, price, priceUnit, discount }`, all strings
 * except the units.
 */
export function saleFromInputs(sale, inputs, traySize) {
  requireTraySize(traySize);
  const { qty, qtyUnit, price, priceUnit, discount } = inputs;
  if (!String(price).trim() || !String(discount).trim())
    throw new Error(
      'Enter quantity, price and discount before saving. Use 0 for no discount.',
    );

  const { entry, eggs } = quantity(qty, qtyUnit, traySize, 'quantity sold');
  if (eggs < 1) throw new Error('A sale must be for at least one egg.');

  if (!DECIMAL_2.test(price) || Number(price) <= 0)
    throw new Error('Enter a positive price with at most two decimal places.');
  if (priceUnit !== 'tray' && priceUnit !== 'egg')
    throw new Error('Choose price per tray or price per egg.');
  if (!DECIMAL_2.test(discount) || Number(discount) > 100)
    throw new Error(
      'Discount must be between 0% and 100%, with at most two decimal places.',
    );

  if (!sale.shedId) throw new Error('Choose which shed these eggs came from.');

  return {
    ...sale,
    eggs,
    entry,
    unitPriceMinor: toMinor(Number(price)),
    priceUnit,
    discountPercent: Number(discount),
  };
}

/**
 * Build a daily production record from its form inputs.
 *
 * `inputs` is `{ eggs, eggUnit, feed, feedUnit, birds, deaths, added, damaged }`.
 */
export function recordFromInputs(record, inputs, traySize) {
  requireTraySize(traySize);
  const { eggs, eggUnit, feed, feedUnit } = inputs;

  for (const [key, label] of [
    ['birds', 'laying hens'],
    ['deaths', 'birds lost'],
    ['added', 'birds added'],
    ['damaged', 'damaged eggs'],
  ]) {
    const raw = String(inputs[key] ?? '').trim();
    if (!raw) throw new Error(`Enter ${label}. Use 0 if there were none.`);
    if (!WHOLE.test(raw)) throw new Error(`${label} must be a whole number.`);
  }

  const collected = quantity(eggs, eggUnit, traySize, 'eggs collected');

  if (!String(feed).trim())
    throw new Error('Enter feed consumed. Use 0 if none was given.');
  if (!DECIMAL_3.test(feed))
    throw new Error('Feed must be a number with at most three decimals.');

  return {
    ...record,
    birds: Number(inputs.birds),
    deaths: Number(inputs.deaths),
    added: Number(inputs.added),
    damaged: Number(inputs.damaged),
    eggs: collected.eggs,
    entry: collected.entry,
    feedKg: toKg({ qty: Number(feed), unit: feedUnit }),
    feedEntry: { qty: Number(feed), unit: feedUnit },
  };
}
