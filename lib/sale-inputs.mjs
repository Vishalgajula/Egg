// Keep editable inputs as text; convert only for a preview or a validated save.
export function saleFromInputs(sale, inputs, traySize) {
  const { trays, price, discount, unit } = inputs;
  if (!trays.trim() || !price.trim() || !discount.trim())
    throw new Error(
      'Enter trays, price, and discount before saving. Use 0 for no discount.',
    );
  if (
    !/^\d+$/.test(trays) ||
    !Number.isSafeInteger(Number(trays)) ||
    Number(trays) < 1
  )
    throw new Error('Trays sold must be a positive whole number.');
  if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0)
    throw new Error('Enter a positive price with at most two decimal places.');
  if (!/^\d+(\.\d{1,2})?$/.test(discount) || Number(discount) > 100)
    throw new Error(
      'Discount must be between 0% and 100%, with at most two decimal places.',
    );
  if (unit !== 'tray' && unit !== 'egg')
    throw new Error('Choose price per tray or price per egg.');
  if (!Number.isSafeInteger(traySize) || traySize < 1)
    throw new Error('Check your farm’s eggs per tray setting.');
  const cents = Math.round(Number(price) * 100);
  return {
    ...sale,
    trays: Number(trays),
    pricePerTray: (cents * (unit === 'egg' ? traySize : 1)) / 100,
    discountPercent: Number(discount),
    priceUnit: unit,
  };
}
