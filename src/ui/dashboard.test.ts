import { describe, expect, it } from 'vitest';
import { newClient, newFollowUp, type Prospect } from '../data/types';
import { bucket, funnel, mostActive, newClientCounts, periods, prospectOutcomes, ratioBucket, weekStart } from './dashboard';

const TODAY = '2026-11-12'; // a Thursday

const prospect = (appointmentDate: string, status: Prospect['status'] = 'APPOINTMENT'): Prospect => ({
  name: 'P', phone: '', email: '', status, appointmentDate, appointmentTime: '', notes: '', createdDate: '2026-10-01',
});

describe('periods', () => {
  it('weeks start on Monday, months on the 1st, current last', () => {
    expect(weekStart(TODAY)).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday
    const weeks = periods('WEEKS', TODAY);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toEqual(['2026-11-09', '2026-11-16']);
    const months = periods('MONTHS', '2026-02-10');
    expect(months.map((p) => p[0])).toEqual(['2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    expect(months.at(-1)![1]).toBe('2026-03-01');
  });

  it('counts dates per period', () => {
    const bars = bucket(['2026-11-01', '2026-11-30', '2026-10-15', '2026-04-01'], 'MONTHS', TODAY);
    expect(bars.map((b) => b.value)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(bars.at(-1)!.isCurrent).toBe(true);
  });
});

describe('Your Work (prospect → client)', () => {
  it('uses past prospects and converted clients only', () => {
    const outcomes = prospectOutcomes(
      [prospect('2026-11-03', 'NO_PURCHASE'), prospect('2026-11-05'), prospect('2026-11-20'), prospect('2026-11-25', 'NO_PURCHASE')],
      [newClient({ name: 'A', startDate: TODAY, fromAppointment: '2026-11-10' }), newClient({ name: 'Old', startDate: '2026-01-01' })],
      TODAY,
    );
    // The 20 Nov appointment hasn't happened yet; a NO_PURCHASE counts even if dated later.
    expect(outcomes.sort()).toEqual([['2026-11-03', false], ['2026-11-05', false], ['2026-11-10', true], ['2026-11-25', false]]);
    const bars = ratioBucket(outcomes, 'MONTHS', TODAY);
    expect(bars.at(-1)).toMatchObject({ value: 25, count: 1, total: 4 });
    expect(bars[0]).toMatchObject({ value: 0, total: 0 });
  });
});

describe('Appointments funnel', () => {
  it('splits appointments into came / started / no-show / upcoming', () => {
    const prospects = [
      prospect('2026-11-10', 'NO_PURCHASE'), // came, this week
      prospect('2026-11-11'), // passed, not updated → counts as didn't come
      prospect('2026-11-14'), // upcoming this week
      prospect('2026-10-20', 'NO_PURCHASE'), // last month
    ];
    const clients = [newClient({ name: 'C', startDate: TODAY, fromAppointment: '2026-11-09' })];
    expect(funnel(prospects, clients, 'WEEK', TODAY)).toEqual({ booked: 3, came: 2, started: 1, upcoming: 1 });
    expect(funnel(prospects, clients, 'MONTH', TODAY)).toEqual({ booked: 3, came: 2, started: 1, upcoming: 1 });
    expect(funnel(prospects, clients, 'ALL', TODAY)).toEqual({ booked: 4, came: 3, started: 1, upcoming: 1 });
  });
});

describe('Most active', () => {
  it('ranks active clients by check-ins in the last 30 days', () => {
    const a = { ...newClient({ name: 'A', startDate: '2026-01-01', startWeight: 80 }), id: 1 };
    const b = { ...newClient({ name: 'B', startDate: '2026-01-01' }), id: 2 };
    const gone = { ...newClient({ name: 'Inactive', startDate: '2026-01-01', status: 'INACTIVE' }), id: 3 };
    const done = (clientId: number, date: string, weight: number | null = null) => newFollowUp({ clientId, date, completed: true, weight });
    const list = mostActive(
      [a, b, gone],
      [done(1, '2026-11-01', 78), done(2, '2026-11-02', 90), done(2, '2026-11-10', 89), done(2, '2026-01-01'), done(3, '2026-11-11'), done(1, '2026-09-01')],
      TODAY,
    );
    expect(list.map((x) => [x.client.name, x.checkIns30, x.totalCheckIns, x.weightChange])).toEqual([
      ['B', 2, 3, -1],
      ['A', 1, 2, -2],
    ]);
  });
});

it('counts new clients this and last month', () => {
  const clients = ['2026-11-01', '2026-11-12', '2026-10-31', '2025-11-05'].map((startDate) => newClient({ name: 'x', startDate }));
  expect(newClientCounts(clients, TODAY)).toEqual({ thisMonth: 2, lastMonth: 1 });
});
