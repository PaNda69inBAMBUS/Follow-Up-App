/*
 * Per-device preferences (like Android's AppSettings / SharedPreferences), kept in localStorage.
 * These are conveniences only — losing them never loses client data.
 */
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';
export type VisualStyle = 'GLASS' | 'SOLID';
export type Language = 'en' | 'ro';

export interface Settings {
  theme: ThemeMode;
  /** Solid = opaque cards; Glass = airy, see-through cards over a soft color background. */
  style: VisualStyle;
  /** 0 = frosted (less see-through) … 1 = very transparent. */
  glassLevel: number;
  language: Language;
  /** Follow-up program: show completed tasks at the top. */
  tasksDoneFirst: boolean;
  /** When the last backup was exported ('YYYY-MM-DD'), or null. */
  lastBackup: string | null;
  /** The "add to home screen" tip on the dashboard was closed. */
  installTipDismissed: boolean;
}

/** Romanian phones start in Romanian, everyone else in English (like the Android app). */
const deviceLanguage = (): Language => (navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en');

const defaults = (): Settings => ({
  theme: 'SYSTEM',
  style: 'GLASS',
  glassLevel: 0.5,
  language: deviceLanguage(),
  tasksDoneFirst: true,
  lastBackup: null,
  installTipDismissed: false,
});

const KEY = 'settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults();
  }
}

let current = load();

export const getSettings = () => current;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode): keep the value for this session only.
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(subscribeSettings, () => current[key]);
}

// ---------------------------------------------------------------------
// Appearance: applies theme + style to the page (CSS reads data-theme / data-style)
// ---------------------------------------------------------------------

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** Glass colors depend on the transparency slider: a(frosted, clear) — same numbers as Android's AppStyle. */
function glassVars(dark: boolean, t: number): Record<string, string> {
  const a = (frosted: number, clear: number) => +(frosted + (clear - frosted) * t).toFixed(3);
  const white = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;
  return dark
    ? {
        '--card': white(a(0.13, 0.05)),
        '--card-border': white(a(0.16, 0.1)),
        '--field': white(a(0.12, 0.07)),
        '--track': white(a(0.1, 0.06)),
        '--nav': `rgba(30, 31, 58, ${a(0.7, 0.45)})`,
      }
    : {
        '--card': white(a(0.8, 0.4)),
        '--card-border': white(a(0.95, 0.75)),
        '--field': white(a(0.82, 0.5)),
        '--track': white(a(0.6, 0.35)),
        '--nav': white(a(0.7, 0.45)),
      };
}

const GLASS_VARS = ['--card', '--card-border', '--field', '--track', '--nav'];

export function applyAppearance() {
  const root = document.documentElement;
  const dark = current.theme === 'DARK' || (current.theme === 'SYSTEM' && !!darkQuery?.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.style = current.style === 'SOLID' ? 'solid' : 'glass';
  root.lang = current.language;
  if (current.style === 'GLASS') {
    for (const [k, v] of Object.entries(glassVars(dark, current.glassLevel))) root.style.setProperty(k, v);
  } else {
    GLASS_VARS.forEach((k) => root.style.removeProperty(k));
  }
  // Status bar / browser chrome color.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0f1a' : '#f4f5fa');
}

/** Keeps the page in sync with the settings and the phone's light/dark mode. Call once at start. */
export function startAppearance() {
  applyAppearance();
  subscribeSettings(applyAppearance);
  darkQuery?.addEventListener('change', applyAppearance);
}
