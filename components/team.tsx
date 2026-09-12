import { useEffect, useState, type SubmitEvent } from 'react';
import { Check, Loader2, Mail, Trash2, UserPlus, Users } from 'lucide-react';
import {
  ROLE_LABELS,
  ROLE_NOTES,
  type Repository,
  type Role,
  type Team,
} from '@/lib/repository';

const ASSIGNABLE: Role[] = ['editor', 'viewer'];

/**
 * Who else can use this farm.
 *
 * An invitation is keyed by email because that is the only thing you know
 * about somebody before they have an account. When they sign up with that
 * address they join this farm instead of getting an empty one of their own.
 */
export function TeamPanel({
  repo,
  onNotice,
}: {
  repo: Repository;
  onNotice: (message: string) => void;
}) {
  const [team, setTeam] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');

  const api = repo.team;

  useEffect(() => {
    if (!api) return;
    let live = true;
    api
      .load()
      .then((next) => live && setTeam(next))
      .catch((e: unknown) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [api]);

  if (!api) return null;

  const owner = team?.myRole === 'owner';

  async function run(action: () => Promise<void>, message: string) {
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setTeam(await api.load());
      onNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitInvite(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    void run(
      () => api!.invite(address, role),
      `${address} can join this farm as a ${ROLE_LABELS[role].toLowerCase()} when they sign up with that address.`,
    ).then(() => setEmail(''));
  }

  return (
    <section className="panel settings-panel">
      <h3>Who can use this farm</h3>
      <p>
        Everyone here sees the same sheds, records and sales. Invite people by
        the email address they will sign in with.
      </p>

      {!team ? (
        <div className="team-loading">
          <Loader2 className="spin" size={18} /> Loading the team…
        </div>
      ) : (
        <>
          <ul className="team-list">
            {team.members.map((m) => (
              <li key={m.uid}>
                <span className="user-avatar">
                  {m.email.slice(0, 2).toUpperCase()}
                </span>
                <div className="team-main">
                  <strong>
                    {m.email}
                    {m.isYou && <span className="today-tag">You</span>}
                  </strong>
                  <small>{ROLE_NOTES[m.role]}</small>
                </div>
                {owner && m.role !== 'owner' ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${m.uid}`}>
                      Role for {m.email}
                    </label>
                    <select
                      id={`role-${m.uid}`}
                      className="role-select"
                      value={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        void run(
                          () => api.setRole(m.uid, e.target.value as Role),
                          `${m.email} is now ${ROLE_LABELS[e.target.value as Role].toLowerCase()}.`,
                        )
                      }
                    >
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${m.email}`}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api.remove(m.uid),
                          `${m.email} no longer has access to this farm.`,
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <span className="stage-badge stage-production">
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {team.invitations.length > 0 && (
            <>
              <h3 className="team-subhead">Invited, not joined yet</h3>
              <ul className="team-list">
                {team.invitations.map((i) => (
                  <li key={i.email} className="is-pending">
                    <span className="user-avatar">
                      <Mail size={15} />
                    </span>
                    <div className="team-main">
                      <strong>{i.email}</strong>
                      <small>
                        Will join as {ROLE_LABELS[i.role].toLowerCase()} on
                        first sign-up
                      </small>
                    </div>
                    {owner && (
                      <button
                        className="icon-button"
                        aria-label={`Cancel invitation for ${i.email}`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api.revoke(i.email),
                            `Invitation for ${i.email} cancelled.`,
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {owner ? (
            <form className="invite-form" onSubmit={submitInvite}>
              <label>
                Invite by email
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="worker@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label htmlFor="invite-role">
                Role
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} — {ROLE_NOTES[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <UserPlus size={17} />
                )}
                Send invitation
              </button>
            </form>
          ) : (
            <div className="local-note">
              <Users size={20} />
              <span>
                You are {ROLE_LABELS[team.myRole].toLowerCase()} on this farm
                <br />
                <small>Only an owner can invite or remove people.</small>
              </span>
            </div>
          )}

          <p className="field-note">
            <Check size={13} /> An invitation grants access only to the address
            it names, and only once that person signs up. Removing somebody
            takes effect immediately.
          </p>
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
