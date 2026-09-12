// Unit handling for quantities, feed and money.
//
// The rule the whole model rests on: store the canonical value, store what the
// user typed, never store a derived float. Quantities are integer egg counts,
// money is integer paise. See docs/REQUIREMENTS.md section 4.

export const QUANTITY_UNITS = ['egg', 'tray'];
export const FEED_UNITS = ['kg', 'tonne'];
export const PRICE_UNITS = ['egg', 'tray'];

const MAX_EGGS = 1e8;
const MAX_MINOR = 1e10;

/** A quantity as the user typed it, e.g. `{ qty: 30, unit: 'tray' }`. */
export function validateEntry(entry, label = 'Quantity') {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${label} is missing.`);
  if (!QUANTITY_UNITS.includes(entry.unit))
    throw new Error(`${label} must be entered in eggs or trays.`);
  if (!Number.isSafeInteger(entry.qty) || entry.qty < 0 || entry.qty > MAX_EGGS)
    throw new Error(`${label} must be a whole number, and cannot be negative.`);
  return entry;
}

/**
 * Canonical egg count for an entry. Trays are whole only: a part tray is
 * entered in eggs, which keeps every stored quantity an integer.
 */
export function toEggs(entry, traySize) {
  validateEntry(entry);
  if (!Number.isSafeInteger(traySize) || traySize < 1 || traySize > 100)
    throw new Error('Eggs per tray must be a whole number between 1 and 100.');
  return entry.unit === 'tray' ? entry.qty * traySize : entry.qty;
}

/**
 * Present a canonical egg count in a chosen unit. Trays may not divide evenly,
 * so the remainder is returned rather than hidden.
 */
export function fromEggs(eggs, unit, traySize) {
  if (unit === 'egg') return { qty: eggs, unit, remainder: 0 };
  return {
    qty: Math.floor(eggs / traySize),
    unit: 'tray',
    remainder: eggs % traySize,
  };
}

/**
 * The tray size in force when an entry was written, recoverable without being
 * stored. Returns null for entries typed in eggs, where it never applied.
 */
export function traySizeOf(entry, eggs) {
  return entry?.unit === 'tray' && entry.qty > 0 ? eggs / entry.qty : null;
}

/** Rupees to paise. Rounds, so 180.555 becomes 18056. */
export function toMinor(rupees) {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0)
    throw new Error('Enter a valid amount.');
  const minor = Math.round(rupees * 100);
  if (minor > MAX_MINOR) throw new Error('That amount is too large.');
  return minor;
}

/** Paise to rupees, for display only. Never feed this back into arithmetic. */
export function fromMinor(minor) {
  return minor / 100;
}

export function formatMinor(minor) {
  return (
    '₹' +
    fromMinor(minor).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Sale value in paise. Exactly two roundings: one to turn a possibly
 * fractional per-egg price into a gross, one to apply the discount. Discounts
 * change value, never quantity.
 */
export function saleAmountMinor(sale, traySize) {
  const perEggMinor =
    sale.priceUnit === 'egg'
      ? sale.unitPriceMinor
      : sale.unitPriceMinor / traySize;
  const grossMinor = Math.round(sale.eggs * perEggMinor);
  const netMinor = Math.round(grossMinor * (1 - sale.discountPercent / 100));
  return { grossMinor, netMinor, discountMinor: grossMinor - netMinor };
}

/** Sum sale values without ever leaving integer arithmetic. */
export function salesTotalMinor(sales, traySize) {
  return sales.reduce(
    (acc, s) => {
      const { grossMinor, netMinor, discountMinor } = saleAmountMinor(
        s,
        traySize,
      );
      return {
        grossMinor: acc.grossMinor + grossMinor,
        netMinor: acc.netMinor + netMinor,
        discountMinor: acc.discountMinor + discountMinor,
        eggs: acc.eggs + s.eggs,
        count: acc.count + 1,
      };
    },
    { grossMinor: 0, netMinor: 0, discountMinor: 0, eggs: 0, count: 0 },
  );
}

/** Feed is stored in kilograms; one tonne is 1,000 kg. */
export function toKg(feedEntry) {
  if (!feedEntry || !FEED_UNITS.includes(feedEntry.unit))
    throw new Error('Feed must be entered in kilograms or tonnes.');
  const { qty, unit } = feedEntry;
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)
    throw new Error('Feed must be a non-negative number.');
  return unit === 'tonne' ? qty * 1000 : qty;
}

export function fromKg(kg, unit) {
  return { qty: unit === 'tonne' ? kg / 1000 : kg, unit };
}
