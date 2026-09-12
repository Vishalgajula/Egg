// Shed model: stages, per-shed ledgers, and farm rollups.
//
// A farm holds many sheds of different sizes whose birds are at different
// ages. The shed is the unit of record; the farm is a rollup. Nothing here
// touches React, the network or storage — see docs/REQUIREMENTS.md sections
// 2 and 3.

import { saleAmountMinor } from './units.mjs';

export const SHED_STAGES = [
  'brooding',
  'growing',
  'early_production',
  'production',
  'not_producing',
  'empty',
];

/** Only these stages may record eggs, and only these count toward laying rate. */
export const LAYING_STAGES = ['early_production', 'production'];

export const NOT_PRODUCING_REASONS = [
  'disease',
  'moulting',
  'old_age',
  'cleaning',
  'between_batches',
  'other',
];

export const STAGE_LABELS = {
  brooding: 'Brooding',
  growing: 'Growing',
  early_production: 'Early production',
  production: 'In production',
  not_producing: 'Not producing',
  empty: 'Empty',
};

export const REASON_LABELS = {
  disease: 'Disease',
  moulting: 'Moulting',
  old_age: 'Old age',
  cleaning: 'Cleaning',
  between_batches: 'Between batches',
  other: 'Other',
};

export const isLaying = (stage) => LAYING_STAGES.includes(stage);

export const shedById = (data, shedId) =>
  data.sheds.find((s) => s.id === shedId) ?? null;

const byDate = (rows) => [...rows].sort((a, b) => a.date.localeCompare(b.date));

export const recordsOf = (data, shedId) =>
  byDate(data.records.filter((r) => r.shedId === shedId));

export const salesOf = (data, shedId) =>
  byDate(data.sales.filter((s) => s.shedId === shedId));

/**
 * Birds through one shed over time.
 *
 * `strength` is what the log predicts; `counted` is what somebody actually
 * counted that day. The gap between them is reported, never corrected: a
 * recount that disagrees is information, and forcing them equal destroys it.
 */
export function flockLedger(data, shedId) {
  const shed = shedById(data, shedId);
  let strength = shed?.openingBirds ?? 0;
  return recordsOf(data, shedId).map((r) => {
    strength += (r.added ?? 0) - (r.deaths ?? 0);
    return {
      date: r.date,
      stage: r.stage,
      added: r.added ?? 0,
      deaths: r.deaths ?? 0,
      counted: r.birds,
      strength,
      variance: r.birds - strength,
    };
  });
}

/**
 * Bird count the shed's log *predicts*: opening flock, plus intake, less
 * losses. Used for the variance cross-check and for validation, not for
 * display — see `currentBirds`.
 */
export function shedStrength(data, shedId) {
  const rows = flockLedger(data, shedId);
  return rows.length
    ? rows[rows.length - 1].strength
    : (shedById(data, shedId)?.openingBirds ?? 0);
}

/**
 * Birds the shed actually holds, for anything a person reads.
 *
 * This is the most recent counted figure, because that is what somebody
 * observed. The predicted strength is only as good as the opening flock it
 * starts from, and a shed created without one would otherwise report zero
 * birds for ever while its records plainly say otherwise.
 */
export function currentBirds(data, shedId) {
  const records = recordsOf(data, shedId);
  return records.length
    ? records[records.length - 1].birds
    : (shedById(data, shedId)?.openingBirds ?? 0);
}

/**
 * Eggs through one shed over time. Each shed holds its own stock, so a sale
 * draws from exactly one shed and is reconciled against that shed alone.
 */
export function eggLedger(data, shedId) {
  const shed = shedById(data, shedId);
  const rows = new Map();
  const row = (date) => {
    if (!rows.has(date)) rows.set(date, { date, eggs: 0, damaged: 0, sold: 0 });
    return rows.get(date);
  };
  for (const r of recordsOf(data, shedId)) {
    const entry = row(r.date);
    entry.eggs += r.eggs;
    entry.damaged += r.damaged;
  }
  for (const s of salesOf(data, shedId)) row(s.date).sold += s.eggs;

  let balance = shed?.openingEggs ?? 0;
  return byDate([...rows.values()]).map((r) => {
    balance += r.eggs - r.damaged - r.sold;
    return { ...r, balance };
  });
}

/** Eggs a shed holds now. */
export function shedStock(data, shedId) {
  const rows = eggLedger(data, shedId);
  return rows.length
    ? rows[rows.length - 1].balance
    : (shedById(data, shedId)?.openingEggs ?? 0);
}

