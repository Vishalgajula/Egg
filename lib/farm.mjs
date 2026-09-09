export const STORAGE_KEY = 'flockbook.v1';
export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function seedData(now = new Date()) {
  const records = [];
  for (let i = 179; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const eggs = Math.round(4300 + (179 - i) * 1.5 + Math.sin(i * 0.8) * 130);
    records.push({
      date: dateKey(d),
      birds: 5200,
      eggs,
      trays: Math.floor((eggs - 35) / 30),
      feed: Number((0.563 + Math.sin(i * 0.4) * 0.016).toFixed(3)),
      price: Number((5.3 + Math.sin(i * 0.15) * 0.25).toFixed(2)),
      damaged: 12 + (i % 8),
      notes: '',
    });
  }
  const data = migrateData({
    version: 1,
    sample: true,
    settings: {
      name: 'Green Valley Poultry',
      openingStock: 3600,
      traySize: 30,
    },
    records,
  });
  data.sales = data.sales.flatMap((s) => {
    const quantities = [s.trays - 11, 3, 8];
    return quantities.map((trays, i) => ({
      ...s,
      id: `${s.id}-${i}`,
      customer: ['Sunrise Wholesale', 'Walk-in customer', 'Lakshmi Stores'][i],
      trays,
      pricePerTray: [156, 180, 168][i],
      discountPercent: i === 2 ? 5 : 0,
    }));
  });
  return data;
}
function validateLegacy(data, today = dateKey()) {
  if (
    !data ||
    data.version !== 1 ||
    typeof data.sample !== 'boolean' ||
    !data.settings ||
    !Array.isArray(data.records)
  )
    throw new Error('Please choose a valid Flockbook backup.');
  const s = data.settings;
  if (
    typeof s.name !== 'string' ||
    !s.name.trim() ||
    s.name.length > 80 ||
    !Number.isSafeInteger(s.openingStock) ||
    s.openingStock < 0 ||
    !Number.isSafeInteger(s.traySize) ||
    s.traySize < 1 ||
    s.traySize > 100
  )
    throw new Error(
      'Check the farm name, opening stock, and tray size (1–100).',
    );
  let stock = s.openingStock;
  const dates = new Set();
  if (data.records.some((r) => !r || typeof r !== 'object' || Array.isArray(r)))
    throw new Error('Every backup record must be a valid daily entry.');
  for (const r of [...data.records].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  )) {
    if (
      typeof r.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      !Number.isFinite(Date.parse(r.date)) ||
      new Date(r.date).toISOString().slice(0, 10) !== r.date ||
      r.date > today ||
      dates.has(r.date)
    )
      throw new Error(
        'Each record must have a unique valid date, no later than today.',
      );
    dates.add(r.date);
    for (const k of ['birds', 'eggs', 'trays', 'damaged'])
      if (!Number.isSafeInteger(r[k]) || r[k] < 0 || r[k] > 1e8)
        throw new Error(
          'Birds, eggs, trays, and damaged eggs must be non-negative whole numbers.',
        );
    if (r.eggs > r.birds)
      throw new Error(
        'Egg production cannot exceed the number of laying hens. Check your daily totals.',
      );
    for (const k of ['feed', 'price'])
      if (
        typeof r[k] !== 'number' ||
        !Number.isFinite(r[k]) ||
        r[k] < 0 ||
        r[k] > 1e6
      )
        throw new Error('Feed and price must be valid non-negative numbers.');
    if (r.trays > 0 && r.price <= 0)
      throw new Error('Enter a price per egg when recording sales.');
    if (
      r.notes != null &&
      (typeof r.notes !== 'string' || r.notes.length > 1000)
    )
      throw new Error('Notes must be no more than 1,000 characters.');
    stock += r.eggs - r.trays * s.traySize - r.damaged;
    if (stock < 0)
      throw new Error(
        `Not enough egg stock on ${r.date}. Check sales, damage, or opening stock.`,
      );
  }
  return data;
}
export function totals(records, traySize = 30) {
  const t = records.reduce(
    (a, r) => ({
      eggs: a.eggs + r.eggs,
      feed: a.feed + r.feed,
      birds: a.birds + r.birds,
      trays: a.trays + (r.trays ?? 0),
      damaged: a.damaged + r.damaged,
      revenue: a.revenue + (r.trays ?? 0) * traySize * (r.price ?? 0),
    }),
    { eggs: 0, feed: 0, birds: 0, trays: 0, damaged: 0, revenue: 0 },
  );
  return {
    ...t,
    days: records.length,
    rate: t.birds ? (t.eggs / t.birds) * 100 : 0,
    feedPerDozen: t.eggs ? ((t.feed * 1000) / t.eggs) * 12 : 0,
  };
}
export function stockOf(data) {
  data = data.version === 1 ? migrateData(data) : data;
  const t = totals(data.records, data.settings.traySize);
  return (
    data.settings.openingStock +
    t.eggs -
    salesTotals(data.sales).trays * data.settings.traySize -
    t.damaged
  );
}

