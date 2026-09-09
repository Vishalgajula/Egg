import {
  useEffect,
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
  ArrowUpRight,
  ArrowRight,
  Bird,
  Wheat,
  ShoppingBasket,
  CalendarDays,
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  dateKey,
  seedData,
  validateData,
  totals,
  stockOf,
  periodRecords,
  STORAGE_KEY,
  salesTotals,
  inventoryLedger,
} from '@/lib/farm.mjs';
import { SaleDialog, SalesPanel, type Sale } from '@/components/sales';
import { useFarmTools } from '@/hooks/use-farm-tools';

type RecordDay = {
  date: string;
  birds: number;
  eggs: number;
  feed: number;
  damaged: number;
  notes: string;
};
type Farm = {
  version: number;
  sample: boolean;
  settings: { name: string; openingStock: number; traySize: number };
  records: RecordDay[];
  sales: Sale[];
};
type View =
  | 'Overview'
  | 'Production records'
  | 'Customer sales'
  | 'Egg inventory'
  | 'Reports & insights'
  | 'Farm settings';
const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: d });
const money = (n: number) => '₹' + fmt(n, 2);
const niceDate = (s: string, full = false) =>
  new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: full ? 'long' : 'short',
    ...(full ? { year: 'numeric' } : {}),
  });
const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Production records', icon: NotebookPen },
  { label: 'Customer sales', icon: ShoppingBasket },
  { label: 'Egg inventory', icon: Package },
  { label: 'Reports & insights', icon: ChartNoAxesCombined },
] as const;
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

