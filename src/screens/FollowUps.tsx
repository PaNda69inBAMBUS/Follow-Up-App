import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repo } from '../data';
import { addDays, today } from '../data/dates';
import type { FollowUp, FollowUpWithClient } from '../data/types';
import { t, type TextKey } from '../i18n';
import { EmptyState, FollowUpItem, ScreenHeader, SectionHeader, SegmentedPicker, useOfferScheduleNext } from '../ui/components';
import { fmt } from '../ui/format';
import { navigate, paths } from '../ui/router';

type Tab = 'upcoming' | 'completed';
let lastTab: Tab = 'upcoming';

export function FollowUpsScreen() {
  const data = useLiveQuery(async () => ({
    pending: await repo.pendingFollowUps(),
    completed: await repo.recentCompletedFollowUps(),
  }));
  const [tab, setTabState] = useState<Tab>(lastTab);
  const setTab = (v: Tab) => setTabState((lastTab = v));
  const offerNext = useOfferScheduleNext();

  if (!data) return null;
  const { pending, completed } = data;
  const now = today();
  const weekEnd = addDays(now, 7);
  const overdue = pending.filter((p) => p.followUp.date < now);
  const open = (f: FollowUp) => navigate(paths.followUp(f.clientId, f.id!));
  const markDone = async (f: FollowUp) => {
    const next = await repo.completeFollowUp(f);
    offerNext(next, () => repo.scheduleFollowUp(f.clientId, next));
  };

  const group = (title: TextKey, list: FollowUpWithClient[]) =>
    list.length > 0 && (
      <section key={title}>
        <SectionHeader text={t(title)} count={list.length} />
        {list.map(({ followUp: f, clientName }) => (
          <FollowUpItem
            key={f.id}
            date={f.date}
            title={clientName}
            details={f.notes}
            completed={false}
            onClick={() => open(f)}
            onMarkDone={() => markDone(f)}
          />
        ))}
      </section>
    );

  return (
    <div className="screen">
      <ScreenHeader
        title={t('nav_followups')}
        subtitle={overdue.length > 0 ? t('followups_subtitle_overdue', pending.length, overdue.length) : t('followups_subtitle', pending.length)}
      />
      <div className="screen__tools">
        <SegmentedPicker
          options={['upcoming', 'completed'] as Tab[]}
          selected={tab}
          onSelect={setTab}
          label={(x) => (x === 'upcoming' ? t('tab_upcoming', pending.length) : t('completed'))}
        />
      </div>
      <div className="screen__content screen__content--tabs">
        {tab === 'upcoming' ? (
          <>
            {pending.length === 0 && <EmptyState message={t('empty_scheduled')} />}
            {group('section_overdue', overdue)}
            {group('day_today', pending.filter((p) => p.followUp.date === now))}
            {group('section_next_7', pending.filter((p) => p.followUp.date > now && p.followUp.date <= weekEnd))}
            {group('section_later', pending.filter((p) => p.followUp.date > weekEnd))}
          </>
        ) : completed.length === 0 ? (
          <EmptyState message={t('empty_completed')} icon="checkCircle" />
        ) : (
          <>
            <SectionHeader text={t('recent_check_ins')} count={completed.length} />
            {completed.map(({ followUp: f, clientName }) => (
              <FollowUpItem
                key={f.id}
                date={f.date}
                title={clientName + (f.weight != null ? ` · ${fmt(f.weight)} kg` : '')}
                details={f.notes}
                completed
                onClick={() => open(f)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
