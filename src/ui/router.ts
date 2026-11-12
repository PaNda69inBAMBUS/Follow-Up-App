/*
 * Tiny hash router: the page lives after "#", e.g. #/client/3/edit.
 * Hash URLs work offline and on any static host, and the phone's back gesture / browser
 * back button walk through the history like on Android.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'clients' }
  | { name: 'followups' }
  | { name: 'client'; clientId: number }
  | { name: 'clientEdit'; clientId: number | null }
  | { name: 'followUpEdit'; clientId: number; followUpId: number | null }
  | { name: 'planEdit'; clientId: number; planId: number | null }
  | { name: 'program'; clientId: number }
  | { name: 'prospects' }
  | { name: 'prospectEdit'; prospectId: number | null }
  | { name: 'settings' };

/** The pages shown with the bottom navigation bar. */
export const TAB_ROUTES = ['home', 'clients', 'prospects', 'followups'] as const;
export type TabName = (typeof TAB_ROUTES)[number];

export const paths = {
  home: () => '/',
  clients: () => '/clients',
  followups: () => '/followups',
  client: (id: number) => `/client/${id}`,
  newClient: () => '/client/new',
  editClient: (id: number) => `/client/${id}/edit`,
  newFollowUp: (clientId: number) => `/client/${clientId}/followup/new`,
  followUp: (clientId: number, id: number) => `/client/${clientId}/followup/${id}`,
  newPlan: (clientId: number) => `/client/${clientId}/plan/new`,
  plan: (clientId: number, id: number) => `/client/${clientId}/plan/${id}`,
  program: (clientId: number) => `/client/${clientId}/program`,
  prospects: () => '/prospects',
  newProspect: () => '/prospect/new',
  prospect: (id: number) => `/prospect/${id}`,
  settings: () => '/settings',
};

export function parse(path: string): Route {
  const p = path.replace(/^#/, '').split('/').filter(Boolean);
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);
  if (p[0] === 'clients') return { name: 'clients' };
  if (p[0] === 'followups') return { name: 'followups' };
  if (p[0] === 'prospects') return { name: 'prospects' };
  if (p[0] === 'settings') return { name: 'settings' };
  if (p[0] === 'prospect') return { name: 'prospectEdit', prospectId: num(p[1]) };
  if (p[0] === 'client') {
    if (p[1] === 'new') return { name: 'clientEdit', clientId: null };
    const id = num(p[1]);
    if (id != null) {
      if (p[2] === undefined) return { name: 'client', clientId: id };
      if (p[2] === 'edit') return { name: 'clientEdit', clientId: id };
      if (p[2] === 'program') return { name: 'program', clientId: id };
      if (p[2] === 'followup') return { name: 'followUpEdit', clientId: id, followUpId: num(p[3]) };
      if (p[2] === 'plan') return { name: 'planEdit', clientId: id, planId: num(p[3]) };
    }
  }
  return { name: 'home' };
}

const currentPath = () => window.location.hash.slice(1) || '/';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The current route; the component re-renders when it changes. */
export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, currentPath);
  return parse(path);
}

/** Opens a page (adds a history entry, so "back" returns here). */
export function navigate(path: string) {
  // Marked, so goBack knows the previous entry is a page of this app.
  window.history.pushState({ fromApp: true }, '', `#${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Swaps the current page without adding history (e.g. after saving a new client). */
export function replace(path: string) {
  window.history.replaceState(window.history.state, '', `#${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Goes back, or to [fallback] when the app was opened directly on this page. */
export function goBack(fallback = '/') {
  if (window.history.state?.fromApp) window.history.back();
  else replace(fallback);
}