export default function App() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return {
        data: raw ? validateData(JSON.parse(raw)) : seedData(),
        error:
          raw && JSON.parse(raw).version === 1
            ? 'Your saved records have been separated into production and sales. Previous daily sales keep their original quantities and prices; you can add customer names in Customer sales.'
            : '',
      };
    } catch {
      return {
        data: seedData(),
        error:
          'Saved data could not be loaded. Original storage is preserved until you save. Restore a backup before entering new records.',
      };
    }
  });
  const [data, setData] = useState<Farm>(initial.data);
  const [notice, setNotice] = useState(initial.error);
  const [view, setView] = useState<View>('Overview');
  const [login, setLogin] = useState(location.hash === '#login');
  const [signedIn, setSignedIn] = useState(() => {
    try {
      return sessionStorage.getItem('flockbook.demo') === 'yes';
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState('monthly');
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [dialog, setDialog] = useState(false);
  const [saleDraft, setSaleDraft] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const [page, setPage] = useState(1);
  const upload = useRef<HTMLInputElement>(null);
  const today = dateKey();
  const all = [...data.records].sort((a, b) => b.date.localeCompare(a.date));
  const latest = all[0];
  const todayRecord = data.records.find((r) => r.date === today);
  const [draft, setDraft] = useState<RecordDay>({
    date: today,
    birds: 5200,
    eggs: 0,
    feed: 0,
    damaged: 0,
    notes: '',
  });
  const selected = periodRecords(data.records, month, mode) as RecordDay[];
  const total = totals(selected, data.settings.traySize);
  const stock = stockOf(data);
  const todaySales = salesTotals(data.sales.filter((s) => s.date === today));
  const selectedSales = periodRecords(data.sales, month, mode) as Sale[];
  const ledger = inventoryLedger(data);
  const [y, m] = month.split('-').map(Number);
  const previousMonth = dateKey(
    new Date(y, m - 1 - (mode === 'quarterly' ? 3 : 1), 1),
  ).slice(0, 7);
  const previous = totals(
    periodRecords(data.records, previousMonth, mode),
    data.settings.traySize,
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
  const graph = selected.map((r) => ({ ...r, label: niceDate(r.date) }));
  function commit(next: Farm) {
    try {
      validateData(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setData(next);
      setPage(1);
      return true;
    } catch (e) {
      setConfirm(null);
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not save. Browser storage may be full or unavailable.',
      );
      return false;
    }
  }
  function openRecord(r?: RecordDay) {
    setEditing(r?.date ?? null);
    setDraft(
      r ?? {
        date: today,
        birds: latest?.birds ?? 0,
        eggs: 0,
        feed: 0,
        damaged: 0,
        notes: '',
      },
    );
    setError('');
    setDialog(true);
  }
  function saveRecord(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      if (data.records.some((r) => r.date === draft.date && r.date !== editing))
        throw new Error(
          'A record already exists for this date. Edit that record instead.',
        );
      const next = {
        ...data,
        records: [...data.records.filter((r) => r.date !== editing), draft],
      };
      validateData(next);
      if (commit(next)) {
        setDialog(false);
        setNotice('Production record saved. Stock and reports are up to date.');
      } else
        setError(
          'Record could not be saved. Check that browser storage is available.',
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openSale(sale?: Sale) {
    setSaleDraft(
      sale ?? {
        id: crypto.randomUUID(),
        date: today,
        customer: '',
        trays: 1,
        pricePerTray: 180,
        discountPercent: 0,
        notes: '',
      },
    );
  }
  function saveSale(sale: Sale) {
    const next = {
      ...data,
      sales: [...data.sales.filter((s) => s.id !== sale.id), sale],
    };
    validateData(next);
    if (!commit(next))
      throw new Error(
        'Could not save this sale. Browser storage may be full or unavailable.',
      );
    setSaleDraft(null);
    setNotice('Customer sale saved. Egg stock has been updated.');
  }
  function deleteSale(sale: Sale) {
    setConfirm({
      title: 'Delete this customer sale?',
      description:
        'The sale to ' +
        sale.customer +
        ' on ' +
        niceDate(sale.date, true) +
        ' will be removed and its eggs returned to stock.',
      run: () => {
        if (
          commit({ ...data, sales: data.sales.filter((s) => s.id !== sale.id) })
        ) {
          setConfirm(null);
          setNotice('Sale deleted. Its eggs have been returned to inventory.');
        }
      },
    });
  }
  function exportBackup() {
    download(`flockbook-backup-${today}.json`, JSON.stringify(data, null, 2));
    setNotice('Backup downloaded. Keep it somewhere safe.');
  }
  function exportCSV() {
    const fields = ['date', 'birds', 'eggs', 'feed', 'damaged'];
    download(
      `flockbook-${month}-${mode}.csv`,
      [
        fields.join(','),
        ...selected.map((r) =>
          fields.map((k) => r[k as keyof RecordDay]).join(','),
        ),
      ].join('\r\n'),
      'text/csv',
    );
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
  useFarmTools(
    {
      farm: data.settings.name,
      sample: data.sample,
      inventoryEggs: stock,
      period: periodTitle,
      ...total,
    },
    () => {
      setLogin(false);
      history.replaceState(null, '', location.pathname + location.search);
      openRecord();
    },
  );
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
    setSignedIn(true);
    location.hash = '';
    setLogin(false);
  };
  const cards = [
    {
      title: 'Laying hens',
      value: latest ? fmt(latest.birds) : '—',
      unit: 'birds',
      icon: Bird,
      foot: latest
        ? `Last counted ${niceDate(latest.date)}`
        : 'Add your first production record',
      tone: 'green',
    },
    {
      title: 'Eggs collected today',
      value: todayRecord ? fmt(todayRecord.eggs) : '—',
      unit: 'eggs',
      icon: Egg,
      foot: todayRecord
        ? `${fmt(todayRecord.birds ? (todayRecord.eggs / todayRecord.birds) * 100 : 0, 1)}% laying rate`
        : 'No record for today',
      tone: 'orange',
    },
    {
      title: 'Trays sold today',
      value: fmt(todaySales.trays),
      unit: 'trays',
      icon: ShoppingBasket,
      foot: `${todaySales.count} customer sales · ${money(todaySales.amount)} total`,
      tone: 'blue',
    },
    {
      title: 'Feed consumed today',
      value: todayRecord ? fmt(todayRecord.feed, 3) : '—',
      unit: 'tonnes',
      icon: Wheat,
      foot: todayRecord
        ? `${fmt(todayRecord.feed * 1000)} kg fed to your flock`
        : 'No record for today',
      tone: 'purple',
    },
  ];
  const recordsTable = (rows: RecordDay[], compact = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {!compact && <TableHead>Hens</TableHead>}
          <TableHead>Eggs collected</TableHead>
          <TableHead>Feed (t)</TableHead>
          {!compact && (
            <>
              <TableHead>Damaged</TableHead>
            </>
          )}
          <TableHead>Laying rate</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.date}>
            <TableCell className="date-cell">
              {niceDate(r.date)}{' '}
              {r.date === today && <span className="today-tag">Today</span>}
            </TableCell>
            {!compact && <TableCell>{fmt(r.birds)}</TableCell>}
            <TableCell>{fmt(r.eggs)}</TableCell>
            <TableCell>{r.feed.toFixed(3)}</TableCell>
            {!compact && (
              <>
                <TableCell>{r.damaged}</TableCell>
              </>
            )}
            <TableCell>
              <span className="rate-tag">
                {r.birds ? fmt((r.eggs / r.birds) * 100, 1) : '0'}%
              </span>
            </TableCell>
            <TableCell>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${r.date}`}
                  onClick={() => openRecord(r)}
                >
                  <Pencil size={15} />
                </button>
                {!compact && (
                  <button
                    className="icon-button"
                    aria-label={`Delete ${r.date}`}
                    onClick={() =>
                      setConfirm({
                        title: 'Delete this production record?',
                        description: `The record for ${niceDate(r.date, true)} will be removed. Inventory and reports will be recalculated.`,
                        run: () => {
                          if (
                            commit({
                              ...data,
                              records: data.records.filter(
                                (x) => x.date !== r.date,
                              ),
                            })
                          ) {
                            setNotice('Record deleted.');
                            setConfirm(null);
                          }
                        },
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
  const periodControl = (
    <div className="period-controls">
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(String(v));
          setPage(1);
        }}
      >
        <TabsList className="period-tabs">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="month-control">
        <button aria-label="Previous period" onClick={() => movePeriod(-1)}>
          <ChevronLeft size={16} />
        </button>
        <label>
          <CalendarDays size={16} />
          <span>{periodTitle}</span>
          <input
            aria-label="Select reporting month"
            type="month"
            max={today.slice(0, 7)}
            value={month}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                setMonth(e.target.value);
                setPage(1);
              }
            }}
          />
        </label>
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
  if (login)
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
              Your flock, your eggs, your progress.
              <br />
              All together in one simple place.
            </p>
            <div className="login-stats">
              <div>
                <Egg />
                <strong>Production</strong>
                <span>Every egg counts</span>
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
          <span className="pill">PROTOTYPE</span>
          <h2>Welcome to Flockbook</h2>
          <p>Take a look around your farm workspace.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                f.get('email') === 'owner@flockbook.demo' &&
                f.get('password') === 'demo123'
              ) {
                enterDemo();
              } else setError('Use the demo email and password shown below.');
            }}
          >
            <label>
              Email address
              <input
                type="email"
                name="email"
                required
                placeholder="owner@flockbook.demo"
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                required
                placeholder="Enter demo password"
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" type="submit">
              Sign in to demo <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-credentials">
            <Info size={18} />
            <p>
              Demo email: <strong>owner@flockbook.demo</strong>
              <br />
              Password: <strong>demo123</strong>
            </p>
          </div>
          <button className="text-button" onClick={enterDemo}>
            Or explore the demo directly <ArrowRight size={16} />
          </button>
          <p className="storage-note">
            Demo access only, without real authentication. Records stay in this
            browser and are shared by anyone using it.
          </p>
        </section>
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
              <small>Poultry farm</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="side-content">
          <span className="nav-caption">WORKSPACE</span>
          <Navigation view={view} setView={setView} />
          <div className="next-chapter">
            <span>
              <Leaf size={16} /> ROOM TO GROW
            </span>
            <strong>
              Today, production.
              <br />
              Tomorrow, possibilities.
            </strong>
            <p>Finance and more, in a future release.</p>
            <span className="soon-tag">Coming later</span>
          </div>
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
            onClick={() => {
              setError('');
              if (signedIn) {
                try {
                  sessionStorage.removeItem('flockbook.demo');
                } catch {
                  /* Optional demo session. */
                }
                setSignedIn(false);
              }
              location.hash = 'login';
              setLogin(true);
            }}
          >
            <span className="user-avatar">GV</span>
            <span>
              <strong>{signedIn ? 'Farm owner' : 'Demo workspace'}</strong>
              <small>{signedIn ? 'Sign out of demo' : 'Open demo login'}</small>
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
            <span className="save-status">
              <span />
              {data.sample ? 'Sample data' : 'Saved on this device'}
            </span>
            <span className="prototype-tag">Prototype</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR FARM, IN FOCUS</div>
              <h1>{view === 'Overview' ? 'Farm overview' : view}</h1>
              <p>
                {view === 'Overview'
                  ? 'A little clarity on everything happening at your farm.'
                  : view === 'Customer sales'
                    ? 'One entry per customer. Wholesale, retail, or a little regular-customer discount.'
                    : view === 'Production records'
                      ? 'Your daily work, neatly recorded.'
                      : view === 'Egg inventory'
                        ? 'From collection to sale. Every egg accounted for.'
                        : view === 'Reports & insights'
                          ? 'Understand your production and make informed decisions.'
                          : 'Make this workspace your own.'}
              </p>
            </div>
            {view !== 'Farm settings' && (
              <div className="heading-actions">
                {todayRecord && view !== 'Customer sales' && (
                  <button
                    className="secondary-button"
                    onClick={() => openRecord(todayRecord)}
                  >
                    <Pencil size={15} />
                    Edit today
                  </button>
                )}
                {view !== 'Customer sales' && (
                  <button
                    className="secondary-button"
                    onClick={() => openRecord()}
                  >
                    <Plus size={18} />
                    Add production
                  </button>
                )}
                <button className="primary" onClick={() => openSale()}>
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
                <span className="sample-dot" /> You’re exploring a sample farm.
                Make yourself at home.
              </span>
              <button onClick={() => setView('Farm settings')}>
                Set up your farm <ArrowRight size={16} />
              </button>
            </div>
          )}
          {view === 'Overview' && (
            <>
              <div className="section-label">
                <h2>
                  Today at a glance <span className="live-dot" />
                </h2>
                <span>
                  <CalendarDays size={15} />
                  {niceDate(today, true)}
                </span>
              </div>
              <div className="stats-grid">
                {cards.map((c) => (
                  <article className="stat-card" key={c.title}>
                    <div className="stat-top">
                      <span>{c.title}</span>
                      <span className={`stat-icon ${c.tone}`}>
                        <c.icon size={20} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {c.value}
                      <small>{c.unit}</small>
                    </div>
                    <div className="stat-foot">{c.foot}</div>
                  </article>
                ))}
              </div>
            </>
          )}
          {(view === 'Overview' || view === 'Reports & insights') && (
            <>
              <div className="section-label report-heading">
                <h2>
                  {view === 'Overview'
                    ? 'The bigger picture'
                    : 'Production performance'}
                </h2>
                {periodControl}
              </div>
              <div className="chart-row">
                <section className="panel production-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Egg production</h3>
                      <p>Daily collection over the selected period</p>
                    </div>
                    <span className="legend">
                      <i /> Eggs collected
                    </span>
                  </div>
                  <div className="chart-summary">
                    <strong>
                      {fmt(total.eggs)}
                      <small> eggs</small>
                    </strong>
                    {delta !== null && (
                      <span
                        className={
                          delta >= 0 ? 'change-tag' : 'change-tag down'
                        }
                      >
                        <ArrowUpRight size={14} />
                        {delta >= 0 ? '+' : ''}
                        {fmt(delta, 1)}% avg / day
                      </span>
                    )}
                    <span className="secondary">
                      {total.days} recorded days
                    </span>
                  </div>
                  <div className="chart-area">
                    {graph.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={graph}
                          margin={{ top: 15, right: 8, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="eggFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#e5aa16"
                                stopOpacity={0.23}
                              />
                              <stop
                                offset="100%"
                                stopColor="#e5aa16"
                                stopOpacity={0.015}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="4 5"
                            vertical={false}
                            stroke="#eee6d3"
                          />
                          <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            minTickGap={35}
                            tick={{ fill: '#7d8580', fontSize: 12 }}
                            dy={8}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#7d8580', fontSize: 12 }}
                            tickFormatter={(v) =>
                              v >= 1000 ? `${v / 1000}k` : v
                            }
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10,
                              borderColor: '#e3e9e5',
                            }}
                            formatter={(v) => [
                              fmt(Number(v)),
                              'Eggs collected',
                            ]}
                          />
                          <Area
                            type="monotone"
                            dataKey="eggs"
                            stroke="#c58a0a"
                            strokeWidth={2.5}
                            fill="url(#eggFill)"
                            dot={graph.length === 1}
                            activeDot={{
                              r: 5,
                              stroke: 'white',
                              strokeWidth: 3,
                            }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="empty">
                        <Egg />
                        <h3>No records in this period</h3>
                        <p>Choose another period or add a production record.</p>
                      </div>
                    )}
                  </div>
                  <div className="chart-bottom">
                    <span>
                      <i className="dot green-dot" />{' '}
                      {total.days
                        ? `${fmt(total.eggs / total.days)} eggs / recorded day`
                        : 'No daily average yet'}
                    </span>
                    <span>Missing days are excluded</span>
                  </div>
                </section>
                <section className="stock-panel">
                  <div className="stock-top">
                    <span className="stock-icon">
                      <Package size={21} />
                    </span>
                    <span>CURRENT INVENTORY</span>
                  </div>
                  <h3>
                    Ready for the
                    <br />
                    next delivery.
                  </h3>
                  <div className="stock-count">
                    {fmt(stock)}
                    <small>eggs in storage</small>
                  </div>
                  <div className="stock-equivalent">
                    <span>
                      <strong>
                        {fmt(Math.floor(stock / data.settings.traySize))}
                      </strong>{' '}
                      full trays
                    </span>
                    <span>+ {stock % data.settings.traySize} loose eggs</span>
                  </div>
                  <div className="stock-rule" />
                  <p>
                    Updated from all your production,
                    <br />
                    sales, and damage records.
                  </p>
                  <button onClick={() => setView('Egg inventory')}>
                    View inventory <ArrowUpRight size={18} />
                  </button>
                </section>
              </div>
              <div className="insights-grid">
                <section className="panel feed-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Feed consumption</h3>
                      <p>{fmt(total.feed, 3)} tonnes this period</p>
                    </div>
                    <span className="stat-icon orange">
                      <Wheat size={20} />
                    </span>
                  </div>
                  <div className="feed-chart">
                    {graph.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={graph}
                          margin={{ top: 10, right: 5, left: -22, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="4 5"
                            vertical={false}
                            stroke="#eee6d3"
                          />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={45}
                            tick={{ fill: '#7d8580', fontSize: 12 }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: '#7d8580', fontSize: 12 }}
                          />
                          <Tooltip
                            formatter={(v) => [
                              `${fmt(Number(v), 3)} tonnes`,
                              'Feed',
                            ]}
                          />
                          <Bar
                            dataKey="feed"
                            fill="#f2c352"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={25}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="empty">No feed records for this period.</p>
                    )}
                  </div>
                </section>
                <section className="panel performance-panel">
                  <div className="panel-heading">
                    <h3>Farm insights</h3>
                    <span className="insight-tag">
                      <Sprout size={13} /> From your records
                    </span>
                  </div>
                  <div className="insight-item">
                    <span className="insight-icon">
                      <Egg size={18} />
                    </span>
                    <div>
                      <strong>
                        {total.days
                          ? `${fmt(total.rate, 1)}% laying rate`
                          : 'No production data yet'}
                      </strong>
                      <p>
                        {total.days
                          ? `${fmt(total.eggs)} eggs from ${fmt(total.birds)} recorded bird-days.`
                          : 'Add a production record to see your flock’s performance.'}
                      </p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <span className="insight-icon wheat">
                      <Wheat size={18} />
                    </span>
                    <div>
                      <strong>
                        {total.eggs
                          ? `${fmt(total.feedPerDozen, 2)} kg feed per dozen eggs`
                          : 'Feed efficiency will appear here'}
                      </strong>
                      <p>Track this over time to understand feed efficiency.</p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <span className="insight-icon blue">
                      <ChartNoAxesCombined size={18} />
                    </span>
                    <div>
                      <strong>
                        {delta === null
                          ? 'More history, better perspective'
                          : `Daily production ${delta >= 0 ? 'up' : 'down'} ${fmt(Math.abs(delta), 1)}%`}
                      </strong>
                      <p>
                        {delta === null
                          ? 'Record another period to compare daily averages.'
                          : `Compared with the previous ${mode === 'monthly' ? 'month' : 'quarter'} (${previous.days} recorded days).`}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === 'Overview' && (
            <section className="panel records-panel">
              <div className="panel-heading">
                <div>
                  <h3>Recent production records</h3>
                  <p>The latest entries from your farm</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setView('Production records')}
                >
                  View all records <ArrowRight size={16} />
                </button>
              </div>
              {all.length ? (
                recordsTable(all.slice(0, 5), true)
              ) : (
                <div className="empty">
                  <NotebookPen />
                  <h3>Your first record starts here</h3>
                  <button className="primary" onClick={() => openRecord()}>
                    Add production record
                  </button>
                </div>
              )}
            </section>
          )}
          {view === 'Production records' && (
            <>
              <div className="section-label report-heading">
                {periodControl}
                <button className="secondary-button" onClick={exportCSV}>
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
              <section className="panel records-panel">
                <div className="panel-heading">
                  <h3>{periodTitle}</h3>
                  <span className="secondary">
                    {selected.length} records · {fmt(total.eggs)} eggs collected
                  </span>
                </div>
                {selected.length ? (
                  recordsTable(
                    [...selected].reverse().slice((page - 1) * 12, page * 12),
                  )
                ) : (
                  <div className="empty">
                    <NotebookPen />
                    <h3>No records for this period</h3>
                    <p>Choose a different period or add your first entry.</p>
                    <button className="primary" onClick={() => openRecord()}>
                      Add production record
                    </button>
                  </div>
                )}
                <div className="pagination">
                  <span>
                    Page {page} of{' '}
                    {Math.max(1, Math.ceil(selected.length / 12))}
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
                    disabled={page * 12 >= selected.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </section>
            </>
          )}
          {view === 'Customer sales' && (
            <>
              <div className="section-label report-heading">
                {periodControl}
              </div>
              <SalesPanel
                key={month + mode}
                sales={selectedSales}
                traySize={data.settings.traySize}
                onEdit={openSale}
                onDelete={deleteSale}
                onAdd={() => openSale()}
              />
            </>
          )}
          {view === 'Egg inventory' && (
            <>
              <div className="inventory-total">
                <Package size={30} />
                <div>
                  <span>Available in storage</span>
                  <strong>
                    {fmt(stock)} <small>eggs</small>
                  </strong>
                  <p>
                    {fmt(Math.floor(stock / data.settings.traySize))} full trays
                    + {stock % data.settings.traySize} loose eggs
                  </p>
                </div>
              </div>
              <div className="inventory-equation">
                {[
                  { label: 'Opening stock', value: data.settings.openingStock },
                  { label: '+ Eggs collected', value: totals(all).eggs },
                  {
                    label: '− Eggs sold',
                    value:
                      salesTotals(data.sales).trays * data.settings.traySize,
                  },
                  { label: '− Damaged eggs', value: totals(all).damaged },
                ].map((x) => (
                  <div className="panel" key={x.label}>
                    <span>{x.label}</span>
                    <strong>{fmt(x.value)}</strong>
                  </div>
                ))}
              </div>
              <section className="panel records-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Stock movement</h3>
                    <p>
                      Latest 30 entries · {data.settings.traySize} eggs per tray
                    </p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Sold (eggs)</TableHead>
                      <TableHead>Damaged</TableHead>
                      <TableHead>Closing stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      return [...ledger]
                        .reverse()
                        .slice(0, 30)
                        .map((r) => (
                          <TableRow key={r.date}>
                            <TableCell>{niceDate(r.date)}</TableCell>
                            <TableCell>+{fmt(r.eggs)}</TableCell>
                            <TableCell>
                              −{fmt(r.trays * data.settings.traySize)}
                            </TableCell>
                            <TableCell>{r.damaged}</TableCell>
                            <TableCell>
                              <strong>{fmt(r.balance)}</strong>
                            </TableCell>
                          </TableRow>
                        ));
                    })()}
                  </TableBody>
                </Table>
                {!ledger.length && (
                  <div className="empty">
                    Your opening stock is ready. Add a production record to
                    start tracking movement.
                  </div>
                )}
              </section>
            </>
          )}
          {view === 'Farm settings' && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <h3>Farm details</h3>
                <p>Units and opening stock for this workspace.</p>
                <form
                  key={JSON.stringify(data.settings)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const settings = {
                      name: (f.get('name') as string).trim(),
                      openingStock: Number(f.get('openingStock')),
                      traySize: Number(f.get('traySize')),
                    };
                    if (commit({ ...data, settings }))
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
                  <div className="form-grid">
                    <label>
                      Opening stock (eggs)
                      <input
                        type="number"
                        name="openingStock"
                        min="0"
                        step="1"
                        defaultValue={data.settings.openingStock}
                        required
                      />
                    </label>
                    <label>
                      Eggs per tray
                      <input
                        type="number"
                        name="traySize"
                        min="1"
                        max="100"
                        step="1"
                        defaultValue={data.settings.traySize}
                        required
                        disabled={data.records.length + data.sales.length > 0}
                      />
                      {data.records.length + data.sales.length > 0 && (
                        <input
                          type="hidden"
                          name="traySize"
                          value={data.settings.traySize}
                        />
                      )}
                    </label>
                  </div>
                  <p className="field-note">
                    Opening stock is the balance before your first record. Tray
                    size is locked while records exist to preserve historical
                    sales.
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
                  This prototype saves records only in this browser. Export a
                  backup each day during the pilot.
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
                        description: `Replace this browser’s workspace with ${next.records.length} records from ${next.settings.name}. Export your current records first if you need to keep them.`,
                        run: () => {
                          if (commit(next)) {
                            setConfirm(null);
                            setNotice('Backup restored.');
                            setPage(1);
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
                    Device-local storage
                    <br />
                    <small>No database or shared farm accounts yet.</small>
                  </span>
                </div>
                <hr />
                <h3>Start your own farm</h3>
                <p>
                  Remove the example records and begin with an empty log. Set
                  your opening stock before adding records.
                </p>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setConfirm({
                      title: 'Start with an empty farm?',
                      description:
                        'All current records will be removed from this browser. Download a backup first to keep a copy. Farm name and tray size will be kept; opening stock resets to zero.',
                      run: () => {
                        if (
                          commit({
                            ...data,
                            sample: false,
                            settings: { ...data.settings, openingStock: 0 },
                            records: [],
                            sales: [],
                          })
                        ) {
                          setConfirm(null);
                          setNotice(
                            'Your empty farm is ready. Set opening stock, then add your first production record.',
                          );
                          setPage(1);
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
            <span>Flockbook · Production prototype</span>
          </footer>
        </main>
      </div>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="record-dialog">
          <DialogTitle className="dialog-title">
            {editing ? 'Edit production record' : 'Add production record'}
          </DialogTitle>
          <DialogDescription>
            Record hens, collected eggs, feed and damage once per day. Customer
            sales are recorded separately.
          </DialogDescription>
          <form onSubmit={saveRecord}>
            <div className="form-grid">
              <label>
                Date
                <input
                  type="date"
                  required
                  max={today}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label>
                Laying hens (birds)
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={draft.birds}
                  onChange={(e) =>
                    setDraft({ ...draft, birds: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Eggs collected
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={draft.eggs}
                  onChange={(e) =>
                    setDraft({ ...draft, eggs: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Feed consumed (tonnes)
                <input
                  type="number"
                  required
                  min="0"
                  step="0.001"
                  value={draft.feed}
                  onChange={(e) =>
                    setDraft({ ...draft, feed: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Damaged / discarded eggs
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={draft.damaged}
                  onChange={(e) =>
                    setDraft({ ...draft, damaged: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              Notes <span className="optional">(optional)</span>
              <textarea
                value={draft.notes}
                maxLength={1000}
                placeholder="Anything useful to remember about today…"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <p className="field-note">
              1 tonne = 1,000 kg. Enter 0.5 for 500 kg of feed.
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
                onClick={() => setDialog(false)}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                <Check size={17} />
                Save record
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {saleDraft && (
        <SaleDialog
          key={saleDraft.id}
          initial={saleDraft}
          existing={data.sales.some((s) => s.id === saleDraft.id)}
          traySize={data.settings.traySize}
          stock={stock}
          onClose={() => setSaleDraft(null)}
          onSave={saveSale}
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
