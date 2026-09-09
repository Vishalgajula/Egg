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
import { dateKey, saleAmount, salesTotals } from '@/lib/farm.mjs';
import { saleFromInputs } from '@/lib/sale-inputs.mjs';
import { NativeSelect } from '@/components/ui/native-select';

export type Sale = {
  id: string;
  date: string;
  customer: string;
  trays: number;
  pricePerTray: number;
  discountPercent: number;
  notes: string;
  priceUnit?: 'tray' | 'egg';
};
const money = (n: number) =>
  n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmt = (n: number) => n.toLocaleString('en-IN');

export function SaleDialog({
  initial,
  existing,
  traySize,
  stock,
  onClose,
  onSave,
}: {
  initial: Sale;
  existing: boolean;
  traySize: number;
  stock: number;
  onClose: () => void;
  onSave: (sale: Sale) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [priceUnit, setPriceUnit] = useState<'tray' | 'egg'>(
    initial.priceUnit ?? 'tray',
  );
  const [traysText, setTraysText] = useState(String(initial.trays));
  const [priceText, setPriceText] = useState(
    String(
      initial.priceUnit === 'egg'
        ? Number((initial.pricePerTray / traySize).toFixed(2))
        : initial.pricePerTray,
    ),
  );
  const [discountText, setDiscountText] = useState(
    String(initial.discountPercent),
  );
  const [error, setError] = useState('');
  let preview: Sale | null = null;
  try {
    preview = saleFromInputs(
      draft,
      {
        trays: traysText,
        price: priceText,
        discount: discountText,
        unit: priceUnit,
      },
      traySize,
    );
  } catch {
    /* Incomplete fields stay blank while editing. */
  }
  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      onSave(
        saleFromInputs(
          { ...draft, customer: draft.customer.trim() },
          {
            trays: traysText,
            price: priceText,
            discount: discountText,
            unit: priceUnit,
          },
          traySize,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
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
          One customer, one entry. Add as many sales as you need each day.
        </DialogDescription>
        <form onSubmit={submit}>
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
            <label>
              Trays sold
              <input
                type="number"
                min="1"
                step="1"
                required
                value={traysText}
                onChange={(e) => setTraysText(e.target.value)}
              />
            </label>
            <label htmlFor="sale-pricing-unit">
              Pricing unit
              <NativeSelect
                id="sale-pricing-unit"
                className="mt-2 w-full [&_select]:h-[41px] [&_select]:text-base"
                aria-label="Pricing unit"
                value={priceUnit}
                onChange={(e) => {
                  setPriceUnit(e.target.value as 'tray' | 'egg');
                  setPriceText('');
                  setError('');
                }}
              >
                <option value="tray">Price per tray</option>
                <option value="egg">Price per egg</option>
              </NativeSelect>
            </label>
            <label>
              {priceUnit === 'egg' ? 'Price per egg (₹)' : 'Price per tray (₹)'}
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
              />
            </label>
            <label>
              Discount (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
              />
            </label>
          </div>
          <p className="field-note">
            Choose either price unit. Changing the unit clears the price for a
            new rate. {traySize} eggs = 1 tray.
          </p>
          {preview ? (
            <div className="sale-receipt">
              <div>
                <span>
                  {priceUnit === 'egg'
                    ? `${fmt(preview.trays * traySize)} eggs × ${money(Number(priceText))}`
                    : `${fmt(preview.trays)} trays × ${money(preview.pricePerTray)}`}
                </span>
                <strong>{money(preview.trays * preview.pricePerTray)}</strong>
              </div>
              <div>
                <span>Customer discount ({preview.discountPercent}%)</span>
                <span>
                  −
                  {money(
                    preview.trays * preview.pricePerTray - saleAmount(preview),
                  )}
                </span>
              </div>
              <div className="receipt-total">
                <span>Sale total</span>
                <strong>{money(saleAmount(preview))}</strong>
              </div>
              <p>
                {fmt(preview.trays * traySize)} eggs ·{' '}
                {money(preview.pricePerTray)} per tray · Net{' '}
                {money(
                  (preview.pricePerTray * (1 - preview.discountPercent / 100)) /
                    traySize,
                )}{' '}
                per egg
              </p>
            </div>
          ) : (
            <div className="sale-receipt">
              <p>
                Enter trays, price, and discount to calculate the sale total.
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
            Current stock: {fmt(stock)} eggs. Availability is checked on the
            sale date, including all other sales that day.
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
  traySize,
  onEdit,
  onDelete,
  onAdd,
}: {
  sales: Sale[];
  traySize: number;
  onEdit: (sale: Sale) => void;
  onDelete: (sale: Sale) => void;
  onAdd: () => void;
}) {
  const [page, setPage] = useState(1);
  const total = salesTotals(sales);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(sales.length / 12)));
  const rows = [...sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice((currentPage - 1) * 12, currentPage * 12);
  function exportSales() {
    const cell = (v: string | number) =>
      `"${String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const csv = [
      [
        'Date',
        'Customer',
        'Trays',
        'Price per tray (INR)',
        'Entered pricing unit',
        'Entered rate (INR)',
        'Discount (%)',
        'Total (INR)',
        'Notes',
      ],
      ...sales.map((s) => [
        s.date,
        s.customer,
        s.trays,
        s.pricePerTray,
        s.priceUnit ?? 'tray',
        s.priceUnit === 'egg'
          ? Number((s.pricePerTray / traySize).toFixed(2))
          : s.pricePerTray,
        s.discountPercent,
        saleAmount(s),
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
          { label: 'Trays sold', value: fmt(total.trays) },
          { label: 'Discounts given', value: money(total.discount) },
          { label: 'Sales after discount', value: money(total.amount) },
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
                  <TableHead>Customer</TableHead>
                  <TableHead>Trays</TableHead>
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
                    <TableCell>
                      {new Date(s.date + 'T12:00:00').toLocaleDateString(
                        'en-GB',
                        { day: 'numeric', month: 'short', year: 'numeric' },
                      )}
                    </TableCell>
                    <TableCell className="customer-cell">
                      <strong>{s.customer}</strong>
                      {s.notes && <small>{s.notes}</small>}
                    </TableCell>
                    <TableCell>{fmt(s.trays)}</TableCell>
                    <TableCell>
                      {s.priceUnit === 'egg'
                        ? `${money(s.pricePerTray / traySize)} / egg`
                        : `${money(s.pricePerTray)} / tray`}
                    </TableCell>
                    <TableCell>
                      {s.discountPercent ? `${s.discountPercent}%` : '—'}
                    </TableCell>
                    <TableCell>
                      <strong>{money(saleAmount(s))}</strong>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="pagination">
              <span>
                Page {currentPage} of{' '}
                {Math.max(1, Math.ceil(sales.length / 12))}
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
            <button className="primary" onClick={onAdd}>
              Record a sale
            </button>
          </div>
        )}
      </section>
    </>
  );
}
