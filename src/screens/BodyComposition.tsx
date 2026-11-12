import type { Client, FollowUp } from '../data/types';
import { t } from '../i18n';
import { Card, DateTile, EmptyState, SectionHeader, Sheet } from '../ui/components';
import { fmt, pretty } from '../ui/format';

/** Which direction of change is good for a metric (drives the color of the change pill). */
type Good = 'down' | 'up' | 'none';

/**
 * Starting point vs latest value of one metric. [start] is the value from the client profile;
 * [measured] are check-in values, oldest first.
 */
function baseline(start: number | null, measured: number[]) {
  const first = start ?? measured[0] ?? null;
  const latest = measured.at(-1) ?? start;
  // Only meaningful when there are two different data points to compare.
  const comparable = measured.length >= 2 || (start != null && measured.length > 0);
  return { fromProfile: start != null, first, latest, change: first != null && latest != null && comparable ? latest - first : null };
}

const kg = (n: number) => t('weight_value', fmt(n));
const pct = (n: number) => t('percent_value', fmt(n));

export function BodyCompositionSheet({ client, followUps, onDismiss }: { client: Client; followUps: FollowUp[]; onDismiss: () => void }) {
  // Completed check-ins with at least one measurement, oldest first.
  const measured = followUps
    .filter((f) => f.completed && (f.weight != null || f.bodyFat != null || f.muscleMass != null))
    .sort((a, b) => a.date.localeCompare(b.date));
  const values = (key: 'weight' | 'bodyFat' | 'muscleMass') => measured.map((f) => f[key]).filter((v): v is number => v != null);

  return (
    <Sheet onDismiss={onDismiss} label={t('body_composition')}>
      <div className="sheet__heading">
        <h2 className="title-xl">{t('body_composition')}</h2>
        <div className="muted text-md">{client.name}</div>
      </div>
      <div className="stack-10">
        <MetricCard emoji="⚖️" label={t('stat_weight')} b={baseline(client.startWeight, values('weight'))} format={kg} good="none" />
        <MetricCard emoji="🔥" label={t('body_fat')} b={baseline(client.startBodyFat, values('bodyFat'))} format={pct} good="down" />
        <MetricCard emoji="💪" label={t('muscle_mass')} b={baseline(client.startMuscleMass, values('muscleMass'))} format={kg} good="up" />
      </div>
      <SectionHeader text={t('measurements')} count={measured.length} />
      {measured.length === 0 && <EmptyState message={t('no_measurements')} />}
      <div className="stack-10">
        {[...measured].reverse().map((f) => (
          <Card key={f.id} padding={12}>
            <div className="row">
              <DateTile date={f.date} completed />
              <div className="grow min0">
                <div className="title-sm">{f.weight != null ? kg(f.weight) : pretty(f.date)}</div>
                <div className="text-sm muted ellipsis">
                  {[
                    f.bodyFat != null && t('fat_short', pct(f.bodyFat)),
                    f.muscleMass != null && t('muscle_short', kg(f.muscleMass)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Sheet>
  );
}

function MetricCard({
  emoji,
  label,
  b,
  format,
  good,
}: {
  emoji: string;
  label: string;
  b: ReturnType<typeof baseline>;
  format: (n: number) => string;
  good: Good;
}) {
  const change = b.change;
  return (
    <Card>
      <div className="row">
        <div className="emoji-tile emoji-tile--lg">{emoji}</div>
        <div className="grow min0">
          <div className="label-lg muted">{label}</div>
          {b.latest != null ? <div className="title-xl">{format(b.latest)}</div> : <div className="muted">{t('body_comp_no_data')}</div>}
          {b.first != null && change != null && (
            <div className="text-sm muted">{t(b.fromProfile ? 'body_comp_start' : 'body_comp_first', format(b.first))}</div>
          )}
        </div>
        {change != null && <ChangePill change={change} format={format} good={good} />}
      </div>
    </Card>
  );
}

function ChangePill({ change, format, good }: { change: number; format: (n: number) => string; good: Good }) {
  const improving = good === 'down' ? change < 0 : good === 'up' ? change > 0 : null;
  const tone = change === 0 || improving == null ? 'neutral' : improving ? 'good' : 'bad';
  const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  return <span className={`chip chip--${tone}`}>{`${arrow} ${format(Math.abs(change))}`}</span>;
}
