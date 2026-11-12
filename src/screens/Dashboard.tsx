/* Home dashboard — the web version of the Android DashboardScreen. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repo } from '../data';
import { addDays, today, type LocalDate } from '../data/dates';
import type { Client, FollowUpWithClient } from '../data/types';
import { locale, t, tp, type TextKey } from '../i18n';
import {
  Avatar,
  Card,
  CircleIconButton,
  ClientItem,
  DeltaPill,
  EmptyState,
  FollowUpItem,
  ProspectItem,
  ScreenHeader,
  SectionHeader,
  SegmentedPicker,
  WeightResultChip,
} from '../ui/components';
import {
  bucket,
  funnel,
  mostActive,
  newClientCounts,
  prospectOutcomes,
  ratioBucket,
  type ActiveClient,
  type ActivityBar,
  type ActivityMetric,
  type ActivityRange,
  type Funnel,
  type FunnelPeriod,
} from '../ui/dashboard';
import { longDay } from '../ui/format';
import { navigate, paths } from '../ui/router';

const RANGES: ActivityRange[] = ['WEEKS', 'MONTHS'];
const METRICS: ActivityMetric[] = ['NEW_CLIENTS', 'CHECK_INS', 'YOUR_WORK'];
const PERIODS: FunnelPeriod[] = ['WEEK', 'MONTH', 'ALL'];
const metricLabel: Record<ActivityMetric, TextKey> = {
  NEW_CLIENTS: 'metric_new_clients',
  CHECK_INS: 'metric_check_ins',
  YOUR_WORK: 'metric_your_work',
};
const periodLabel: Record<FunnelPeriod, TextKey> = { WEEK: 'period_week', MONTH: 'period_month', ALL: 'period_all' };

// Chart choices are kept while the app is open (like the Android view model).
const saved = { range: 'MONTHS' as ActivityRange, metric: 'NEW_CLIENTS' as ActivityMetric, period: 'MONTH' as FunnelPeriod };

function greeting(): string {
  const h = new Date().getHours();
  return t(h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_afternoon' : 'greeting_evening');
}

export function DashboardScreen() {
  const data = useLiveQuery(async () => {
    const [clients, pending, plans, completed, prospects] = await Promise.all([
      repo.clients(),
      repo.pendingFollowUps(),
      repo.activePlans(),
      repo.completedFollowUps(),
      repo.prospects(),
    ]);
    return { clients, pending, plans, completed, prospects };
  });
  const [range, setRange] = useState(saved.range);
  const [metric, setMetric] = useState(saved.metric);
  const [period, setPeriod] = useState(saved.period);

  const now = today();
  const header = (
    <ScreenHeader title={greeting()} subtitle={longDay(now)}>
      <CircleIconButton icon="settings" label={t('settings')} onClick={() => navigate(paths.settings())} />
    </ScreenHeader>
  );
  if (!data) return <div className="screen">{header}</div>;

  const { clients, pending, plans, completed, prospects } = data;
  const active = clients.filter((c) => c.status === 'ACTIVE');
  const withPlan = new Set(plans.map((p) => p.clientId));
  const withFollowUp = new Set(pending.map((p) => p.followUp.clientId));
  const newCounts = newClientCounts(clients, now);
  const bars =
    metric === 'NEW_CLIENTS' ? bucket(clients.map((c) => c.startDate), range, now)
    : metric === 'CHECK_INS' ? bucket(completed.map((f) => f.date), range, now)
    : ratioBucket(prospectOutcomes(prospects, clients, now), range, now);
  const overdue = pending.filter((p) => p.followUp.date < now);
  const dueToday = pending.filter((p) => p.followUp.date === now);
  const nextWeek = pending.filter((p) => p.followUp.date > now && p.followUp.date <= addDays(now, 7));
  const withoutPlan = active.filter((c) => !withPlan.has(c.id!));
  const withoutFollowUp = active.filter((c) => !withFollowUp.has(c.id!));
  const ranking = mostActive(clients, completed, now);
  // Booked appointments up to a week ahead, plus any that passed without an update.
  const appointments = prospects
    .filter((p) => p.status === 'APPOINTMENT' && p.appointmentDate <= addDays(now, 7))
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  const hasProspectData = prospects.length > 0 || clients.some((c) => c.fromAppointment != null);
  const total = clients.length;

  if (total === 0 && appointments.length === 0 && !hasProspectData) {
    return (
      <div className="screen">
        {header}
        <EmptyState message={t('empty_no_clients')} icon="person" />
      </div>
    );
  }

  const allCaughtUp = total > 0 && !overdue.length && !dueToday.length && !nextWeek.length && !withoutPlan.length && !withoutFollowUp.length;

  return (
    <div className="screen">
      {header}
      <div className="screen__content screen__content--tabs">
        {total === 0 && <EmptyState message={t('empty_no_clients')} icon="person" />}
        {total > 0 && (
          <>
            <HeroCard active={active.length} total={total} />
            <div className="tiles mt-12">
              <StatTile label={t('total_clients')} value={total} footnote={tp('inactive_count', total - active.length)} />
              <StatTile
                label={t('new_this_month')}
                value={newCounts.thisMonth}
                delta={newCounts.thisMonth - newCounts.lastMonth}
                footnote={t('vs_last_month')}
              />
            </div>
            <ActivityCenter
              bars={bars}
              range={range}
              metric={metric}
              onRange={(r) => setRange((saved.range = r))}
              onMetric={(m) => setMetric((saved.metric = m))}
            />
          </>
        )}
        {hasProspectData && (
          <AppointmentsCard
            period={period}
            funnel={funnel(prospects, clients, period, now)}
            onPeriod={(p) => setPeriod((saved.period = p))}
          />
        )}

        {ranking.length > 0 && (
          <>
            <SectionHeader text={t('most_active')} />
            <div className="text-sm muted hint-below">{t('most_active_hint')}</div>
            {ranking.map((a, i) => (
              <MostActiveItem key={a.client.id} rank={i + 1} item={a} />
            ))}
          </>
        )}

        {appointments.length > 0 && (
          <>
            <SectionHeader text={t('section_appointments')} count={appointments.length} />
            {appointments.map((p) => (
              <ProspectItem key={p.id} prospect={p} onClick={() => navigate(paths.prospect(p.id!))} />
            ))}
          </>
        )}

        <FollowUpSection title="section_overdue" list={overdue} />
        <FollowUpSection title="section_due_today" list={dueToday} />
        <FollowUpSection title="section_next_7" list={nextWeek} />
        <ClientSection title="section_no_plan" list={withoutPlan} />
        <ClientSection title="section_no_followup" list={withoutFollowUp} />

        {allCaughtUp && <EmptyState message={t('all_caught_up')} icon="checkCircle" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hero + tiles
// ---------------------------------------------------------------------

function HeroCard({ active, total }: { active: number; total: number }) {
  const share = total ? active / total : 0;
  return (
    <div className="hero">
      <div className="hero__label">{t('active_clients')}</div>
      <div className="row align-end row--tight">
        <span className="hero__value">{active}</span>
        <span className="hero__of">{t('of_total', total)}</span>
      </div>
      <div className="hero__track">
        <div className="hero__fill" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="hero__note">{t('active_share', Math.floor(share * 100))}</div>
    </div>
  );
}

function StatTile({ label, value, delta, footnote }: { label: string; value: number; delta?: number; footnote?: string }) {
  return (
    <Card padding={18} className="stat-tile">
      <div className="label-lg muted">{label}</div>
      <div className="display-sm">{value}</div>
      <div className="row row--tight">
        {delta != null && <DeltaPill delta={delta} />}
        {footnote && <span className="text-sm muted">{footnote}</span>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Activity center
// ---------------------------------------------------------------------

function ActivityCenter({
  bars,
  range,
  metric,
  onRange,
  onMetric,
}: {
  bars: ActivityBar[];
  range: ActivityRange;
  metric: ActivityMetric;
  onRange: (r: ActivityRange) => void;
  onMetric: (m: ActivityMetric) => void;
}) {
  const ratio = metric === 'YOUR_WORK';
  const currentBar = bars.at(-1);
  const current = currentBar?.value ?? 0;
  const previous = bars.at(-2)?.value ?? 0;
  const noun =
    metric === 'NEW_CLIENTS' ? tp('noun_new_clients', current, '')
    : metric === 'CHECK_INS' ? tp('noun_check_ins', current, '')
    : t('your_work_noun');
  const period = t(range === 'WEEKS' ? 'this_week' : 'this_month');
  let compare: string;
  if (ratio) {
    // Overall ratio across the whole chart window, not an average of percentages.
    const total = bars.reduce((s, b) => s + b.total, 0);
    const overall = total ? Math.round((bars.reduce((s, b) => s + b.count, 0) * 100) / total) : 0;
    compare = t('your_work_compare', currentBar?.count ?? 0, currentBar?.total ?? 0, overall);
  } else {
    const average = bars.length ? bars.reduce((s, b) => s + b.value, 0) / bars.length : 0;
    compare = t(range === 'WEEKS' ? 'activity_compare_week' : 'activity_compare_month', average.toFixed(1));
  }

  return (
    <Card padding={18} className="mt-12">
      <div className="row">
        <h2 className="title-lg grow">{t('activity')}</h2>
        <SegmentedPicker options={RANGES} selected={range} onSelect={onRange} fill={false} compact label={(r) => t(r === 'WEEKS' ? 'range_weeks' : 'range_months')} />
      </div>
      <SegmentedPicker className="mt-12" options={METRICS} selected={metric} onSelect={onMetric} compact label={(m) => t(metricLabel[m])} />
      <div className="row row--tight align-end mt-18">
        <span className="headline-lg">{ratio ? `${current}%` : current}</span>
        <span className="text-md muted pb-4">{`${noun} ${period}`}</span>
      </div>
      <div className="row row--tight mt-4">
        <DeltaPill delta={current - previous} suffix={ratio ? '%' : ''} />
        <span className="text-sm muted">{compare}</span>
      </div>
      <BarChart bars={bars} range={range} ratio={ratio} />
    </Card>
  );
}

function barLabel(start: LocalDate, range: ActivityRange) {
  const d = new Date(`${start}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = range === 'WEEKS' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale(), opts).format(d).replace('.', '').replace(/\bSept\b/, 'Sep');
}

function BarChart({ bars, range, ratio }: { bars: ActivityBar[]; range: ActivityRange; ratio: boolean }) {
  // Percentages are always drawn against 100 so bars compare honestly between periods.
  const max = ratio ? 100 : Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="chart" role="img" aria-label={bars.map((b) => `${barLabel(b.start, range)}: ${ratio ? `${b.value}%` : b.value}`).join(', ')}>
      {bars.map((b) => (
        <div key={b.start} className={`chart__col${b.isCurrent ? ' is-current' : ''}`}>
          <div className="chart__plot">
            <span className="chart__value">{!ratio ? b.value : b.total === 0 ? '–' : `${b.value}%`}</span>
            <div className="chart__bar" style={{ height: `${Math.max(3, (b.value / max) * 100)}%` }} />
          </div>
          <span className="chart__label">{barLabel(b.start, range)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Appointments funnel
// ---------------------------------------------------------------------

function AppointmentsCard({ period, funnel: f, onPeriod }: { period: FunnelPeriod; funnel: Funnel; onPeriod: (p: FunnelPeriod) => void }) {
  const pct = (n: number) => (f.booked ? Math.round((n * 100) / f.booked) : 0);
  const noShow = f.booked - f.came;
  const notes = [noShow > 0 && tp('funnel_no_show', noShow), f.upcoming > 0 && tp('funnel_upcoming', f.upcoming)].filter(Boolean);
  return (
    <Card padding={18} className="mt-12">
      <div className="row">
        <h2 className="title-lg grow">{t('appointments_card')}</h2>
        <SegmentedPicker options={PERIODS} selected={period} onSelect={onPeriod} fill={false} compact label={(p) => t(periodLabel[p])} />
      </div>
      <div className="mt-16">
        <FunnelRow label={t('funnel_booked')} value={f.booked} fraction={f.booked ? 1 : 0} />
        <FunnelRow label={t('funnel_came')} value={f.came} fraction={pct(f.came) / 100} percent={f.booked ? pct(f.came) : null} />
        <FunnelRow label={t('funnel_started')} value={f.started} fraction={pct(f.started) / 100} percent={f.booked ? pct(f.started) : null} />
      </div>
      {notes.length > 0 && <div className="text-sm muted mt-4">{notes.join(' · ')}</div>}
    </Card>
  );
}

/** One step of the funnel: label + count, then a bar filled to [fraction] of the appointments. */
function FunnelRow({ label, value, fraction, percent = null }: { label: string; value: number; fraction: number; percent?: number | null }) {
  return (
    <div className="funnel-row">
      <div className="row row--tight align-end">
        <span className="text-md grow">{label}</span>
        {percent != null && <span className="label-md muted pb-2">{percent}%</span>}
        <span className="title-lg">{value}</span>
      </div>
      <div className="funnel-row__track">
        {fraction > 0 && <div className="funnel-row__fill" style={{ width: `${Math.max(2, fraction * 100)}%` }} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------

function MostActiveItem({ rank, item }: { rank: number; item: ActiveClient }) {
  return (
    <Card onClick={() => navigate(paths.client(item.client.id!))} padding={14} className="list-item">
      <div className="row">
        <span className="rank">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</span>
        <Avatar name={item.client.name} photoId={item.client.photoId} />
        <div className="grow min0">
          <div className="title-md ellipsis">{item.client.name}</div>
          <div className="text-sm muted ellipsis">
            {`${tp('check_ins_30', item.checkIns30)} · ${t('total_check_ins', item.totalCheckIns)}`}
          </div>
        </div>
        {item.weightChange != null && <WeightResultChip change={item.weightChange} />}
      </div>
    </Card>
  );
}

function FollowUpSection({ title, list }: { title: TextKey; list: FollowUpWithClient[] }) {
  if (!list.length) return null;
  return (
    <>
      <SectionHeader text={t(title)} count={list.length} />
      {list.map(({ followUp: f, clientName }) => (
        <FollowUpItem
          key={f.id}
          date={f.date}
          title={clientName}
          details={f.notes}
          completed={false}
          onClick={() => navigate(paths.followUp(f.clientId, f.id!))}
        />
      ))}
    </>
  );
}

function ClientSection({ title, list }: { title: TextKey; list: Client[] }) {
  if (!list.length) return null;
  return (
    <>
      <SectionHeader text={t(title)} count={list.length} />
      {list.map((c) => (
        <ClientItem key={c.id} client={c} onClick={() => navigate(paths.client(c.id!))} />
      ))}
    </>
  );
}
