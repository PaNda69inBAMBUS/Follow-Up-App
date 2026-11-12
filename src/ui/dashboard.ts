/*
 * Dashboard numbers — a port of the logic in the Android app's DashboardScreen.kt
 * (activity chart, "Your Work" ratio, appointments funnel, most active clients).
 */
import { addDays, type LocalDate } from '../data/dates';
import type { Client, FollowUp, Prospect } from '../data/types';

export type ActivityRange = 'WEEKS' | 'MONTHS';
export type ActivityMetric = 'NEW_CLIENTS' | 'CHECK_INS' | 'YOUR_WORK';
export type FunnelPeriod = 'WEEK' | 'MONTH' | 'ALL';

/**
 * One bar of the chart; [start] is the first day of the week or month it covers.
 * For YOUR_WORK, [value] is a % and [count] of [total] prospects became clients.
 */
export interface ActivityBar {
  start: LocalDate;
  value: number;
  isCurrent: boolean;
  count: number;
  total: number;
}

/**
 * Appointments in a period: [booked] that already took place, how many [came]
 * (didn't buy + became clients), how many [started] the program, plus [upcoming] still ahead.
 */
export interface Funnel {
  booked: number;
  came: number;
  started: number;
  upcoming: number;
}

type Period = [start: LocalDate, endExclusive: LocalDate];

const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = (d: LocalDate, plusMonths = 0) => {
  const [y, m] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) + plusMonths;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
};
/** Monday of [d]'s week. */
export function weekStart(d: LocalDate): LocalDate {
  const [y, m, day] = d.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}
const inside = (d: LocalDate, [start, end]: Period) => d >= start && d < end;
const sameMonth = (a: LocalDate, b: LocalDate) => a.slice(0, 7) === b.slice(0, 7);

/** The last 8 weeks or 6 months, oldest first, current period last. */
export function periods(range: ActivityRange, today: LocalDate): Period[] {
  if (range === 'WEEKS') {
    const thisWeek = weekStart(today);
    return [7, 6, 5, 4, 3, 2, 1, 0].map((i) => [addDays(thisWeek, -7 * i), addDays(thisWeek, -7 * i + 7)]);
  }
  return [5, 4, 3, 2, 1, 0].map((i) => [monthStart(today, -i), monthStart(today, -i + 1)]);
}

/** Counts dates into the last 8 weeks or 6 months. */
export function bucket(dates: LocalDate[], range: ActivityRange, today: LocalDate): ActivityBar[] {
  const list = periods(range, today);
  return list.map((p, i) => {
    const value = dates.filter((d) => inside(d, p)).length;
    return { start: p[0], value, isCurrent: i === list.length - 1, count: value, total: 0 };
  });
}

/** Per period: % of prospects (by appointment date) that became clients. [outcomes]: date → became a client. */
export function ratioBucket(outcomes: [LocalDate, boolean][], range: ActivityRange, today: LocalDate): ActivityBar[] {
  const list = periods(range, today);
  return list.map((p, i) => {
    const inPeriod = outcomes.filter(([d]) => inside(d, p));
    const converted = inPeriod.filter(([, c]) => c).length;
    return {
      start: p[0],
      value: inPeriod.length ? Math.round((converted * 100) / inPeriod.length) : 0,
      isCurrent: i === list.length - 1,
      count: converted,
      total: inPeriod.length,
    };
  });
}

/**
 * Prospect outcomes by appointment date: converted clients count as `true`; prospects who came
 * and didn't buy, or whose appointment passed without being updated, count as `false`.
 */
export function prospectOutcomes(prospects: Prospect[], clients: Client[], today: LocalDate): [LocalDate, boolean][] {
  return [
    ...clients.filter((c) => c.fromAppointment != null).map((c): [LocalDate, boolean] => [c.fromAppointment!, true]),
    ...prospects
      .filter((p) => p.status === 'NO_PURCHASE' || p.appointmentDate <= today)
      .map((p): [LocalDate, boolean] => [p.appointmentDate, false]),
  ];
}

export function funnel(prospects: Prospect[], clients: Client[], period: FunnelPeriod, today: LocalDate): Funnel {
  const range: Period =
    period === 'WEEK' ? [weekStart(today), addDays(weekStart(today), 7)]
    : period === 'MONTH' ? [monthStart(today), monthStart(today, 1)]
    : ['0000-01-01', '9999-12-31'];
  const started = clients.filter((c) => c.fromAppointment != null && inside(c.fromAppointment, range)).length;
  const inRange = prospects.filter((p) => inside(p.appointmentDate, range));
  const noPurchase = inRange.filter((p) => p.status === 'NO_PURCHASE').length;
  const pending = inRange.filter((p) => p.status === 'APPOINTMENT');
  const upcoming = pending.filter((p) => p.appointmentDate > today).length;
  const noShow = pending.length - upcoming;
  return { booked: started + noPurchase + noShow, came: started + noPurchase, started, upcoming };
}

/** A client in the "Most active" ranking. [weightChange]: latest − start (kg), if known. */
export interface ActiveClient {
  client: Client;
  checkIns30: number;
  totalCheckIns: number;
  weightChange: number | null;
}

/** Top 5 active clients by check-ins in the last 30 days (then by all-time check-ins). */
export function mostActive(clients: Client[], completed: FollowUp[], today: LocalDate): ActiveClient[] {
  const since = addDays(today, -30);
  return clients
    .filter((c) => c.status === 'ACTIVE')
    .flatMap((c): ActiveClient[] => {
      const checkIns = completed.filter((f) => f.clientId === c.id);
      if (!checkIns.length) return [];
      const withWeight = checkIns.filter((f) => f.weight != null).sort((a, b) => a.date.localeCompare(b.date));
      const start = c.startWeight ?? withWeight[0]?.weight ?? null;
      const latest = withWeight.at(-1)?.weight ?? null;
      return [
        {
          client: c,
          checkIns30: checkIns.filter((f) => f.date >= since && f.date <= today).length,
          totalCheckIns: checkIns.length,
          weightChange: start != null && latest != null && (c.startWeight != null || withWeight.length >= 2) ? latest - start : null,
        },
      ];
    })
    .filter((a) => a.checkIns30 > 0)
    .sort((a, b) => b.checkIns30 - a.checkIns30 || b.totalCheckIns - a.totalCheckIns)
    .slice(0, 5);
}

/** New clients this month and last month (by start date). */
export function newClientCounts(clients: Client[], today: LocalDate) {
  const lastMonth = monthStart(today, -1);
  return {
    thisMonth: clients.filter((c) => sameMonth(c.startDate, today)).length,
    lastMonth: clients.filter((c) => sameMonth(c.startDate, lastMonth)).length,
  };
}
