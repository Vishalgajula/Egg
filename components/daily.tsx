import { useState, type SubmitEvent } from 'react';
import { Check, ClipboardList, Pencil, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { dateKey } from '@/lib/farm.mjs';
import { isLaying, currentBirds, STAGE_LABELS } from '@/lib/sheds.mjs';
import { recordFromInputs } from '@/lib/inputs.mjs';
import { NumberField, UnitToggle } from '@/components/fields';
import { StageBadge } from '@/components/sheds';
import type { Farm, RecordDay, Shed } from '@/lib/repository';

const fmt = (n: number) => n.toLocaleString('en-IN');

export function RecordDialog({
  initial,
  shed,
  existing,
  traySize,
  onClose,
  onSave,
}: {
  initial: RecordDay;
  shed: Shed;
  existing: boolean;
  traySize: number;
  onClose: () => void;
  onSave: (record: RecordDay) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [eggUnit, setEggUnit] = useState<'tray' | 'egg'>(
    initial.entry?.unit ?? 'egg',
  );
  const [feedUnit, setFeedUnit] = useState<'kg' | 'tonne'>(
    initial.feedEntry?.unit ?? 'kg',
  );
  const [text, setText] = useState({
    birds: String(initial.birds ?? ''),
    eggs: initial.entry ? String(initial.entry.qty) : '',
    damaged: String(initial.damaged ?? 0),
    deaths: String(initial.deaths ?? 0),
    added: String(initial.added ?? 0),
    feed: initial.feedEntry ? String(initial.feedEntry.qty) : '',
  });
  const [error, setError] = useState('');
  const laying = isLaying(draft.stage);
  const set = (key: keyof typeof text) => (v: string) =>
    setText({ ...text, [key]: v });

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      onSave(
        recordFromInputs(
          draft,
          { ...text, eggs: laying ? text.eggs : '0', eggUnit, feedUnit },
          traySize,
        ) as RecordDay,
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
          {existing ? 'Edit daily record' : 'Add daily record'}
        </DialogTitle>
        <DialogDescription>
          {shed.code} · {shed.name} — {STAGE_LABELS[shed.stage]}. One record per
          shed per day.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                required
                max={dateKey()}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <NumberField
              label="Laying hens counted"
              value={text.birds}
              onChange={set('birds')}
              hint={`Capacity ${fmt(shed.capacity)}`}
            />
          </div>

          {laying ? (
            <>
              <div className="form-grid">
                <NumberField
                  label={
                    eggUnit === 'tray' ? 'Trays collected' : 'Eggs collected'
                  }
                  value={text.eggs}
                  onChange={set('eggs')}
                />
                <NumberField
                  label="Damaged / discarded eggs"
                  value={text.damaged}
                  onChange={set('damaged')}
                />
              </div>
              <UnitToggle
                label="Egg count unit"
                value={eggUnit}
                options={[
                  { value: 'egg', label: 'Count in eggs' },
                  { value: 'tray', label: 'Count in trays' },
                ]}
                onChange={(next) => {
                  setEggUnit(next);
                  setText({ ...text, eggs: '' });
                  setError('');
                }}
              />
            </>
          ) : (
            <p className="field-note">
              {shed.name} is {STAGE_LABELS[shed.stage].toLowerCase()}, so no
              eggs are recorded. Change the shed’s stage in Sheds when it starts
              to lay.
            </p>
          )}

          <div className="form-grid">
            <NumberField
              label={feedUnit === 'tonne' ? 'Feed (tonnes)' : 'Feed (kg)'}
              value={text.feed}
              onChange={set('feed')}
              decimals
            />
            <NumberField
              label="Birds lost today"
              value={text.deaths}
              onChange={set('deaths')}
            />
            <NumberField
              label="Birds added today"
              value={text.added}
              onChange={set('added')}
            />
          </div>
          <UnitToggle
            label="Feed unit"
            value={feedUnit}
            options={[
              { value: 'kg', label: 'Kilograms' },
              { value: 'tonne', label: 'Tonnes' },
            ]}
            onChange={(next) => {
              setFeedUnit(next);
              setText({ ...text, feed: '' });
              setError('');
            }}
          />
          <label>
            Notes <span className="optional">(optional)</span>
            <textarea
              maxLength={1000}
              value={draft.notes}
              placeholder="Anything useful to remember about today…"
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <p className="field-note">
            Birds lost covers deaths and culls; birds added covers new stock
            brought in. The hen count stays what you actually counted, and any
            difference from the expected flock is shown in Flock health.
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
              Save record
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The daily round: every shed for one date, showing at a glance which are
 * still outstanding. Six sheds through a single dialog is six dialogs, and
 * this is the screen a farm actually uses each morning.
 */
export function DailyRound({
  data,
  date,
  canEdit,
  onDateChange,
  onOpen,
}: {
  data: Farm;
  date: string;
  canEdit: boolean;
  onDateChange: (next: string) => void;
  onOpen: (shed: Shed, record?: RecordDay) => void;
}) {
  const sheds = data.sheds.filter((s) => !s.archived);
  const recordFor = (shedId: string) =>
    data.records.find((r) => r.shedId === shedId && r.date === date);
  const done = sheds.filter((s) => recordFor(s.id)).length;

  return (
    <section className="panel records-panel">
      <div className="panel-heading">
        <div>
          <h3>Daily round</h3>
          <p>
            {done} of {sheds.length} sheds recorded for this date
          </p>
        </div>
        <label className="inline-date">
          <span className="sr-only">Round date</span>
          <input
            type="date"
            max={dateKey()}
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
      </div>
      {sheds.length ? (
        <ul className="round-list">
          {sheds.map((shed) => {
            const record = recordFor(shed.id);
            return (
              <li key={shed.id} className={record ? 'is-done' : ''}>
                <span className="shed-chip">{shed.code}</span>
                <div className="round-main">
                  <strong>{shed.name}</strong>
                  <small>
                    {record
                      ? `${fmt(record.birds)} birds · ${
                          isLaying(record.stage)
                            ? `${fmt(record.eggs)} eggs`
                            : 'no eggs'
                        } · ${fmt(record.feedKg)} kg feed`
                      : `Last counted ${fmt(currentBirds(data, shed.id))} birds`}
                  </small>
                </div>
                <StageBadge stage={shed.stage} />
                <button
                  className={record ? 'secondary-button' : 'primary'}
                  hidden={!canEdit}
                  onClick={() => onOpen(shed, record)}
                >
                  {record ? (
                    <>
                      <Pencil size={15} />
                      Edit
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Record
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <ClipboardList />
          <h3>No sheds to record</h3>
          <p>Add a shed first, then your daily round appears here.</p>
        </div>
      )}
    </section>
  );
}
