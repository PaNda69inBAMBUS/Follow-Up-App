import { useEffect, type ReactNode } from 'react';
import { requestPersistentStorage } from './data';
import { t, type TextKey } from './i18n';
import { ClientDetailScreen } from './screens/ClientDetail';
import { ClientEditScreen } from './screens/ClientEdit';
import { ClientListScreen } from './screens/ClientList';
import { FollowUpEditScreen } from './screens/FollowUpEdit';
import { DashboardScreen } from './screens/Dashboard';
import { FollowUpsScreen } from './screens/FollowUps';
import { NutritionEditScreen } from './screens/NutritionEdit';
import { ProgramScreen } from './screens/Program';
import { ProspectEditScreen, ProspectListScreen } from './screens/Prospects';
import { SettingsScreen } from './screens/Settings';
import { SnackbarProvider } from './ui/components';
import { Icon, type IconName } from './ui/icons';
import { navigate, paths, replace, useRoute, type Route, type TabName } from './ui/router';
import { useSetting } from './ui/settings';

const TABS: { name: TabName; label: TextKey; icon: IconName; path: string }[] = [
  { name: 'home', label: 'nav_home', icon: 'home', path: paths.home() },
  { name: 'clients', label: 'nav_clients', icon: 'person', path: paths.clients() },
  { name: 'prospects', label: 'nav_prospects', icon: 'face', path: paths.prospects() },
  { name: 'followups', label: 'nav_followups', icon: 'calendar', path: paths.followups() },
];

function screenFor(route: Route): ReactNode {
  switch (route.name) {
    case 'home': return <DashboardScreen />;
    case 'clients': return <ClientListScreen />;
    case 'prospects': return <ProspectListScreen />;
    case 'prospectEdit': return <ProspectEditScreen key={route.prospectId ?? 'new'} prospectId={route.prospectId} />;
    case 'settings': return <SettingsScreen />;
    case 'followups': return <FollowUpsScreen />;
    case 'client': return <ClientDetailScreen key={route.clientId} clientId={route.clientId} />;
    case 'clientEdit': return <ClientEditScreen key={route.clientId ?? 'new'} clientId={route.clientId} />;
    case 'followUpEdit': return <FollowUpEditScreen key={`${route.clientId}/${route.followUpId}`} {...route} />;
    case 'planEdit': return <NutritionEditScreen key={`${route.clientId}/${route.planId}`} {...route} />;
    case 'program': return <ProgramScreen key={route.clientId} clientId={route.clientId} />;
  }
}

export function App() {
  const route = useRoute();
  const isTab = TABS.some((tab) => tab.name === route.name);
  // Changing the language re-draws every screen with the new texts.
  const language = useSetting('language');

  useEffect(() => {
    requestPersistentStorage();
  }, []);

  // Each page starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, 'clientId' in route ? route.clientId : null]);

  return (
    <SnackbarProvider key={language}>
      <div className={`app${isTab ? ' app--tabs' : ''}`}>{screenFor(route)}</div>
      {isTab && (
        <nav className="nav">
          <div className="nav__bar">
            {TABS.map((tab) => {
              const selected = tab.name === route.name;
              return (
                <button
                  key={tab.name}
                  type="button"
                  className={`nav__item${selected ? ' is-selected' : ''}`}
                  aria-current={selected ? 'page' : undefined}
                  aria-label={t(tab.label)}
                  // Tabs swap in place, so "back" from a tab doesn't step through other tabs.
                  onClick={() => (selected ? window.scrollTo({ top: 0, behavior: 'smooth' }) : replace(tab.path))}
                >
                  <Icon name={tab.icon} />
                  <span className="nav__label">{t(tab.label)}</span>
                </button>
              );
            })}
          </div>
          {/* "+" adds a prospect on the Prospects page, a client everywhere else. */}
          <button
            type="button"
            className="nav__add"
            aria-label={t(route.name === 'prospects' ? 'add_prospect' : 'add_client')}
            onClick={() => navigate(route.name === 'prospects' ? paths.newProspect() : paths.newClient())}
          >
            <Icon name="add" size={30} />
          </button>
        </nav>
      )}
    </SnackbarProvider>
  );
}
