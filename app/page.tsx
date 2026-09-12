import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
  type CSSProperties,
} from 'react';
import {
  Egg,
  LayoutDashboard,
  NotebookPen,
  ChartNoAxesCombined,
  Package,
  Settings,
  Plus,
  ArrowRight,
  Bird,
  Wheat,
  ShoppingBasket,
  Download,
  ChevronLeft,
  ChevronRight,
  Leaf,
  LogOut,
  Check,
  Info,
  Pencil,
  Trash2,
  Upload,
  ShieldCheck,
  Sprout,
  Cloud,
  CloudOff,
  HeartCrack,
  Loader2,
  Warehouse,
  ClipboardList,
  TriangleAlert,
  Smartphone,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { dateKey, validateData, periodRecords } from '@/lib/farm.mjs';
import {
  alerts as farmAlerts,
  eggLedger,
  farmStock,
  flockAgeWeeks,
  flockLedger,
  isLaying,
  salesTotals,
  shedStock,
  currentBirds,
  totals as shedTotals,
  utilisation,
  STAGE_LABELS,
} from '@/lib/sheds.mjs';
import { formatMinor } from '@/lib/units.mjs';
import { SaleDialog, SalesPanel } from '@/components/sales';
import { ShedDialog, ShedsPanel, StageBadge } from '@/components/sheds';
import { DailyRound, RecordDialog } from '@/components/daily';
import { TeamPanel } from '@/components/team';
import { useAuth } from '@/hooks/use-auth';
import { useInstall } from '@/hooks/use-install';
import {
  cloudRepository,
  emptyFarm,
  localRepository,
  type Farm,
  type RecordDay,
  type Repository,
  type Role,
  type Sale,
  type Shed,
} from '@/lib/repository';

type View =
  | 'Overview'
  | 'Daily round'
  | 'Sheds'
  | 'Production records'
  | 'Customer sales'
  | 'Egg inventory'
  | 'Flock health'
  | 'Reports & insights'
  | 'Farm settings';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: d });
const niceDate = (s: string, full = false) =>
  new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: full ? 'long' : 'short',
    ...(full ? { year: 'numeric' } : {}),
  });

const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Daily round', icon: ClipboardList },
  { label: 'Sheds', icon: Warehouse },
  { label: 'Production records', icon: NotebookPen },
  { label: 'Customer sales', icon: ShoppingBasket },
  { label: 'Egg inventory', icon: Package },
  { label: 'Flock health', icon: HeartCrack },
  { label: 'Reports & insights', icon: ChartNoAxesCombined },
] as const;

const SUBTITLES: Record<View, string> = {
  Overview: 'A little clarity on everything happening at your farm.',
  'Daily round': 'Walk the sheds once, record them all.',
  Sheds: 'Every house on the farm, its birds and its stage.',
  'Production records': 'Your daily work, neatly recorded.',
  'Customer sales':
    'One entry per customer. Wholesale, retail, or a little regular-customer discount.',
  'Egg inventory': 'From collection to sale. Every egg accounted for.',
  'Flock health': 'Every bird accounted for, from opening flock to today.',
  'Reports & insights':
    'Understand your production and make informed decisions.',
  'Farm settings': 'Make this workspace your own.',
};

