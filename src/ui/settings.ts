/*
 * Small per-device preferences (like Android's SharedPreferences), kept in localStorage.
 * These are conveniences only — losing them never loses client data.
 */
import { useSyncExternalStore } from 'react';

interface Settings {
  /** Follow-up program: show completed tasks at the top. */
  tasksDoneFirst: boolean;
}

const defaults: Settings = { tasksDoneFirst: true };
const KEY = 'settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

let current = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode): keep the value for this session only.
  }
  listeners.forEach((l) => l());
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current[key],
  );
}
