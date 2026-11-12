import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repo } from '../data';
import { DEFAULT_TASK_COUNT, type Client, type Meal, type NutritionPlan } from '../data/types';
import { t, tp } from '../i18n';
import {
  AddButton,
  Card,
  CircleIconButton,
  ConfirmDialog,
  EmptyState,
  FollowUpItem,
  InfoRow,
  ProgressBar,
  ScreenHeader,
  SectionHeader,
  SegmentedPicker,
  StatusPill,
  WeightResultChip,
  useOfferScheduleNext,
} from '../ui/components';
import { durationText, fmt, mealEmoji, mealLabel, pretty } from '../ui/format';
import { Icon } from '../ui/icons';
import { EditableAvatar, PhotoOptionsSheet, usePhotoPicker } from '../ui/PhotoPicker';
import { goBack, navigate, paths, replace } from '../ui/router';
import { BodyCompositionSheet } from './BodyComposition';

type Tab = 'followups' | 'nutrition';

/** Remembered while the app is open, so coming back from a plan keeps the Nutrition tab. */
const lastTab = new Map<number, Tab>();

export function ClientDetailScreen({ clientId }: { clientId: number }) {
  const data = useLiveQuery(async () => {
    const client = await repo.getClient(clientId);
    if (!client) return { client: null };
    const [followUps, plans, tasks, meals] = await Promise.all([
      repo.followUpsFor(clientId),
      repo.plansFor(clientId),
      repo.tasksFor(clientId),
      repo.mealsForClient(clientId),
    ]);
    return { client, followUps, plans, tasks, meals };
  }, [clientId]);

  const [tab, setTabState] = useState<Tab>(lastTab.get(clientId) ?? 'followups');
  const setTab = (v: Tab) => {
    lastTab.set(clientId, v);
    setTabState(v);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const picker = usePhotoPicker((photo) => repo.setClientPhoto(clientId, photo));
  const offerNext = useOfferScheduleNext();

  if (!data) return null;
  const { client } = data;
  if (!client) {
    // Deleted (or a stale link): there's nothing to show.
    return (
      <div className="screen">
        <ScreenHeader title="" onBack={() => goBack(paths.clients())} />
      </div>
    );
  }
  const { followUps, plans, tasks, meals } = data;
  const pending = followUps.filter((f) => !f.completed).sort((a, b) => a.date.localeCompare(b.date));
  const history = followUps.filter((f) => f.completed); // newest first
  const latestWeight = history.find((f) => f.weight != null)?.weight ?? null;
  const mealsByPlan = groupMeals(meals);

  async function deleteClient() {
    setConfirmDelete(false);
    await repo.deleteClient(clientId);
    replace(paths.clients());
  }

  return (
    <div className="screen">
      <ScreenHeader title="" onBack={() => goBack(paths.clients())}>
        <CircleIconButton icon="edit" label={t('edit_client')} onClick={() => navigate(paths.editClient(clientId))} />
        <CircleIconButton icon="delete" label={t('delete_client')} tone="danger" onClick={() => setConfirmDelete(true)} />
      </ScreenHeader>

      <div className="screen__content screen__content--fab">
        <div className="profile-hero">
          <EditableAvatar
            name={client.name}
            photoId={client.photoId}
            hasPhoto={client.photoId != null}
            busy={picker.busy}
            size={104}
            onClick={() => setShowPhotoOptions(true)}
          />
          <h1 className="profile-hero__name">{client.name}</h1>
          <div className="row row--center">
            <StatusPill status={client.status} />
            <span className="muted text-md">{t('client_for', durationText(client.startDate))}</span>
          </div>
        </div>

        <div className="mini-stats">
          <MiniStat label={t('stat_check_ins')} value={String(history.length)} />
          <MiniStat
            label={t('stat_weight')}
            value={weightNow(client.startWeight, latestWeight)}
            footnote={weightChange(client.startWeight, latestWeight)}
            onClick={() => setShowBody(true)}
          />
          <MiniStat
            label={t('stat_follow_up')}
            value={t('interval_days_short', client.followUpIntervalDays)}
            footnote={t('interval')}
          />
        </div>

        <DetailsCard client={client} />

        <Card onClick={() => navigate(paths.program(clientId))} className="mt-10">
          <div className="row">
            <div className="emoji-tile emoji-tile--tertiary">✅</div>
            <div className="grow min0">
              <div className="title-md">{t('follow_program')}</div>
              <div className="text-sm muted ellipsis">{t('program_open_hint')}</div>
            </div>
            <span className="title-md tertiary">
              {tasks.filter((x) => x.done).length}/{tasks.length || DEFAULT_TASK_COUNT}
            </span>
            <Icon name="chevronRight" className="muted" />
          </div>
          <div className="mt-12">
            <ProgressBar progress={tasks.length ? tasks.filter((x) => x.done).length / tasks.length : 0} />
          </div>
        </Card>

        <SegmentedPicker
          className="mt-20"
          options={['followups', 'nutrition'] as Tab[]}
          selected={tab}
          onSelect={setTab}
          label={(x) => (x === 'followups' ? t('tab_follow_ups', followUps.length) : t('tab_nutrition', plans.length))}
        />

        {tab === 'followups' ? (
          <>
            {followUps.length === 0 && <EmptyState message={t('empty_follow_ups')} />}
            {pending.length > 0 && (
              <>
                <SectionHeader text={t('section_scheduled')} count={pending.length} />
                {pending.map((f) => (
                  <FollowUpItem
                    key={f.id}
                    date={f.date}
                    title={t('follow_up')}
                    details={f.notes}
                    completed={false}
                    onClick={() => navigate(paths.followUp(clientId, f.id!))}
                    onMarkDone={async () => {
                      const next = await repo.completeFollowUp(f);
                      offerNext(next, () => repo.scheduleFollowUp(clientId, next));
                    }}
                  />
                ))}
              </>
            )}
            {history.length > 0 && (
              <>
                <SectionHeader text={t('section_history')} count={history.length} />
                {history.map((f) => (
                  <FollowUpItem
                    key={f.id}
                    date={f.date}
                    title={f.weight != null ? t('check_in_weight', fmt(f.weight)) : t('check_in')}
                    details={f.notes}
                    completed
                    onClick={() => navigate(paths.followUp(clientId, f.id!))}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <div className="mt-14 mb-6">
              <AddButton text={t('new_nutrition_plan')} onClick={() => navigate(paths.newPlan(clientId))} />
            </div>
            {plans.length === 0 && <EmptyState message={t('empty_plans')} icon="list" />}
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} meals={mealsByPlan.get(p.id!) ?? []} onClick={() => navigate(paths.plan(clientId, p.id!))} />
            ))}
          </>
        )}
      </div>

      <button
        type="button"
        className="fab"
        onClick={() => navigate(tab === 'followups' ? paths.newFollowUp(clientId) : paths.newPlan(clientId))}
      >
        <Icon name="add" />
        {t(tab === 'followups' ? 'fab_follow_up' : 'nutrition_plan')}
      </button>

      {picker.inputs}
      {showPhotoOptions && (
        <PhotoOptionsSheet
          hasPhoto={client.photoId != null}
          picker={picker}
          onRemove={() => repo.setClientPhoto(clientId, null)}
          onDismiss={() => setShowPhotoOptions(false)}
        />
      )}
      {showBody && <BodyCompositionSheet client={client} followUps={followUps} onDismiss={() => setShowBody(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title={t('delete_client_title')}
          text={t('delete_client_text', client.name)}
          onConfirm={deleteClient}
          onDismiss={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function groupMeals(meals: Meal[]) {
  const map = new Map<number, Meal[]>();
  for (const m of meals) map.set(m.planId, [...(map.get(m.planId) ?? []), m]);
  return map;
}

function weightNow(start: number | null, latest: number | null): string {
  const w = latest ?? start;
  return w != null ? t('weight_value', fmt(w)) : '—';
}

function weightChange(start: number | null, latest: number | null): string | undefined {
  if (start == null || latest == null) return start != null ? t('weight_at_start') : undefined;
  const diff = latest - start;
  if (diff > 0) return t('weight_value', `+${fmt(diff)}`);
  if (diff < 0) return t('weight_value', `−${fmt(Math.abs(diff))}`);
  return t('weight_no_change');
}

function MiniStat({ label, value, footnote, onClick }: { label: string; value: string; footnote?: string; onClick?: () => void }) {
  return (
    <Card onClick={onClick} padding={14} className={onClick ? 'mini-stat mini-stat--tap' : 'mini-stat'}>
      <div className="row row--tight">
        <span className="mini-stat__label grow ellipsis">{label}</span>
        {onClick && <Icon name="chevronRight" size={18} className="primary" />}
      </div>
      <div className="title-lg ellipsis">{value}</div>
      <div className="text-xs muted ellipsis">{footnote ?? ' '}</div>
    </Card>
  );
}

function DetailsCard({ client }: { client: Client }) {
  const phone = client.phone.trim();
  const email = client.email.trim();
  return (
    <Card className="mt-10" padding={18}>
      <div className="stack-14">
        <InfoRow icon="star" label={t('info_started')} value={pretty(client.startDate)} />
        {client.goal.trim() && <InfoRow icon="info" label={t('info_goal')} value={client.goal} />}
        {client.notes.trim() && <InfoRow icon="edit" label={t('info_notes')} value={client.notes} />}
        {(phone || email) && (
          <div className="row row--gap10">
            {phone && (
              <a className="contact-btn" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                <Icon name="phone" size={18} />
                {t('call')}
              </a>
            )}
            {email && (
              <a className="contact-btn" href={`mailto:${email}`}>
                <Icon name="email" size={18} />
                {t('email')}
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PlanCard({ plan, meals, onClick }: { plan: NutritionPlan; meals: Meal[]; onClick: () => void }) {
  const macros = [
    plan.calories != null && { label: t('unit_kcal'), value: String(plan.calories), tone: 'secondary' },
    plan.proteinG != null && { label: t('macro_protein'), value: `${plan.proteinG}g`, tone: 'primary' },
    plan.carbsG != null && { label: t('macro_carbs'), value: `${plan.carbsG}g`, tone: 'tertiary' },
    plan.fatG != null && { label: t('macro_fat'), value: `${plan.fatG}g`, tone: 'neutral' },
  ].filter(Boolean) as { label: string; value: string; tone: string }[];

  return (
    <Card onClick={onClick} className="list-item">
      <div className="row">
        <div className="grow min0">
          <div className="title-md ellipsis">{plan.title}</div>
          <div className="text-sm muted">
            {t('plan_from', pretty(plan.startDate))}
            {meals.length > 0 && ` · ${tp('meals_count', meals.length)}`}
          </div>
        </div>
        {plan.active && <span className="pill pill--primary">{t('plan_current')}</span>}
      </div>
      {macros.length > 0 && (
        <div className="macro-row mt-12">
          {macros.map((m) => (
            <div key={m.label} className={`macro-box macro-box--${m.tone}`}>
              <div className="title-sm">{m.value}</div>
              <div className="text-xs ellipsis">{m.label}</div>
            </div>
          ))}
        </div>
      )}
      {meals.length > 0 && (
        <div className="stack-6 mt-12">
          {meals.map((m) => (
            <div key={m.id} className="meal-line">
              <span className="meal-line__emoji">{mealEmoji[m.type]}</span>
              <div className="grow min0">
                <div className="row row--tight">
                  <span className="label-lg">{mealLabel(m.type)}</span>
                  {m.time.trim() && <span className="label-md muted">{m.time}</span>}
                  {m.calories != null && <span className="label-md muted push-right">{`${m.calories} ${t('unit_kcal')}`}</span>}
                </div>
                {m.foods.trim() && <div className="text-sm muted clamp-2">{m.foods}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {(plan.startWeight != null || plan.endWeight != null) && (
        <div className="row mt-12">
          <span>⚖️</span>
          <span className="title-sm grow">
            {[plan.startWeight, plan.endWeight].map((w) => (w != null ? fmt(w) : '?')).join(' → ')} {t('unit_kg')}
          </span>
          {plan.startWeight != null && plan.endWeight != null && <WeightResultChip change={plan.endWeight - plan.startWeight} />}
        </div>
      )}
      {plan.details.trim() && <div className="text-sm muted clamp-2 mt-10">{plan.details}</div>}
    </Card>
  );
}
