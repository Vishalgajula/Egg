import { useState, type SubmitEvent } from 'react';
import { Check, Archive, Bird, Pencil, Plus, Warehouse } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { dateKey } from '@/lib/farm.mjs';
import {
  NOT_PRODUCING_REASONS,
  REASON_LABELS,
  SHED_STAGES,
  STAGE_LABELS,
  flockAgeWeeks,
  isLaying,
  shedStock,
  currentBirds,
  utilisation,
} from '@/lib/sheds.mjs';
import { NumberField } from '@/components/fields';
import type {
  Farm,
  NotProducingReason,
  Shed,
  ShedStage,
} from '@/lib/repository';

const fmt = (n: number) => n.toLocaleString('en-IN');

export function StageBadge({ stage }: { stage: ShedStage }) {
  return (
    <span className={`stage-badge stage-${stage.replace('_', '-')}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function ShedDialog({
  initial,
  existing,
  hasRecords,
  onClose,
  onSave,
}: {
  initial: Shed;
  existing: boolean;
  hasRecords: boolean;
  onClose: () => void;
  onSave: (shed: Shed) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [capacity, setCapacity] = useState(String(initial.capacity || ''));
  const [openingBirds, setOpeningBirds] = useState(
    String(initial.openingBirds ?? 0),
  );
  const [openingEggs, setOpeningEggs] = useState(
    String(initial.openingEggs ?? 0),
  );
  const [error, setError] = useState('');

  // Opening balances describe the moment before the first record, so changing
  // them after records exist would silently rewrite every later balance.
  const lockOpening = existing && hasRecords;

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      onSave({
        ...draft,
        name: draft.name.trim(),
        code: draft.code.trim(),
        capacity: Number(capacity),
        openingBirds: Number(openingBirds),
        openingEggs: Number(openingEggs),
        stageSince:
          draft.stage !== initial.stage ? dateKey() : initial.stageSince,
        notProducingReason:
          draft.stage === 'not_producing' ? draft.notProducingReason : null,
      });
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
          {existing ? 'Edit shed' : 'Add a shed'}
        </DialogTitle>
        <DialogDescription>
          Each shed keeps its own birds, feed, egg stock and sales.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Short code
              <input
                required
                maxLength={10}
                placeholder="S1"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label>
              Shed name
              <input
                required
                maxLength={60}
                placeholder="North layer shed"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <NumberField
              label="Capacity (max birds)"
              value={capacity}
              onChange={setCapacity}
              min="1"
            />
            <label htmlFor="shed-stage">
              Current stage
              <select
                id="shed-stage"
                value={draft.stage}
                onChange={(e) =>
                  setDraft({ ...draft, stage: e.target.value as ShedStage })
                }
              >
                {(SHED_STAGES as ShedStage[]).map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.stage === 'not_producing' && (
            <div className="form-grid">
              <label htmlFor="shed-reason">
                Why is it not producing?
                <select
                  id="shed-reason"
                  required
                  value={draft.notProducingReason ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      notProducingReason: e.target.value as NotProducingReason,
                    })
                  }
                >
                  <option value="" disabled>
                    Choose a reason…
                  </option>
                  {(NOT_PRODUCING_REASONS as NotProducingReason[]).map(
                    (reason) => (
                      <option key={reason} value={reason}>
                        {REASON_LABELS[reason]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Note <span className="optional">(optional)</span>
                <input
                  maxLength={200}
                  value={draft.notProducingNote}
                  onChange={(e) =>
                    setDraft({ ...draft, notProducingNote: e.target.value })
                  }
                />
              </label>
            </div>
          )}
          <div className="form-grid">
            <label>
              Breed <span className="optional">(optional)</span>
              <input
                maxLength={40}
                placeholder="BV300"
                value={draft.breed}
                onChange={(e) => setDraft({ ...draft, breed: e.target.value })}
              />
            </label>
            <label>
              Birds placed on <span className="optional">(optional)</span>
              <input
                type="date"
                max={dateKey()}
                value={draft.placedOn ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, placedOn: e.target.value || null })
                }
              />
            </label>
          </div>
          <p className="field-note">
            The placement date gives the flock’s age in weeks, which is what
            makes a laying rate meaningful to compare.
          </p>
          <div className="form-grid">
            <NumberField
              label="Opening flock (birds)"
              value={openingBirds}
              onChange={setOpeningBirds}
              required={!lockOpening}
            />
            <NumberField
              label="Opening egg stock"
              value={openingEggs}
              onChange={setOpeningEggs}
              required={!lockOpening}
            />
          </div>
          <p className="field-note">
            Opening balances are what the shed held before its first record.
            {lockOpening
              ? ' They are locked while records exist, so past balances stay put.'
              : ''}
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
              Save shed
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShedsPanel({
  data,
  today,
  canEdit,
  onAdd,
  onEdit,
  onArchive,
}: {
  data: Farm;
  today: string;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (shed: Shed) => void;
  onArchive: (shed: Shed) => void;
}) {
  const active = data.sheds.filter((s) => !s.archived);
  const archived = data.sheds.filter((s) => s.archived);

  const card = (shed: Shed) => {
    const strength = currentBirds(data, shed.id);
    const used = utilisation(data, shed.id);
    const age = flockAgeWeeks(shed, today);
    return (
      <article className="panel shed-card" key={shed.id}>
        <header>
          <span className="shed-chip">{shed.code}</span>
          <div>
            <strong>{shed.name}</strong>
            <small>
              {shed.breed || 'Breed not set'}
              {age !== null ? ` · ${age} weeks old` : ''}
            </small>
          </div>
          <StageBadge stage={shed.stage} />
        </header>
        {shed.stage === 'not_producing' && shed.notProducingReason && (
          <p className="shed-reason">
            {REASON_LABELS[shed.notProducingReason]}
            {shed.notProducingNote ? ` — ${shed.notProducingNote}` : ''}
          </p>
        )}
        <dl className="shed-figures">
          <div>
            <dt>Birds</dt>
            <dd>{fmt(strength)}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{fmt(shed.capacity)}</dd>
          </div>
          <div>
            <dt>In use</dt>
            <dd className={used > 100 ? 'is-over' : ''}>{used.toFixed(0)}%</dd>
          </div>
          <div>
            <dt>Eggs in store</dt>
            <dd>
              {isLaying(shed.stage) ? fmt(shedStock(data, shed.id)) : '—'}
            </dd>
          </div>
        </dl>
        <div
          className="capacity-bar"
          aria-label={`${used.toFixed(0)} percent of capacity`}
        >
          <span
            className={used > 100 ? 'is-over' : ''}
            style={{ width: `${Math.min(100, used)}%` }}
          />
        </div>
        {canEdit && (
          <div className="row-actions">
            <button className="secondary-button" onClick={() => onEdit(shed)}>
              <Pencil size={15} />
              Edit
            </button>
            <button
              className="secondary-button"
              onClick={() => onArchive(shed)}
            >
              <Archive size={15} />
              {shed.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      <section className="panel records-panel">
        <div className="panel-heading">
          <div>
            <h3>Your sheds</h3>
            <p>
              {active.length} active
              {archived.length ? ` · ${archived.length} archived` : ''}
            </p>
          </div>
          {canEdit && (
            <button className="primary" onClick={onAdd}>
              <Plus size={17} />
              Add a shed
            </button>
          )}
        </div>
        {active.length ? (
          <div className="shed-grid">{active.map(card)}</div>
        ) : (
          <div className="empty">
            <Warehouse />
            <h3>No sheds yet</h3>
            <p>
              Add a shed for each house on the farm. Birds, feed, eggs and sales
              are all tracked per shed.
            </p>
            <button className="primary" onClick={onAdd}>
              Add your first shed
            </button>
          </div>
        )}
      </section>
      {archived.length > 0 && (
        <section className="panel records-panel">
          <div className="panel-heading">
            <div>
              <h3>Archived sheds</h3>
              <p>Hidden from daily entry, with their history kept.</p>
            </div>
          </div>
          <div className="shed-grid">{archived.map(card)}</div>
        </section>
      )}
    </>
  );
}

export { Bird };
