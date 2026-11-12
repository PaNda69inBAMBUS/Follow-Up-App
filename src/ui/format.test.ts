import { describe, expect, it } from 'vitest';
import { fill, t, tp } from '../i18n';
import { daysBetween, durationText, fmt, period, pretty, relativeDayText, signed, toDoubleLenient, toIntLenient } from './format';

describe('texts', () => {
  it('fills placeholders like Android', () => {
    expect(fill('%1$d active · %2$d total', [3, 5])).toBe('3 active · 5 total');
    expect(fill('%s%%', ['12.5'])).toBe('12.5%');
    expect(t('client_since', '1 Sep 2026', '2 mo 1 wk')).toBe('Since 1 Sep 2026 · 2 mo 1 wk');
  });

  it('picks the right plural', () => {
    expect(tp('days_overdue', 1)).toBe('1 day overdue');
    expect(tp('days_overdue', 3)).toBe('3 days overdue');
    expect(tp('meals_count', 0)).toBe('0 meals');
  });
});

describe('dates', () => {
  it('formats and compares days', () => {
    expect(pretty('2026-11-03')).toBe('3 Nov 2026');
    expect(pretty('2026-09-01')).toBe('1 Sep 2026');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(relativeDayText('2026-11-12', '2026-11-12')).toBe('Today');
    expect(relativeDayText('2026-11-13', '2026-11-12')).toBe('Tomorrow');
    expect(relativeDayText('2026-11-11', '2026-11-12')).toBe('Yesterday');
    expect(relativeDayText('2026-11-02', '2026-11-12')).toBe('10 days overdue');
    expect(relativeDayText('2026-11-15', '2026-11-12')).toBe('In 3 days');
  });

  it('measures time as a client like Java Period', () => {
    expect(period('2026-01-31', '2026-03-01')).toMatchObject({ years: 0, months: 1, days: 1 });
    expect(durationText('2026-11-10', '2026-11-12')).toBe('2 days');
    expect(durationText('2026-10-20', '2026-11-12')).toBe('3 wk');
    expect(durationText('2026-08-01', '2026-11-12')).toBe('3 mo 1 wk');
    expect(durationText('2025-06-12', '2026-11-12')).toBe('1 yr 5 mo');
    expect(durationText('2026-12-01', '2026-11-12')).toBe('starts 1 Dec 2026');
  });
});

describe('numbers', () => {
  it('formats weights', () => {
    expect(fmt(80)).toBe('80');
    expect(fmt(80.25)).toBe('80.3');
    expect(signed(2)).toBe('+2');
    expect(signed(-1)).toBe('−1');
  });

  it('parses typed numbers leniently', () => {
    expect(toDoubleLenient(' 80,5 ')).toBe(80.5);
    expect(toDoubleLenient('80.')).toBe(80);
    expect(toDoubleLenient('abc')).toBeNull();
    expect(toDoubleLenient('')).toBeNull();
    expect(toIntLenient('12')).toBe(12);
    expect(toIntLenient('12.5')).toBeNull();
  });
});