// Keep the original key so existing browsers find their saved pilot records.
export function migrateData(data, today = dateKey()) {
  if (data?.version !== 1) return data;
  validateLegacy(data, today);
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
export function saleAmount(sale) {
  return (
    Math.round(
      sale.trays * sale.pricePerTray * (1 - sale.discountPercent / 100) * 100,
    ) / 100
  );
}
export function salesTotals(sales) {
  const amount =
    sales.reduce((a, s) => a + Math.round(saleAmount(s) * 100), 0) / 100;
  const gross =
    sales.reduce((a, s) => a + Math.round(s.trays * s.pricePerTray * 100), 0) /
    100;
  return {
    trays: sales.reduce((a, s) => a + s.trays, 0),
    amount,
    discount: Math.round((gross - amount) * 100) / 100,
    count: sales.length,
  };
}
export function inventoryLedger(data) {
  const entries = new Map();
  for (const r of data.records)
    entries.set(r.date, {
      date: r.date,
      eggs: r.eggs,
      damaged: r.damaged,
      trays: 0,
    });
  for (const s of data.sales) {
    const row = entries.get(s.date) ?? {
      date: s.date,
      eggs: 0,
      damaged: 0,
      trays: 0,
    };
    row.trays += s.trays;
    entries.set(s.date, row);
  }
  let balance = data.settings.openingStock;
  return [...entries.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      balance += r.eggs - r.damaged - r.trays * data.settings.traySize;
      return { ...r, balance };
    });
}
export function validateData(input, today = dateKey()) {
  const data = migrateData(input, today);
  if (
    !data ||
    data.version !== 2 ||
    typeof data.sample !== 'boolean' ||
    !data.settings ||
    !Array.isArray(data.records) ||
    !Array.isArray(data.sales)
  )
    throw new Error('Please choose a valid Flockbook backup.');
  // Reuse production constraints without treating sales as a production field.
  validateLegacy(
    {
      ...data,
      version: 1,
      records: data.records.map((r) => r && { ...r, trays: 0, price: 0 }),
    },
    today,
  );
  const ids = new Set();
  for (const s of data.sales) {
    if (
      s &&
      s.priceUnit != null &&
      s.priceUnit !== 'tray' &&
      s.priceUnit !== 'egg'
    )
      throw new Error('Choose a valid sale pricing unit.');
    if (
      !s ||
      typeof s !== 'object' ||
      typeof s.id !== 'string' ||
      !s.id ||
      s.id.length > 100 ||
      ids.has(s.id)
    )
      throw new Error('Every sale must have a unique valid ID.');
    ids.add(s.id);
    if (
      typeof s.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      !Number.isFinite(Date.parse(s.date)) ||
      new Date(s.date).toISOString().slice(0, 10) !== s.date ||
      s.date > today
    )
      throw new Error('Each sale must have a valid date, no later than today.');
    if (
      typeof s.customer !== 'string' ||
      !s.customer.trim() ||
      s.customer.length > 100
    )
      throw new Error('Enter a customer name (up to 100 characters).');
    if (!Number.isSafeInteger(s.trays) || s.trays < 1 || s.trays > 1e8)
      throw new Error('Trays sold must be a positive whole number.');
    if (
      typeof s.pricePerTray !== 'number' ||
      !Number.isFinite(s.pricePerTray) ||
      s.pricePerTray <= 0 ||
      s.pricePerTray > 1e6 ||
      Math.abs(s.pricePerTray * 100 - Math.round(s.pricePerTray * 100)) > 1e-6
    )
      throw new Error(
        'Enter a positive price per tray with at most two decimal places.',
      );
    if (
      typeof s.discountPercent !== 'number' ||
      !Number.isFinite(s.discountPercent) ||
      s.discountPercent < 0 ||
      s.discountPercent > 100
    )
      throw new Error('Discount must be between 0% and 100%.');
    if (
      s.priceUnit === 'egg' &&
      Math.abs(
        (s.pricePerTray * 100) / data.settings.traySize -
          Math.round((s.pricePerTray * 100) / data.settings.traySize),
      ) > 1e-6
    )
      throw new Error('Price per egg must have at most two decimal places.');
    if (typeof s.notes !== 'string' || s.notes.length > 1000)
      throw new Error('Sale notes must be no more than 1,000 characters.');
  }
  for (const row of inventoryLedger(data))
    if (row.balance < 0)
      throw new Error(
        `Not enough egg stock on ${row.date}. Check sales, production, damage, or opening stock.`,
      );
  return data;
}
export function periodRecords(records, month, mode) {
  const [year, m] = month.split('-').map(Number);
  const start = mode === 'quarterly' ? Math.floor((m - 1) / 3) * 3 : m - 1;
  const end = new Date(year, start + (mode === 'quarterly' ? 3 : 1), 1);
  const from = dateKey(new Date(year, start, 1));
  return records
    .filter((r) => r.date >= from && r.date < dateKey(end))
    .sort((a, b) => a.date.localeCompare(b.date));
}
