import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repo } from '../data';
import type { ClientStatus } from '../data/types';
import { t } from '../i18n';
import { ClientItem, EmptyState, ScreenHeader, SegmentedPicker } from '../ui/components';
import { statusLabel } from '../ui/format';
import { Icon } from '../ui/icons';
import { navigate, paths } from '../ui/router';

const FILTERS: (ClientStatus | null)[] = [null, 'ACTIVE', 'INACTIVE'];

export function ClientListScreen() {
  const all = useLiveQuery(() => repo.clients());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientStatus | null>(null);

  if (!all) return null;
  const term = query.trim().toLowerCase();
  const visible = all.filter(
    (c) =>
      (filter == null || c.status === filter) &&
      (!term || c.name.toLowerCase().includes(term) || c.goal.toLowerCase().includes(term)),
  );
  const count = (s: ClientStatus) => all.filter((c) => c.status === s).length;

  return (
    <div className="screen">
      <ScreenHeader title={t('nav_clients')} subtitle={t('clients_subtitle', count('ACTIVE'), all.length)} />
      <div className="screen__tools">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_hint')}
            autoCapitalize="words"
            aria-label={t('search_hint')}
          />
          {query && (
            <button type="button" className="search__clear" onClick={() => setQuery('')} aria-label={t('clear_search')}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <SegmentedPicker
          options={FILTERS}
          selected={filter}
          onSelect={setFilter}
          label={(s) => (s == null ? t('filter_all', all.length) : t('filter_status', statusLabel(s), count(s)))}
        />
      </div>
      <div className="screen__content screen__content--tabs">
        {visible.length === 0 ? (
          <EmptyState message={t(all.length === 0 ? 'no_clients_add' : 'no_clients_match')} icon="person" />
        ) : (
          visible.map((c) => <ClientItem key={c.id} client={c} onClick={() => navigate(paths.client(c.id!))} />)
        )}
      </div>
    </div>
  );
}
