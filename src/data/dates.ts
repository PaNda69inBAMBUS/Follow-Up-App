/**
 * Calendar dates are stored as 'YYYY-MM-DD' strings (same as Java's LocalDate.toString()).
 * They sort correctly as plain strings, so `a < b` compares dates.
 */
export type LocalDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in the phone's own time zone. */
export function today(now: Date = new Date()): LocalDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local date-time without milliseconds, like Kotlin's LocalDateTime.withNano(0): 2026-11-10T09:30:00 */
export function nowLocalDateTime(now: Date = new Date()): string {
  return `${today(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** Returns the date if [s] is a real calendar date in 'YYYY-MM-DD' form, otherwise null. */
export function parseDate(s: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function toUtc(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): LocalDate {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const dt = toUtc(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}