function Navigation({
  view,
  setView,
}: {
  view: View;
  setView: (v: View) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {nav.map((n) => (
        <SidebarMenuItem key={n.label}>
          <SidebarMenuButton
            className="nav-item"
            isActive={view === n.label}
            onClick={() => {
              setView(n.label);
              setOpenMobile(false);
            }}
          >
            <n.icon />
            <span>{n.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const newShed = (count: number): Shed => ({
  id: crypto.randomUUID(),
  code: `S${count + 1}`,
  name: '',
  capacity: 1000,
  stage: 'production',
  stageSince: dateKey(),
  notProducingReason: null,
  notProducingNote: '',
  openingBirds: 0,
  openingEggs: 0,
  breed: '',
  placedOn: null,
  archived: false,
});

export default function App() {
  const auth = useAuth();
  const install = useInstall();
  // Signed-in users work against their own farm in Firestore. Everyone else —
  // including every checkout with no Firebase project — gets the original
  // browser-storage workspace, so the prototype still runs unconfigured.
  const repo = useMemo(
    () =>
      auth.status === 'signed-in' && auth.user
        ? cloudRepository(auth.user.uid, auth.user.email ?? '')
        : localRepository,
    [auth.status, auth.user],
  );
  const [data, setData] = useState<Farm>(emptyFarm);
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  // Which repository the data on screen came from. Comparing it against the
  // current one answers "is this the right workspace?" without a loading flag
  // that the effect would have to reset synchronously on every change.
  const [loaded, setLoaded] = useState<{
    repo: Repository;
    error: string;
  } | null>(null);
  const ready = loaded?.repo === repo;
  const loadError = ready ? loaded.error : '';
  // A viewer may read everything and change nothing. The rules enforce that;
  // this is so the interface stops offering buttons that would only fail.
  // Tracked against its repository, so the effect sets state only from its
  // async callback and a workspace switch cannot leave a stale role behind.
  const [roleFrom, setRoleFrom] = useState<{
    repo: Repository;
    role: Role;
  } | null>(null);
  // A browser-only workspace has no team, so its single user owns it.
  const myRole: Role = !repo.team
    ? 'owner'
    : roleFrom?.repo === repo
      ? roleFrom.role
      : 'owner';
  const canEdit = myRole !== 'viewer';

  useEffect(() => {
    if (!repo.team) return;
    let live = true;
    repo.team
      .load()
      .then((team) => live && setRoleFrom({ repo, role: team.myRole }))
      // A failure here must not lock anyone out; the rules remain the boundary.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repo]);

  useEffect(() => {
    // Wait for auth to settle, or we would open the wrong workspace first.
    if (auth.status === 'loading') return;
    let live = true;
    repo
      .load()
      .then((next) => {
        if (!live) return;
        setData(next.data);
        setNotice(next.notice);
        setLoaded({ repo, error: '' });
      })
      .catch((e: unknown) => {
        if (!live) return;
        setLoaded({
          repo,
          error:
            e instanceof Error
              ? e.message
              : 'Your farm records could not be opened.',
        });
      });
    return () => {
      live = false;
    };
  }, [repo, auth.status]);

  const [view, setView] = useState<View>('Overview');
  const [login, setLogin] = useState(location.hash === '#login');
  const [demoSignedIn, setDemoSignedIn] = useState(() => {
    try {
      return sessionStorage.getItem('flockbook.demo') === 'yes';
    } catch {
      return false;
    }
  });
  const signedIn = auth.enabled ? auth.status === 'signed-in' : demoSignedIn;
  const [mode, setMode] = useState('monthly');
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [shedFilter, setShedFilter] = useState('all');
  const [roundDate, setRoundDate] = useState(dateKey());
  const [recordDraft, setRecordDraft] = useState<{
    record: RecordDay;
    shed: Shed;
    existing: boolean;
  } | null>(null);
  const [saleDraft, setSaleDraft] = useState<Sale | null>(null);
  const [shedDraft, setShedDraft] = useState<{
    shed: Shed;
    existing: boolean;
    hasRecords: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authBusy, setAuthBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const today = dateKey();

  /* ------------------------------ derived ------------------------------ */

  const activeSheds = data.sheds.filter((s) => !s.archived);
  const inScope = <T extends { shedId: string }>(rows: T[]) =>
    shedFilter === 'all' ? rows : rows.filter((r) => r.shedId === shedFilter);

  const scopedRecords = inScope(data.records);
  const scopedSales = inScope(data.sales);
  const selected = periodRecords(scopedRecords, month, mode) as RecordDay[];
  const selectedSales = periodRecords(scopedSales, month, mode) as Sale[];
  const total = shedTotals(selected);
  const salesTotal = salesTotals(selectedSales, data.settings.traySize);
  const stock =
    shedFilter === 'all' ? farmStock(data) : shedStock(data, shedFilter);
  const todaySales = salesTotals(
    scopedSales.filter((s) => s.date === today),
    data.settings.traySize,
  );
  const todayRecords = scopedRecords.filter((r) => r.date === today);
  const alerts = farmAlerts(data, today) as {
    severity: string;
    shedId: string;
    message: string;
  }[];
  const birds = (
    shedFilter === 'all'
      ? activeSheds
      : activeSheds.filter((s) => s.id === shedFilter)
  ).reduce((n, s) => n + currentBirds(data, s.id), 0);

  const [y, m] = month.split('-').map(Number);
  const previousMonth = dateKey(
    new Date(y, m - 1 - (mode === 'quarterly' ? 3 : 1), 1),
  ).slice(0, 7);
  const previous = shedTotals(
    periodRecords(scopedRecords, previousMonth, mode),
  );
  const delta =
    previous.eggs && previous.days && total.days
      ? (total.eggs / total.days / (previous.eggs / previous.days) - 1) * 100
      : null;
  const periodTitle =
    mode === 'quarterly'
      ? `Q${Math.floor((m - 1) / 3) + 1} ${y}`
      : new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        });

  // Chart rows: one point per date, summed across whichever sheds are in scope.
  const graph = Object.values(
    selected.reduce<
      Record<
        string,
        { label: string; eggs: number; feedKg: number; birds: number }
      >
    >((acc, r) => {
      acc[r.date] ??= { label: niceDate(r.date), eggs: 0, feedKg: 0, birds: 0 };
      acc[r.date].eggs += r.eggs;
      acc[r.date].feedKg += r.feedKg;
      acc[r.date].birds += r.birds;
      return acc;
    }, {}),
  );

  const shedName = (id: string) =>
    data.sheds.find((s) => s.id === id)?.name ?? 'Unknown shed';
  const shedCode = (id: string) =>
    data.sheds.find((s) => s.id === id)?.code ?? '—';

  /* ------------------------------ mutations ---------------------------- */

  function commit(next: Farm) {
    if (!canEdit) {
      setNotice(
        'You have view-only access to this farm. Ask an owner to make you an editor if you need to record changes.',
      );
      return false;
    }
    const previous = data;
    try {
      validateData(next);
      // Browser storage reports failure straight away. A network write cannot,
      // so a cloud save is applied optimistically and rolled back if rejected.
      repo.saveSync?.(next);
      setData(next);
      setPage(1);
    } catch (e) {
      setConfirm(null);
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not save. Browser storage may be full or unavailable.',
      );
      return false;
    }
    if (!repo.saveSync) {
      setSyncing(true);
      // A Firestore write resolves only once the server acknowledges it. With
      // no connection it neither resolves nor rejects, so without this the
      // badge would sit on "Saving…" for ever and say nothing. The entry is
      // safe in the offline cache meanwhile, so this warns rather than rolls
      // back.
      const slow = setTimeout(() => {
        setNotice(
          'This entry is saved on this device but has not reached your farm database yet. It will sync when the connection returns — keep this tab open. If it never clears, check whether a browser extension or your network is blocking firestore.googleapis.com.',
        );
      }, 12000);
      repo
        .save(next, previous)
        .catch((e: unknown) => {
          setData(previous);
          setNotice(
            e instanceof Error
              ? `Could not save to the farm database: ${e.message}`
              : 'Could not save to the farm database. Check your connection.',
          );
        })
        .finally(() => {
          clearTimeout(slow);
          setSyncing(false);
        });
    }
    return true;
  }

  function openRecord(shed: Shed, record?: RecordDay, date = roundDate) {
    const previousDay = [...data.records]
      .filter((r) => r.shedId === shed.id && r.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    setRecordDraft({
      shed,
      existing: Boolean(record),
      record:
        record ??
        ({
          shedId: shed.id,
          date,
          stage: shed.stage,
          // Yesterday's count is the best first guess for today's.
          birds: previousDay?.birds ?? shed.openingBirds,
          eggs: 0,
          entry: { qty: 0, unit: 'egg' },
          damaged: 0,
          deaths: 0,
          added: 0,
          feedKg: previousDay?.feedKg ?? 0,
          feedEntry: previousDay?.feedEntry ?? { qty: 0, unit: 'kg' },
          notes: '',
        } as RecordDay),
    });
  }

  function saveRecord(record: RecordDay) {
    const next = {
      ...data,
      records: [
        ...data.records.filter(
          (r) => !(r.shedId === record.shedId && r.date === record.date),
        ),
        record,
      ],
    };
    if (commit(next)) {
      setRecordDraft(null);
      setNotice(
        `Record saved for ${shedName(record.shedId)} on ${niceDate(record.date, true)}.`,
      );
    }
  }

  function deleteRecord(record: RecordDay) {
    setConfirm({
      title: 'Delete this record?',
      description: `The ${shedName(record.shedId)} record for ${niceDate(record.date, true)} will be removed, and its eggs taken back out of stock.`,
      run: () => {
        if (
          commit({
            ...data,
            records: data.records.filter(
              (r) => !(r.shedId === record.shedId && r.date === record.date),
            ),
          })
        ) {
          setConfirm(null);
          setNotice('Record deleted.');
        }
      },
    });
  }

  function openSale(sale?: Sale) {
    setSaleDraft(
      sale ??
        ({
          id: crypto.randomUUID(),
          date: today,
          shedId:
            shedFilter !== 'all'
              ? shedFilter
              : (activeSheds.find((s) => isLaying(s.stage))?.id ?? ''),
          customer: '',
          eggs: 0,
          entry: { qty: 0, unit: 'tray' },
          unitPriceMinor: 0,
          priceUnit: 'tray',
          discountPercent: 0,
          notes: '',
        } as Sale),
    );
  }

  function saveSale(sale: Sale) {
    const next = {
      ...data,
      sales: [...data.sales.filter((s) => s.id !== sale.id), sale],
    };
    validateData(next);
    if (!commit(next))
      throw new Error('Could not save this sale. Check the details and retry.');
    setSaleDraft(null);
    setNotice(`Sale saved. ${shedName(sale.shedId)} stock has been updated.`);
  }

  function deleteSale(sale: Sale) {
    setConfirm({
      title: 'Delete this customer sale?',
      description: `The sale to ${sale.customer} on ${niceDate(sale.date, true)} will be removed and its eggs returned to ${shedName(sale.shedId)}.`,
      run: () => {
        if (
          commit({ ...data, sales: data.sales.filter((s) => s.id !== sale.id) })
        ) {
          setConfirm(null);
          setNotice('Sale deleted. Its eggs have been returned to stock.');
        }
      },
    });
  }

  function saveShed(shed: Shed) {
    const next = {
      ...data,
      sheds: [...data.sheds.filter((s) => s.id !== shed.id), shed].sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    };
    if (commit(next)) {
      setShedDraft(null);
      setNotice(`${shed.name} saved.`);
    }
  }

  function archiveShed(shed: Shed) {
    const restoring = shed.archived;
    setConfirm({
      title: restoring ? 'Restore this shed?' : 'Archive this shed?',
      description: restoring
        ? `${shed.name} will appear in the daily round again.`
        : `${shed.name} will be hidden from daily entry. Its history is kept and nothing is deleted.`,
      run: () => {
        if (
          commit({
            ...data,
            sheds: data.sheds.map((s) =>
              s.id === shed.id ? { ...s, archived: !restoring } : s,
            ),
          })
        ) {
          setConfirm(null);
          setNotice(
            restoring ? `${shed.name} restored.` : `${shed.name} archived.`,
          );
        }
      },
    });
  }

  function exportBackup() {
    download(`flockbook-backup-${today}.json`, JSON.stringify(data, null, 2));
    setNotice('Backup downloaded. Keep it somewhere safe.');
  }

  function exportCSV() {
    const cell = (v: string | number) =>
      `"${String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const csv = [
      [
        'Date',
        'Shed',
        'Stage',
        'Birds',
        'Eggs',
        'Damaged',
        'Lost',
        'Added',
        'Feed (kg)',
        'Notes',
      ],
      ...selected.map((r) => [
        r.date,
        shedCode(r.shedId),
        r.stage,
        r.birds,
        r.eggs,
        r.damaged,
        r.deaths,
        r.added,
        r.feedKg,
        r.notes,
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n');
    download(`flockbook-${month}-${mode}.csv`, csv, 'text/csv');
    setNotice('Selected period exported as CSV.');
  }

  function movePeriod(amount: number) {
    setMonth(
      dateKey(
        new Date(y, m - 1 + amount * (mode === 'quarterly' ? 3 : 1), 1),
      ).slice(0, 7),
    );
    setPage(1);
  }

  useEffect(() => {
    const handler = () => setLogin(location.hash === '#login');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const enterDemo = () => {
    try {
      sessionStorage.setItem('flockbook.demo', 'yes');
    } catch {
      /* Demo access does not require session storage. */
    }
    setDemoSignedIn(true);
    location.hash = '';
    setLogin(false);
  };

  async function submitCredentials(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (v: FormDataEntryValue | null) =>
      typeof v === 'string' ? v : '';
    setNotice('');
    setAuthBusy(true);
    const message = await (authMode === 'sign-up'
      ? auth.signUp(text(f.get('email')), text(f.get('password')))
      : auth.signIn(text(f.get('email')), text(f.get('password'))));
    setAuthBusy(false);
    setError(message);
    if (!message) {
      location.hash = '';
      setLogin(false);
    }
  }

  async function resetPassword() {
    const field = document.querySelector<HTMLInputElement>(
      '.login-form input[name="email"]',
    );
    const email = field?.value.trim() ?? '';
    if (!email) {
      setError('Enter your email address first, then choose this again.');
      field?.focus();
      return;
    }
    setError('');
    setAuthBusy(true);
    const message = await auth.resetPassword(email);
    setAuthBusy(false);
    setError(message);
    if (!message)
      setNotice(
        `If an account uses ${email}, a password reset link is on its way.`,
      );
  }

  /* -------------------------------- gates ------------------------------- */

  // Nothing is worth rendering until we know who is signed in and their farm
  // has loaded, or the first paint shows the wrong workspace.
  if (auth.status === 'loading' || (!ready && !loadError))
    return (
      <div className="boot-screen">
        <span className="brand-icon">
          <Egg />
        </span>
        <Loader2 className="spin" size={22} />
        <p>Opening your farm…</p>
      </div>
    );

  if (loadError)
    return (
      <div className="boot-screen">
        <span className="brand-icon">
          <Egg />
        </span>
        <h2>Your farm could not be opened</h2>
        <p>{loadError}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again <ArrowRight size={18} />
        </button>
      </div>
    );

  // With Firebase configured there is no anonymous workspace to fall back to.
  if (login || (auth.enabled && !signedIn))
    return (
      <div className="login-page">
        <section className="login-story">
          <div className="brand">
            <span className="brand-icon">
              <Egg />
            </span>
            flockbook<span className="brand-dot">.</span>
          </div>
          <div>
            <span className="eyebrow">A LITTLE CLARITY. EVERY DAY.</span>
            <h1>
              Good farm days
              <br />
              start with
              <br />
              <em>good records.</em>
            </h1>
            <p>
              Every shed, every bird, every egg.
              <br />
              All together in one simple place.
            </p>
            <div className="login-stats">
              <div>
                <Warehouse />
                <strong>Shed by shed</strong>
                <span>Each house on its own terms</span>
              </div>
              <div>
                <ChartNoAxesCombined />
                <strong>Performance</strong>
                <span>See the bigger picture</span>
              </div>
            </div>
          </div>
          <span className="login-foot">
            Made for the people who keep the farm growing.
          </span>
        </section>
        <section className="login-form">
          {!auth.enabled ? (
            // A checkout with no Firebase project cannot sign anyone in. Say so
            // plainly rather than offering a login that could never work.
            <>
              <span className="pill">SETUP NEEDED</span>
              <h2>Firebase is not configured</h2>
              <p>
                This copy of Flockbook has no farm database connected, so
                accounts are unavailable.
              </p>
              <div className="demo-credentials">
                <Info size={18} />
                <p>
                  Add your Firebase settings to <strong>.env.local</strong> and
                  restart the server. The steps are in{' '}
                  <strong>docs/FIREBASE.md</strong>.
                </p>
              </div>
              <button className="text-button" onClick={enterDemo}>
                Continue on this device only <ArrowRight size={16} />
              </button>
              <p className="storage-note">
                Records entered this way stay in this browser, are visible to
                anyone using it, and never reach a farm account.
              </p>
            </>
          ) : (
            <>
              <span className="pill">
                {authMode === 'sign-up' ? 'NEW FARM' : 'SIGN IN'}
              </span>
              <h2>
                {authMode === 'sign-up' ? 'Create your farm' : 'Welcome back'}
              </h2>
              <p>
                {authMode === 'sign-up'
                  ? 'Your own workspace, on every device you sign in from.'
                  : 'Sign in to open your farm workspace.'}
              </p>
              <form onSubmit={submitCredentials}>
                <label>
                  Email address
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@example.com"
                    autoComplete="username"
                    inputMode="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={6}
                    placeholder="At least six characters"
                    autoComplete={
                      authMode === 'sign-up'
                        ? 'new-password'
                        : 'current-password'
                    }
                  />
                </label>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {notice && !error && (
                  <output className="form-note">{notice}</output>
                )}
                <button className="primary" type="submit" disabled={authBusy}>
                  {authBusy ? (
                    <>
                      <Loader2 className="spin" size={18} />
                      Please wait…
                    </>
                  ) : (
                    <>
                      {authMode === 'sign-up' ? 'Create account' : 'Sign in'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
              <div className="login-links">
                <button
                  className="text-button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up');
                  }}
                >
                  {authMode === 'sign-up'
                    ? 'Already have an account? Sign in'
                    : 'New here? Create a farm account'}{' '}
                  <ArrowRight size={16} />
                </button>
                {authMode === 'sign-in' && (
                  <button className="text-button" onClick={resetPassword}>
                    Forgot your password?
                  </button>
                )}
              </div>
              <p className="storage-note">
                Your records live in your farm database and reach every device
                you sign in from. Only people you invite can see them.
              </p>
            </>
          )}
        </section>
      </div>
    );

  /* -------------------------------- shell ------------------------------- */

  const periodBar = (
    <div className="period-bar">
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="period-picker">
        <button aria-label="Previous period" onClick={() => movePeriod(-1)}>
          <ChevronLeft size={16} />
        </button>
        <strong>{periodTitle}</strong>
        <button
          aria-label="Next period"
          disabled={month >= today.slice(0, 7)}
          onClick={() => movePeriod(1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  const shedPicker = data.sheds.length > 1 && (
    <fieldset className="shed-filter">
      <legend className="sr-only">Filter by shed</legend>
      <button
        className={shedFilter === 'all' ? 'is-active' : ''}
        onClick={() => setShedFilter('all')}
      >
        All sheds
      </button>
      {activeSheds.map((shed) => (
        <button
          key={shed.id}
          className={shedFilter === shed.id ? 'is-active' : ''}
          onClick={() => setShedFilter(shed.id)}
        >
          {shed.code}
        </button>
      ))}
    </fieldset>
  );

  const recordsTable = (rows: RecordDay[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Shed</TableHead>
          <TableHead>Birds</TableHead>
          <TableHead>Eggs</TableHead>
          <TableHead>Feed (kg)</TableHead>
          <TableHead>Lost</TableHead>
          <TableHead>Laying rate</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const shed = data.sheds.find((s) => s.id === r.shedId);
          return (
            <TableRow key={`${r.shedId}__${r.date}`}>
              <TableCell className="date-cell">
                {niceDate(r.date)}{' '}
                {r.date === today && <span className="today-tag">Today</span>}
              </TableCell>
              <TableCell>
                <span className="shed-chip">{shedCode(r.shedId)}</span>
              </TableCell>
              <TableCell>{fmt(r.birds)}</TableCell>
              <TableCell>
                {isLaying(r.stage) ? (
                  fmt(r.eggs)
                ) : (
                  <span className="muted">—</span>
                )}
              </TableCell>
              <TableCell>{fmt(r.feedKg, 1)}</TableCell>
              <TableCell>{r.deaths || '—'}</TableCell>
              <TableCell>
                {isLaying(r.stage) && r.birds
                  ? `${fmt((r.eggs / r.birds) * 100, 1)}%`
                  : '—'}
              </TableCell>
              <TableCell>
                <div className="row-actions" hidden={!canEdit}>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${shedName(r.shedId)} on ${r.date}`}
                    onClick={() => shed && openRecord(shed, r, r.date)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${shedName(r.shedId)} on ${r.date}`}
                    onClick={() => deleteRecord(r)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  const collectedToday = todayRecords.reduce((n, r) => n + r.eggs, 0);
  const feedToday = todayRecords.reduce((n, r) => n + r.feedKg, 0);

  // Two per row: eggs and sales first, then flock and feed. Sheds follow below.
  const cards = [
    {
      title: 'Eggs collected today',
      value: todayRecords.length ? fmt(collectedToday) : '—',
      unit: 'eggs',
      icon: Egg,
      tone: 'orange',
      // The day's collection means little without what is already in store.
      pair: { label: 'In store', value: fmt(stock), unit: 'eggs' },
      foot: todayRecords.length
        ? `${todayRecords.length} of ${activeSheds.length} sheds recorded`
        : 'No records for today yet',
    },
    {
      title: 'Sold today',
      value: fmt(todaySales.eggs),
      unit: 'eggs',
      icon: ShoppingBasket,
      tone: 'blue',
      pair: {
        label: 'Value',
        value: formatMinor(todaySales.netMinor),
        unit: 'after discount',
      },
      foot: `${todaySales.count} ${todaySales.count === 1 ? 'sale' : 'sales'} today`,
    },
    {
      title: 'Live birds',
      value: fmt(birds),
      unit: 'birds',
      icon: Bird,
      tone: 'green',
      foot: `${activeSheds.length} active ${activeSheds.length === 1 ? 'shed' : 'sheds'}`,
    },
    {
      title: 'Feed used today',
      value: todayRecords.length ? fmt(feedToday, 1) : '—',
      unit: 'kg',
      icon: Wheat,
      tone: 'purple',
      foot: collectedToday
        ? `${fmt((feedToday * 1000) / collectedToday, 0)} g per egg collected`
        : 'Across every shed recorded today',
    },
  ];

  const statCards = (
    rows: {
      title: string;
      value: string;
      unit?: string;
      icon?: typeof Egg;
      tone?: string;
      pair?: { label: string; value: string; unit?: string };
      foot: string;
    }[],
  ) => (
    <div className="stats-grid">
      {rows.map((c) => (
        <article className="stat-card" key={c.title}>
          <div className="stat-top">
            <span>{c.title}</span>
            {c.icon && (
              <span className={`stat-icon ${c.tone ?? 'green'}`}>
                <c.icon size={17} />
              </span>
            )}
          </div>
          <div className="stat-value">
            {c.value}
            {c.unit && <small>{c.unit}</small>}
          </div>
          {c.pair && (
            <div className="stat-pair">
              <span>{c.pair.label}</span>
              <strong>
                {c.pair.value}
                {c.pair.unit && <small>{c.pair.unit}</small>}
              </strong>
            </div>
          )}
          <div className="stat-foot">{c.foot}</div>
        </article>
      ))}
    </div>
  );

  return (
    <SidebarProvider style={{ '--sidebar-width': '244px' } as CSSProperties}>
      <Sidebar>
        <SidebarHeader className="side-header">
          <div className="brand">
            <span className="brand-icon">
              <Egg />
            </span>
            flockbook<span className="brand-dot">.</span>
          </div>
          <div className="farm-switch">
            <span className="farm-avatar">
              <Sprout size={20} />
            </span>
            <div>
              <strong>{data.settings.name}</strong>
              <small>
                {activeSheds.length}{' '}
                {activeSheds.length === 1 ? 'shed' : 'sheds'}
              </small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="side-content">
          <span className="nav-caption">WORKSPACE</span>
          <Navigation view={view} setView={setView} />
        </SidebarContent>
        <SidebarFooter className="side-footer">
          <SidebarMenuButton
            className="nav-item"
            isActive={view === 'Farm settings'}
            onClick={() => setView('Farm settings')}
          >
            <Settings />
            <span>Farm settings</span>
          </SidebarMenuButton>
          <button
            className="profile"
            onClick={async () => {
              setError('');
              if (signedIn) {
                if (auth.enabled) await auth.signOutUser();
                else {
                  try {
                    sessionStorage.removeItem('flockbook.demo');
                  } catch {
                    /* Optional demo session. */
                  }
                  setDemoSignedIn(false);
                }
              }
              location.hash = 'login';
              setLogin(true);
            }}
          >
            <span className="user-avatar">
              {(auth.user?.email ?? 'GV').slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>
                {auth.enabled
                  ? (auth.user?.email ?? 'Sign in')
                  : 'Demo workspace'}
              </strong>
              <small>{signedIn ? 'Sign out' : 'Open sign in'}</small>
            </span>
            <LogOut size={16} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className={'save-status' + (syncing ? ' is-syncing' : '')}>
              {repo.mode === 'cloud' ? (
                syncing ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <Cloud size={14} />
                )
              ) : (
                <CloudOff size={14} />
              )}
              {repo.mode === 'cloud'
                ? syncing
                  ? 'Saving…'
                  : 'Saved to your farm'
                : data.sample
                  ? 'Sample data'
                  : 'Saved on this device'}
            </span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR FARM, IN FOCUS</div>
              <h1>{view === 'Overview' ? 'Farm overview' : view}</h1>
              <p>{SUBTITLES[view]}</p>
            </div>
            {view !== 'Farm settings' && view !== 'Sheds' && canEdit && (
              <div className="heading-actions">
                <button
                  className="secondary-button"
                  onClick={() => setView('Daily round')}
                >
                  <ClipboardList size={16} />
                  Daily round
                </button>
                <button
                  className="primary"
                  onClick={() => openSale()}
                  disabled={!activeSheds.some((s) => isLaying(s.stage))}
                >
                  <Plus size={18} />
                  Record a sale
                </button>
              </div>
            )}
          </div>

          {notice && (
            <output className="notice">
              <Info size={18} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </output>
          )}

          {data.sample && (
            <div className="sample-banner">
              <span>
                <span className="sample-dot" /> You’re exploring a sample farm
                with four sheds. Make yourself at home.
              </span>
              <button onClick={() => setView('Farm settings')}>
                Set up your farm <ArrowRight size={16} />
              </button>
            </div>
          )}

          {!canEdit && (
            <div className="sample-banner is-readonly">
              <span>
                <ShieldCheck size={16} /> You have view-only access to this
                farm. Everything is visible; nothing can be changed.
              </span>
            </div>
          )}

          {!data.sheds.length &&
            canEdit &&
            view !== 'Sheds' &&
            view !== 'Farm settings' && (
              <div className="sample-banner">
                <span>
                  <Warehouse size={16} /> Add your first shed to start
                  recording.
                </span>
                <button onClick={() => setView('Sheds')}>
                  Go to Sheds <ArrowRight size={16} />
                </button>
              </div>
            )}

          {alerts.length > 0 && view === 'Overview' && (
            <ul className="alert-list">
              {alerts.map((a, i) => (
                <li key={i} className={`alert-${a.severity}`}>
                  <TriangleAlert size={16} />
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}

          {view === 'Overview' && (
            <>
              {statCards(cards)}
              <div className="section-label">
                <h2>Your sheds</h2>
                <span>
                  <Warehouse size={14} /> {activeSheds.length} active
                </span>
              </div>
              <div className="shed-grid overview-sheds">
                {activeSheds.map((shed) => (
                  <article className="panel shed-card" key={shed.id}>
                    <header>
                      <span className="shed-chip">{shed.code}</span>
                      <div>
                        <strong>{shed.name}</strong>
                        <small>
                          {fmt(currentBirds(data, shed.id))} birds ·{' '}
                          {utilisation(data, shed.id).toFixed(0)}% full
                        </small>
                      </div>
                      <StageBadge stage={shed.stage} />
                    </header>
                    <p className="shed-line">
                      {isLaying(shed.stage)
                        ? `${fmt(shedStock(data, shed.id))} eggs in store`
                        : `Not laying — ${STAGE_LABELS[shed.stage].toLowerCase()}`}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}

          {view === 'Daily round' && (
            <DailyRound
              data={data}
              date={roundDate}
              canEdit={canEdit}
              onDateChange={setRoundDate}
              onOpen={(shed, record) => openRecord(shed, record, roundDate)}
            />
          )}

          {view === 'Sheds' && (
            <ShedsPanel
              data={data}
              today={today}
              canEdit={canEdit}
              onAdd={() =>
                setShedDraft({
                  shed: newShed(data.sheds.length),
                  existing: false,
                  hasRecords: false,
                })
              }
              onEdit={(shed) =>
                setShedDraft({
                  shed,
                  existing: true,
                  hasRecords: data.records.some((r) => r.shedId === shed.id),
                })
              }
              onArchive={archiveShed}
            />
          )}

          {(view === 'Production records' ||
            view === 'Customer sales' ||
            view === 'Egg inventory' ||
            view === 'Flock health' ||
            view === 'Reports & insights') && (
            <>
              {shedPicker}
              {periodBar}
            </>
          )}

          {view === 'Production records' && (
            <section className="panel records-panel">
              <div className="panel-heading">
                <div>
                  <h3>Production records</h3>
                  <p>
                    {selected.length} records · {fmt(total.eggs)} eggs ·{' '}
                    {fmt(total.layingRate, 1)}% laying rate
                  </p>
                </div>
                <button className="secondary-button" onClick={exportCSV}>
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
              {selected.length ? (
                <>
                  {recordsTable(
                    [...selected]
                      .sort(
                        (a, b) =>
                          b.date.localeCompare(a.date) ||
                          a.shedId.localeCompare(b.shedId),
                      )
                      .slice((page - 1) * 14, page * 14),
                  )}
                  <div className="pagination">
                    <span>
                      Page {page} of{' '}
                      {Math.max(1, Math.ceil(selected.length / 14))}
                    </span>
                    <button
                      className="secondary-button"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="secondary-button"
                      disabled={page * 14 >= selected.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <NotebookPen />
                  <h3>No records in this period</h3>
                  <p>Use the daily round to record each shed.</p>
                  <button
                    className="primary"
                    onClick={() => setView('Daily round')}
                  >
                    Open daily round
                  </button>
                </div>
              )}
            </section>
          )}

          {view === 'Customer sales' && (
            <SalesPanel
              sales={selectedSales}
              sheds={activeSheds}
              traySize={data.settings.traySize}
              canEdit={canEdit}
              onEdit={openSale}
              onDelete={deleteSale}
              onAdd={() => openSale()}
            />
          )}

          {view === 'Egg inventory' && (
            <>
              <div className="inventory-total">
                <Package size={30} />
                <div>
                  <span>
                    {shedFilter === 'all'
                      ? 'Available across the farm'
                      : `Available in ${shedName(shedFilter)}`}
                  </span>
                  <strong>
                    {fmt(stock)} <small>eggs</small>
                  </strong>
                  <p>
                    {fmt(Math.floor(stock / data.settings.traySize))} full trays
                    + {stock % data.settings.traySize} loose eggs
                  </p>
                </div>
              </div>
              <div className="shed-grid">
                {activeSheds
                  .filter((s) => shedFilter === 'all' || s.id === shedFilter)
                  .map((shed) => {
                    const rows = eggLedger(data, shed.id) as {
                      date: string;
                      eggs: number;
                      damaged: number;
                      sold: number;
                      balance: number;
                    }[];
                    return (
                      <section className="panel records-panel" key={shed.id}>
                        <div className="panel-heading">
                          <div>
                            <h3>
                              <span className="shed-chip">{shed.code}</span>{' '}
                              {shed.name}
                            </h3>
                            <p>
                              {fmt(shedStock(data, shed.id))} eggs in store ·
                              last 10 movements
                            </p>
                          </div>
                        </div>
                        {rows.length ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Collected</TableHead>
                                <TableHead>Sold</TableHead>
                                <TableHead>Damaged</TableHead>
                                <TableHead>Closing</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {[...rows]
                                .reverse()
                                .slice(0, 10)
                                .map((r) => (
                                  <TableRow key={r.date}>
                                    <TableCell>{niceDate(r.date)}</TableCell>
                                    <TableCell>+{fmt(r.eggs)}</TableCell>
                                    <TableCell>−{fmt(r.sold)}</TableCell>
                                    <TableCell>{r.damaged}</TableCell>
                                    <TableCell>
                                      <strong>{fmt(r.balance)}</strong>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="empty">
                            No movement recorded for this shed yet.
                          </div>
                        )}
                      </section>
                    );
                  })}
              </div>
            </>
          )}

          {view === 'Flock health' && (
            <div className="shed-grid">
              {activeSheds
                .filter((s) => shedFilter === 'all' || s.id === shedFilter)
                .map((shed) => {
                  const rows = flockLedger(data, shed.id) as {
                    date: string;
                    added: number;
                    deaths: number;
                    counted: number;
                    strength: number;
                    variance: number;
                  }[];
                  const periodTotals = shedTotals(
                    selected.filter((r) => r.shedId === shed.id),
                  );
                  return (
                    <section className="panel records-panel" key={shed.id}>
                      <div className="panel-heading">
                        <div>
                          <h3>
                            <span className="shed-chip">{shed.code}</span>{' '}
                            {shed.name}
                          </h3>
                          <p>
                            {fmt(currentBirds(data, shed.id))} birds ·{' '}
                            {fmt(periodTotals.deaths)} lost this period ·{' '}
                            {fmt(periodTotals.mortalityRate, 2)}% mortality
                            {flockAgeWeeks(shed, today) !== null
                              ? ` · ${flockAgeWeeks(shed, today)} weeks old`
                              : ''}
                          </p>
                        </div>
                      </div>
                      {rows.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Added</TableHead>
                              <TableHead>Lost</TableHead>
                              <TableHead>Expected</TableHead>
                              <TableHead>Counted</TableHead>
                              <TableHead>Difference</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...rows]
                              .reverse()
                              .slice(0, 10)
                              .map((r) => (
                                <TableRow key={r.date}>
                                  <TableCell>{niceDate(r.date)}</TableCell>
                                  <TableCell>
                                    {r.added ? '+' + r.added : '—'}
                                  </TableCell>
                                  <TableCell>
                                    {r.deaths ? '−' + r.deaths : '—'}
                                  </TableCell>
                                  <TableCell>{fmt(r.strength)}</TableCell>
                                  <TableCell>
                                    <strong>{fmt(r.counted)}</strong>
                                  </TableCell>
                                  <TableCell>
                                    {r.variance === 0 ? (
                                      <span className="today-tag">Matches</span>
                                    ) : (
                                      <strong>
                                        {r.variance > 0 ? '+' : ''}
                                        {fmt(r.variance)}
                                      </strong>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="empty">
                          No records for this shed yet.
                        </div>
                      )}
                    </section>
                  );
                })}
              <p className="field-note">
                Expected is the opening flock plus birds added, less birds lost.
                Counted is what you recorded that day. A difference is not an
                error — it usually means a recount found more or fewer birds
                than the log predicted, and it is worth reconciling.
              </p>
            </div>
          )}

          {view === 'Reports & insights' && (
            <>
              {statCards([
                {
                  title: 'Eggs collected',
                  value: fmt(total.eggs),
                  unit: 'eggs',
                  icon: Egg,
                  tone: 'orange',
                  pair: {
                    label: 'Damaged',
                    value: fmt(total.damaged),
                    unit: 'eggs',
                  },
                  foot:
                    delta === null
                      ? 'No comparable previous period'
                      : `${delta >= 0 ? '+' : ''}${fmt(delta, 1)}% per recorded day vs previous`,
                },
                {
                  title: 'Sales after discount',
                  value: formatMinor(salesTotal.netMinor),
                  icon: ShoppingBasket,
                  tone: 'blue',
                  pair: {
                    label: 'Discounts given',
                    value: formatMinor(salesTotal.discountMinor),
                  },
                  foot: `${salesTotal.count} ${salesTotal.count === 1 ? 'sale' : 'sales'} · ${fmt(salesTotal.eggs)} eggs sold`,
                },
                {
                  title: 'Laying rate',
                  value: `${fmt(total.layingRate, 1)}%`,
                  icon: Bird,
                  tone: 'green',
                  pair: {
                    label: 'Birds lost',
                    value: fmt(total.deaths),
                    unit: `${fmt(total.mortalityRate, 2)}%`,
                  },
                  foot: 'Laying sheds only — brooding birds are excluded',
                },
                {
                  title: 'Feed per dozen',
                  value: fmt(total.feedPerDozen, 0),
                  unit: 'g',
                  icon: Wheat,
                  tone: 'purple',
                  pair: {
                    label: 'Feed used',
                    value: fmt(total.feedKg, 1),
                    unit: 'kg',
                  },
                  foot: 'Feed eaten by laying sheds, per dozen eggs',
                },
              ])}
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Eggs collected</h3>
                    <p>{periodTitle}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={graph}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="eggs"
                      stroke="#a8813c"
                      fill="#f1e4c8"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </section>
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Feed consumed (kg)</h3>
                    <p>{periodTitle}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={graph}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="feedKg" fill="#c9b083" />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </>
          )}

          {view === 'Farm settings' && (
            <div className="settings-grid">
              <TeamPanel repo={repo} onNotice={setNotice} />
              <section className="panel settings-panel">
                <h3>Farm details</h3>
                <p>Name and units for this workspace.</p>
                <form
                  key={JSON.stringify(data.settings)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      commit({
                        ...data,
                        settings: {
                          name:
                            typeof f.get('name') === 'string'
                              ? (f.get('name') as string).trim()
                              : '',
                          traySize: Number(f.get('traySize')),
                        },
                      })
                    )
                      setNotice('Farm settings saved.');
                  }}
                >
                  <label>
                    Farm name
                    <input
                      name="name"
                      defaultValue={data.settings.name}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Eggs per tray
                    <input
                      type="number"
                      name="traySize"
                      inputMode="numeric"
                      min="1"
                      max="100"
                      step="1"
                      defaultValue={data.settings.traySize}
                      required
                    />
                  </label>
                  <p className="field-note">
                    Quantities are stored as egg counts, so changing the tray
                    size never rewrites what was already recorded. Past entries
                    keep the tray size they were entered with.
                  </p>
                  <button className="primary" type="submit">
                    <Check size={17} />
                    Save farm details
                  </button>
                </form>
              </section>
              <section className="panel settings-panel">
                <h3>Your data, in your hands</h3>
                <p>
                  {repo.mode === 'cloud'
                    ? 'Your records are in your farm database. A backup is still worth keeping.'
                    : 'This browser is the only copy. Export a backup each day.'}
                </p>
                <button
                  className="secondary-button full"
                  onClick={exportBackup}
                >
                  <Download size={17} />
                  Download full backup
                </button>
                <button
                  className="secondary-button full"
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={17} />
                  Restore from backup
                </button>
                <input
                  hidden
                  ref={upload}
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      if (file.size > 5e6)
                        throw new Error('Backup must be smaller than 5 MB.');
                      const next = validateData(
                        JSON.parse(await file.text()),
                      ) as Farm;
                      setConfirm({
                        title: 'Restore this backup?',
                        description: `Replace this workspace with ${next.records.length} records across ${next.sheds.length} sheds from ${next.settings.name}. Export your current records first if you need them.`,
                        run: () => {
                          if (commit(next)) {
                            setConfirm(null);
                            setNotice('Backup restored.');
                          }
                        },
                      });
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                />
                <div className="local-note">
                  <ShieldCheck size={20} />
                  <span>
                    {repo.mode === 'cloud'
                      ? 'Farm database'
                      : 'Device-local storage'}
                    <br />
                    <small>
                      {repo.mode === 'cloud'
                        ? 'Only people you invite can read this farm.'
                        : 'No database or shared farm accounts yet.'}
                    </small>
                  </span>
                </div>
                <hr />
                <h3>Use Flockbook on your phone</h3>
                <p>
                  Install it to open from the home screen, full screen, and keep
                  working when the signal drops in the sheds.
                </p>
                {install.installed ? (
                  <div className="local-note">
                    <Smartphone size={20} />
                    <span>
                      Installed on this device
                      <br />
                      <small>Open it from your home screen any time.</small>
                    </span>
                  </div>
                ) : install.canInstall ? (
                  <button
                    className="secondary-button full"
                    onClick={async () => {
                      const accepted = await install.install();
                      if (accepted) setNotice('Flockbook is installing.');
                    }}
                  >
                    <Smartphone size={17} />
                    Install app
                  </button>
                ) : (
                  <p className="field-note">
                    Your browser has not offered installation yet. In Chrome on
                    Android, use the menu and choose{' '}
                    <strong>Install app</strong>. On an iPhone, use Share then{' '}
                    <strong>Add to Home Screen</strong>.
                  </p>
                )}
                <hr />
                <h3>Start your own farm</h3>
                <p>
                  Remove the example sheds and records, and begin with an empty
                  log.
                </p>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setConfirm({
                      title: 'Start with an empty farm?',
                      description:
                        'All sheds, records and sales will be removed. Download a backup first to keep a copy. The farm name and tray size are kept.',
                      run: () => {
                        if (
                          commit({
                            ...data,
                            sample: false,
                            sheds: [],
                            records: [],
                            sales: [],
                          })
                        ) {
                          setConfirm(null);
                          setView('Sheds');
                          setNotice(
                            'Your empty farm is ready. Add your first shed to begin.',
                          );
                        }
                      },
                    })
                  }
                >
                  Start fresh <ArrowRight size={16} />
                </button>
              </section>
            </div>
          )}

          <footer className="page-footer">
            <span>
              <Leaf size={14} /> A clearer picture. A better farm day.
            </span>
            <span>Flockbook · {data.settings.name}</span>
          </footer>
        </main>
      </div>

      {recordDraft && (
        <RecordDialog
          key={`${recordDraft.shed.id}-${recordDraft.record.date}`}
          initial={recordDraft.record}
          shed={recordDraft.shed}
          existing={recordDraft.existing}
          traySize={data.settings.traySize}
          onClose={() => setRecordDraft(null)}
          onSave={saveRecord}
        />
      )}

      {saleDraft && (
        <SaleDialog
          key={saleDraft.id}
          initial={saleDraft}
          existing={data.sales.some((s) => s.id === saleDraft.id)}
          sheds={activeSheds.filter((s) => isLaying(s.stage))}
          traySize={data.settings.traySize}
          stockOf={(id) => shedStock(data, id)}
          onClose={() => setSaleDraft(null)}
          onSave={saveSale}
        />
      )}

      {shedDraft && (
        <ShedDialog
          key={shedDraft.shed.id}
          initial={shedDraft.shed}
          existing={shedDraft.existing}
          hasRecords={shedDraft.hasRecords}
          onClose={() => setShedDraft(null)}
          onSave={saveShed}
        />
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.description}
          </AlertDialogDescription>
          <div className="form-actions">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button className="primary" onClick={() => confirm?.run()}>
              Continue
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
