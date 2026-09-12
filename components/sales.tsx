import { useState, type SubmitEvent } from 'react';
import { Check, Download, Pencil, ShoppingBasket, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { dateKey } from '@/lib/farm.mjs';
import { saleAmountMinor, formatMinor, fromMinor } from '@/lib/units.mjs';
import { salesTotals } from '@/lib/sheds.mjs';
import { saleFromInputs } from '@/lib/inputs.mjs';
import { NumberField, UnitToggle } from '@/components/fields';
import type { Sale, Shed } from '@/lib/repository';

const fmt = (n: number) => n.toLocaleString('en-IN');
const niceDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Describe a stored sale in the unit it was entered in. */
export function describeQuantity(sale: Sale, traySize: number) {
  if (sale.entry?.unit === 'tray') {
    // The tray size in force at entry is recoverable, so a sale still reads
    // correctly after the farm changes its tray size.
    const size = sale.entry.qty > 0 ? sale.eggs / sale.entry.qty : traySize;
    return `${fmt(sale.entry.qty)} ${sale.entry.qty === 1 ? 'tray' : 'trays'}${
      size !== traySize ? ` of ${size}` : ''
    }`;
  }
  return `${fmt(sale.eggs)} eggs`;
}

export function SaleDialog({
  initial,
  existing,
  sheds,
  traySize,
  stockOf,
  onClose,
  onSave,
}: {
  initial: Sale;
  existing: boolean;
  sheds: Shed[];
  traySize: number;
  stockOf: (shedId: string) => number;
  onClose: () => void;
  onSave: (sale: Sale) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [qtyUnit, setQtyUnit] = useState<'tray' | 'egg'>(
    initial.entry?.unit ?? 'tray',
  );
  const [priceUnit, setPriceUnit] = useState<'tray' | 'egg'>(
    initial.priceUnit ?? 'tray',
  );
  const [qtyText, setQtyText] = useState(
    initial.entry ? String(initial.entry.qty) : '',
  );
  const [priceText, setPriceText] = useState(
    initial.unitPriceMinor ? String(fromMinor(initial.unitPriceMinor)) : '',
  );
  const [discountText, setDiscountText] = useState(
    String(initial.discountPercent ?? 0),
  );
  const [error, setError] = useState('');

  const inputs = {
    qty: qtyText,
    qtyUnit,
    price: priceText,
    priceUnit,
    discount: discountText,
  };
  let preview: Sale | null = null;
  try {
    preview = saleFromInputs(draft, inputs, traySize) as Sale;
  } catch {
    /* Incomplete fields stay blank while editing. */
  }

  const available = draft.shedId ? stockOf(draft.shedId) : 0;

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      onSave(
        saleFromInputs(
          { ...draft, customer: draft.customer.trim() },
          inputs,
          traySize,
        ) as Sale,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const amounts = preview ? saleAmountMinor(preview, traySize) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="record-dialog">
        <DialogTitle className="dialog-title">
          {existing ? 'Edit customer sale' : 'Record a sale'}
        </DialogTitle>
        <DialogDescription>
          One customer, one entry. Eggs come out of the shed you choose.
        </DialogDescription>
        <form onSubmit={submit}>
          <label htmlFor="sale-shed">
            Shed the eggs came from
            <select
              id="sale-shed"
              required
              value={draft.shedId}
              onChange={(e) => setDraft({ ...draft, shedId: e.target.value })}
            >
              <option value="" disabled>
                Choose a shed…
              </option>
              {sheds.map((shed) => (
                <option key={shed.id} value={shed.id}>
                  {shed.code} · {shed.name} — {fmt(stockOf(shed.id))} eggs in
                  store
                </option>
              ))}
            </select>
          </label>
          <label>
            Customer name
            <input
              autoComplete="off"
              required
              maxLength={100}
              value={draft.customer}
              placeholder="e.g. Sunrise Wholesale or a walk-in customer"
              onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Sale date
              <input
                type="date"
                required
                max={dateKey()}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <NumberField
              label={qtyUnit === 'tray' ? 'Trays sold' : 'Eggs sold'}
              value={qtyText}
              onChange={setQtyText}
              min="1"
            />
          </div>
          <UnitToggle
            label="Quantity unit"
            value={qtyUnit}
            options={[
              { value: 'tray', label: 'Count in trays' },
              { value: 'egg', label: 'Count in eggs' },
            ]}
            onChange={(next) => {
              setQtyUnit(next);
              setQtyText('');
              setError('');
            }}
          />
          <div className="form-grid">
            <NumberField
              label={
                priceUnit === 'egg' ? 'Price per egg (₹)' : 'Price per tray (₹)'
              }
              value={priceText}
              onChange={setPriceText}
              decimals
              min="0.01"
            />
            <NumberField
              label="Discount (%)"
              value={discountText}
              onChange={setDiscountText}
              decimals
            />
          </div>
          <UnitToggle
            label="Pricing unit"
            value={priceUnit}
            options={[
              { value: 'tray', label: 'Price per tray' },
              { value: 'egg', label: 'Price per egg' },
            ]}
            onChange={(next) => {
              setPriceUnit(next);
              setPriceText('');
              setError('');
            }}
          />
          <p className="field-note">
            Count and price can each use either unit. Changing a unit clears its
            field so you can enter a fresh figure. {traySize} eggs = 1 tray.
          </p>
          {preview && amounts ? (
            <div className="sale-receipt">
              <div>
                <span>
                  {describeQuantity(preview, traySize)} ·{' '}
                  {formatMinor(preview.unitPriceMinor)} per {preview.priceUnit}
                </span>
                <strong>{formatMinor(amounts.grossMinor)}</strong>
              </div>
              <div>
                <span>Customer discount ({preview.discountPercent}%)</span>
                <span>−{formatMinor(amounts.discountMinor)}</span>
              </div>
              <div className="receipt-total">
                <span>Sale total</span>
                <strong>{formatMinor(amounts.netMinor)}</strong>
              </div>
              <p>
                {fmt(preview.eggs)} eggs leaving this shed ·{' '}
                {formatMinor(Math.round(amounts.netMinor / preview.eggs))} net
                per egg
              </p>
            </div>
          ) : (
            <div className="sale-receipt">
              <p>
                Enter quantity, price and discount to calculate the sale total.
              </p>
            </div>
          )}
          <label>
            Notes <span className="optional">(optional)</span>
            <textarea
              maxLength={1000}
              value={draft.notes}
              placeholder="e.g. Regular customer discount"
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <p className="field-note">
            {draft.shedId
              ? `This shed holds ${fmt(available)} eggs today. Availability is checked on the sale date, including other sales that day.`
              : 'Choose a shed to see what it has in store.'}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="primary">
              <Check size={17} />
              Save sale
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SalesPanel({
  sales,
  sheds,
  traySize,
  canEdit,
  onEdit,
  onDelete,
  onAdd,
}: {
  sales: Sale[];
  sheds: Shed[];
  traySize: number;
  canEdit: boolean;
  onEdit: (sale: Sale) => void;
  onDelete: (sale: Sale) => void;
  onAdd: () => void;
}) {
  const [page, setPage] = useState(1);
  const total = salesTotals(sales, traySize);
  const pages = Math.max(1, Math.ceil(sales.length / 12));
  const currentPage = Math.min(page, pages);
  const rows = [...sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice((currentPage - 1) * 12, currentPage * 12);
  const shedLabel = (id: string) => sheds.find((s) => s.id === id)?.code ?? '—';

  function exportSales() {
    const cell = (v: string | number) =>
      `"${String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const csv = [
      [
        'Date',
        'Shed',
        'Customer',
        'Eggs',
        'Entered quantity',
        'Entered unit',
        'Price (INR)',
        'Price unit',
        'Discount (%)',
        'Total (INR)',
        'Notes',
      ],
      ...sales.map((s) => [
        s.date,
        shedLabel(s.shedId),
        s.customer,
        s.eggs,
        s.entry?.qty ?? s.eggs,
        s.entry?.unit ?? 'egg',
        fromMinor(s.unitPriceMinor),
        s.priceUnit,
        s.discountPercent,
        fromMinor(saleAmountMinor(s, traySize).netMinor),
        s.notes,
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `flockbook-sales-${dateKey()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="sales-stats">
        {[
          { label: 'Customer sales', value: fmt(total.count) },
          { label: 'Eggs sold', value: fmt(total.eggs) },
          { label: 'Discounts given', value: formatMinor(total.discountMinor) },
          { label: 'Sales after discount', value: formatMinor(total.netMinor) },
        ].map((x) => (
          <article className="panel" key={x.label}>
            <span>{x.label}</span>
            <strong>{x.value}</strong>
          </article>
        ))}
      </div>
      <section className="panel records-panel">
        <div className="panel-heading">
          <div>
            <h3>Customer sales</h3>
            <p>Separate prices for every customer · {traySize} eggs per tray</p>
          </div>
          <button className="secondary-button" onClick={exportSales}>
            <Download size={16} />
            Export sales
          </button>
        </div>
        {sales.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shed</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Sale total</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{niceDate(s.date)}</TableCell>
                    <TableCell>
                      <span className="shed-chip">{shedLabel(s.shedId)}</span>
                    </TableCell>
                    <TableCell className="customer-cell">
                      <strong>{s.customer}</strong>
                      {s.notes && <small>{s.notes}</small>}
                    </TableCell>
                    <TableCell>{describeQuantity(s, traySize)}</TableCell>
                    <TableCell>
                      {formatMinor(s.unitPriceMinor)} / {s.priceUnit}
                    </TableCell>
                    <TableCell>
                      {s.discountPercent ? `${s.discountPercent}%` : '—'}
                    </TableCell>
                    <TableCell>
                      <strong>
                        {formatMinor(saleAmountMinor(s, traySize).netMinor)}
                      </strong>
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={`Edit sale to ${s.customer} on ${s.date}`}
                            onClick={() => onEdit(s)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete sale to ${s.customer} on ${s.date}`}
                            onClick={() => onDelete(s)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="pagination">
              <span>
                Page {currentPage} of {pages}
              </span>
              <button
                className="secondary-button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                disabled={currentPage * 12 >= sales.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="empty">
            <ShoppingBasket />
            <h3>No sales in this period</h3>
            <p>
              Add a sale for each customer, even when they buy on the same day.
            </p>
            {canEdit && (
              <button className="primary" onClick={onAdd}>
                Record a sale
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
