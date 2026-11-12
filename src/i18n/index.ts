import { en, type Dictionary, type Plural, type TextKey } from './en';

/** The app language; Romanian is added in step 4. */
const dictionaries: Record<string, Dictionary> = { en };
let lang = 'en';
export const locale = () => (lang === 'ro' ? 'ro-RO' : 'en-GB');

/** Fills %s / %d / %1$s placeholders in order (or by number). "%%" becomes "%". */
export function fill(template: string, args: unknown[]): string {
  let next = 0;
  return template.replace(/%(?:(\d+)\$)?([sd%])/g, (_, pos: string | undefined, type: string) => {
    if (type === '%') return '%';
    const value = pos ? args[Number(pos) - 1] : args[next++];
    return String(value ?? '');
  });
}

function lookup(key: TextKey): string | Plural {
  return dictionaries[lang]?.[key] ?? en[key];
}

/** Translated text: t('client_since', date, duration). */
export function t(key: TextKey, ...args: unknown[]): string {
  const value = lookup(key);
  return fill(typeof value === 'string' ? value : value.other, args);
}

/** Plural text chosen by [count]; [count] is also the first placeholder unless [args] are given. */
export function tp(key: TextKey, count: number, ...args: unknown[]): string {
  const value = lookup(key);
  if (typeof value === 'string') return fill(value, args.length ? args : [count]);
  const rule = new Intl.PluralRules(locale()).select(count) as keyof Plural;
  return fill(value[rule] ?? value.other, args.length ? args : [count]);
}

export type { TextKey };
