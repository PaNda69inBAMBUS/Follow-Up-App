/* Formatting and parsing helpers — same behaviour as the Android app's Common.kt. */
import { locale, t, tp, type TextKey } from '../i18n';
import { today, type LocalDate } from '../data/dates';
import type { ClientStatus, ClientTask, MealType, TaskKind } from '../data/types';

const [Y, M, D] = [0, 1, 2];
const parts = (d: LocalDate) => d.split('-').map(Number);

/** Midday UTC so the formatted day never shifts with time zones. */
const toDate = (d: LocalDate) => {
  const p = parts(d);
  return new Date(Date.UTC(p[Y], p[M] - 1, p[D], 12));
};

const formatter = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...opts });

/** Newer browsers write September as "Sept" in British English; the Android app shows "Sep". */
const tidy = (s: string) => s.replace('.', '').replace(/\bSept\b/, 'Sep');

/** "12 Nov 2026" */
export const pretty = (d: LocalDate) => tidy(formatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(d)));

/** "Thursday, 12 November" */
export const longDay = (d: LocalDate) => {
  const s = formatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "NOV" */
export const shortMonth = (d: LocalDate) => tidy(formatter({ month: 'short' }).format(toDate(d))).toUpperCase();

export const dayOfMonth = (d: LocalDate) => parts(d)[D];

/** Whole days from [a] to [b] (positive if b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "In 3 days", "2 days overdue"… */
export function relativeDayText(date: LocalDate, now: LocalDate = today()): string {
  const days = daysBetween(now, date);
  if (days === 0) return t('day_today');
  if (days === 1) return t('day_tomorrow');
  if (days === -1) return t('day_yesterday');
  return days < 0 ? tp('days_overdue', -days) : tp('in_days', days);
}

/** Years / months / days from [start] to a later [end] — Java's Period.between algorithm. */
export function period(start: LocalDate, end: LocalDate) {
  const s = parts(start), e = parts(end);
  let totalMonths = (e[Y] - s[Y]) * 12 + (e[M] - s[M]);
  let days = e[D] - s[D];
  if (totalMonths > 0 && days < 0) {
    totalMonths--;
    // start + totalMonths, clamped to the month's last day (Jan 31 + 1 month = Feb 28).
    const y = s[Y] + Math.floor((s[M] - 1 + totalMonths) / 12);
    const m = ((s[M] - 1 + totalMonths) % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const calc = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(s[D], lastDay)).padStart(2, '0')}`;
    days = daysBetween(calc, end);
  }
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days, totalMonths };
}

/** "3 mo 2 wk", "1 yr 2 mo", "5 days"… */
export function durationText(start: LocalDate, now: LocalDate = today()): string {
  if (start > now) return t('duration_starts', pretty(start));
  const p = period(start, now);
  const days = daysBetween(start, now);
  if (p.totalMonths >= 12) return t('duration_years_months', p.years, p.months);
  if (p.totalMonths >= 1) return t('duration_months_weeks', p.totalMonths, Math.floor(p.days / 7));
  if (days >= 7) return t('duration_weeks', Math.floor(days / 7));
  return tp('duration_days', days);
}

/** 80 → "80", 80.25 → "80.3" (one decimal, dot separator). */
export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Accepts "80,5" as well as "80.5". Empty or invalid → null. */
export function toDoubleLenient(s: string): number | null {
  const v = s.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(v)) return null;
  return Number(v);
}

/** Whole numbers only ("12.5" → null), like Kotlin's toIntOrNull. */
export function toIntLenient(s: string): number | null {
  const v = s.trim();
  return /^[+-]?\d+$/.test(v) ? Number(v) : null;
}

/** "+2", "−1", "0" with a real minus sign. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export const statusLabel = (s: ClientStatus) => t(s === 'ACTIVE' ? 'status_active' : 'status_inactive');

const mealKeys: Record<MealType, TextKey> = {
  BREAKFAST: 'meal_breakfast',
  MORNING_SNACK: 'meal_morning_snack',
  LUNCH: 'meal_lunch',
  AFTERNOON_SNACK: 'meal_afternoon_snack',
  DINNER: 'meal_dinner',
  EVENING_SNACK: 'meal_evening_snack',
};
export const mealLabel = (m: MealType) => t(mealKeys[m]);
export const mealEmoji: Record<MealType, string> = {
  BREAKFAST: '🍳',
  MORNING_SNACK: '🍎',
  LUNCH: '🥗',
  AFTERNOON_SNACK: '🥜',
  DINNER: '🍽️',
  EVENING_SNACK: '🥛',
};

export function taskTitle(task: ClientTask): string {
  switch (task.kind) {
    case 'NUTRITION_ASSIGNMENT': return t('task_assignment', task.number);
    case 'PERSONALISED_PLAN': return t('task_plan');
    case 'FIT_CLUB': return t('task_fit_club');
    case 'SHAKE_PARTY': return t('task_shake_party');
    case 'THE_OPEN': return t('task_the_open');
  }
}
export const taskEmoji: Record<TaskKind, string> = {
  NUTRITION_ASSIGNMENT: '📘',
  PERSONALISED_PLAN: '🥗',
  FIT_CLUB: '🏋️',
  SHAKE_PARTY: '🥤',
  THE_OPEN: '🚪',
};
export const taskTag = (k: TaskKind) =>
  t(k === 'NUTRITION_ASSIGNMENT' ? 'tag_assignment' : k === 'PERSONALISED_PLAN' ? 'tag_plan' : 'tag_event');