/** Eggs the whole farm holds, as the sum of its sheds. */
export function farmStock(data) {
  return data.sheds.reduce((sum, s) => sum + shedStock(data, s.id), 0);
}

/**
 * Totals over a set of records.
 *
 * Laying rate and feed per dozen use **laying sheds only**. A farm-wide rate
 * that includes brooding chicks collapses every time a healthy new batch is
 * placed, which is the opposite of useful.
 */
export function totals(records) {
  const t = records.reduce(
    (a, r) => ({
      eggs: a.eggs + r.eggs,
      damaged: a.damaged + r.damaged,
      feedKg: a.feedKg + r.feedKg,
      deaths: a.deaths + (r.deaths ?? 0),
      added: a.added + (r.added ?? 0),
      birdDays: a.birdDays + r.birds,
      layingEggs: a.layingEggs + (isLaying(r.stage) ? r.eggs : 0),
      layingBirdDays: a.layingBirdDays + (isLaying(r.stage) ? r.birds : 0),
      layingFeedKg: a.layingFeedKg + (isLaying(r.stage) ? r.feedKg : 0),
      layingDays: a.layingDays + (isLaying(r.stage) ? 1 : 0),
    }),
    {
      eggs: 0,
      damaged: 0,
      feedKg: 0,
      deaths: 0,
      added: 0,
      birdDays: 0,
      layingEggs: 0,
      layingBirdDays: 0,
      layingFeedKg: 0,
      layingDays: 0,
    },
  );
  const averageBirds = records.length ? t.birdDays / records.length : 0;
  return {
    ...t,
    days: records.length,
    averageBirds,
    layingRate: t.layingBirdDays ? (t.layingEggs / t.layingBirdDays) * 100 : 0,
    // Grams of feed per dozen eggs, over laying sheds only.
    feedPerDozen: t.layingEggs
      ? ((t.layingFeedKg * 1000) / t.layingEggs) * 12
      : 0,
    mortalityRate: averageBirds ? (t.deaths / averageBirds) * 100 : 0,
  };
}

/** Totals for one shed over a set of records already filtered by period. */
export function shedTotals(data, shedId, records) {
  return totals(records.filter((r) => r.shedId === shedId));
}

/** Sale value for a period, in paise. */
export function salesTotals(sales, traySize) {
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

/**
 * How full a shed is. Over 100% means more birds than it was built for.
 * Measured against the counted flock, since that is the real occupancy.
 */
export function utilisation(data, shedId) {
  const shed = shedById(data, shedId);
  if (!shed?.capacity) return 0;
  return (currentBirds(data, shedId) / shed.capacity) * 100;
}

/** Flock age in weeks, when the batch placement date is known. */
export function flockAgeWeeks(shed, today) {
  if (!shed?.placedOn) return null;
  const ms =
    Date.parse(today + 'T12:00:00') - Date.parse(shed.placedOn + 'T12:00:00');
  return ms < 0 ? null : Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Things worth a farmer's attention. These are reported, never enforced —
 * blocking a save because a count looks odd would just push staff to enter
 * something false.
 */
export function alerts(data, today) {
  const out = [];
  for (const shed of data.sheds) {
    if (shed.archived) continue;
    const used = utilisation(data, shed.id);
    if (used > 100)
      out.push({
        severity: 'high',
        shedId: shed.id,
        message: `${shed.name} holds more birds than its capacity of ${shed.capacity}.`,
      });
    else if (used > 95)
      out.push({
        severity: 'low',
        shedId: shed.id,
        message: `${shed.name} is at ${used.toFixed(0)}% of capacity.`,
      });

    if (shed.stage === 'not_producing' && !shed.notProducingReason)
      out.push({
        severity: 'medium',
        shedId: shed.id,
        message: `${shed.name} is marked not producing without a reason.`,
      });

    const age = flockAgeWeeks(shed, today);
    if (age !== null && age > 22 && shed.stage === 'early_production')
      out.push({
        severity: 'medium',
        shedId: shed.id,
        message: `${shed.name} has been in early production at ${age} weeks; a flock this age is usually in full lay.`,
      });

    const ledger = flockLedger(data, shed.id);
    const recent = ledger.slice(-7);
    const deaths = recent.reduce((n, r) => n + r.deaths, 0);
    const strength = currentBirds(data, shed.id);
    if (strength > 0 && deaths / strength > 0.01)
      out.push({
        severity: 'high',
        shedId: shed.id,
        message: `${shed.name} lost ${deaths} birds in the last ${recent.length} recorded days.`,
      });
  }
  return out;
}
