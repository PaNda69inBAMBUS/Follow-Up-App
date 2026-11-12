import { useEffect, useState } from 'react';
import { repo } from '../data';
import { addDays, today, type LocalDate } from '../data/dates';
import { DEFAULT_INTERVAL_DAYS, type FollowUp } from '../data/types';
import { t } from '../i18n';
import {
  CheckboxRow,
  CircleIconButton,
  ConfirmDialog,
  DateField,
  HeaderTextAction,
  PrimaryButton,
  ScreenHeader,
  SwitchRow,
  TextField,
} from '../ui/components';
import { fmt, pretty, toDoubleLenient } from '../ui/format';
import { goBack, paths } from '../ui/router';

const num = (n: number | null) => (n != null ? fmt(n) : '');

export function FollowUpEditScreen({ clientId, followUpId }: { clientId: number; followUpId: number | null }) {
  const isNew = followUpId == null;
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<FollowUp | null>(null);
  const [clientName, setClientName] = useState('');
  const [intervalDays, setIntervalDays] = useState(DEFAULT_INTERVAL_DAYS);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [date, setDate] = useState<LocalDate>(today());
  const [completed, setCompleted] = useState(false);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleNext, setScheduleNext] = useState(true);

  useEffect(() => {
    (async () => {
      const client = await repo.getClient(clientId);
      if (!client) return goBack(paths.clients()); // stale link to a deleted client
      setClientName(client.name);
      setIntervalDays(client.followUpIntervalDays);
      if (followUpId != null) {
        const f = await repo.getFollowUp(followUpId);
        if (f) {
          setOriginal(f);
          setDate(f.date);
          setCompleted(f.completed);
          setWeight(num(f.weight));
          setBodyFat(num(f.bodyFat));
          setMuscleMass(num(f.muscleMass));
          setNotes(f.notes);
        }
      }
      setLoaded(true);
    })();
  }, [clientId, followUpId]);

  const back = () => goBack(paths.client(clientId));
  // Offer to schedule the next follow-up only when this one is being completed now.
  const showScheduleNext = completed && original?.completed !== true;
  const nextDate = addDays(date > today() ? date : today(), intervalDays);
  const weightValid = !weight.trim() || toDoubleLenient(weight) != null;
  const fat = toDoubleLenient(bodyFat);
  const bodyFatValid = !bodyFat.trim() || (fat != null && fat >= 0 && fat <= 100);
  const muscleValid = !muscleMass.trim() || toDoubleLenient(muscleMass) != null;
  const canSave = weightValid && bodyFatValid && muscleValid && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    await repo.saveFollowUp(
      {
        ...(original ?? {}),
        clientId,
        date,
        completed,
        weight: toDoubleLenient(weight),
        notes: notes.trim(),
        bodyFat: toDoubleLenient(bodyFat),
        muscleMass: toDoubleLenient(muscleMass),
      },
      showScheduleNext && scheduleNext ? nextDate : null,
    );
    back();
  }

  async function remove() {
    setConfirmDelete(false);
    if (original?.id != null) await repo.deleteFollowUp(original.id);
    back();
  }

  return (
    <div className="screen">
      <ScreenHeader title={t(isNew ? 'new_follow_up' : 'follow_up')} subtitle={clientName || null} onBack={back} backIcon="close">
        {!isNew && <CircleIconButton icon="delete" label={t('delete_follow_up')} tone="danger" onClick={() => setConfirmDelete(true)} />}
        <HeaderTextAction text={t('save')} enabled={canSave} onClick={save} />
      </ScreenHeader>
      {loaded && (
        <form className="screen__content form" onSubmit={(e) => (e.preventDefault(), save())}>
          <DateField label={t('date')} value={date} onChange={setDate} />
          <SwitchRow
            text={t('completed')}
            checked={completed}
            onChange={setCompleted}
            supporting={t(completed ? 'completed_yes' : 'completed_no')}
          />
          <TextField value={weight} onChange={setWeight} label={t('weight_optional')} kind="decimal" suffix={t('unit_kg')} error={!weightValid} />
          <div className="field-group">
            <div className="field-group__title">{t('body_composition')}</div>
            <div className="row row--fields">
              <TextField value={bodyFat} onChange={setBodyFat} label={t('body_fat')} kind="decimal" suffix={t('unit_percent')} error={!bodyFatValid} inCard />
              <TextField value={muscleMass} onChange={setMuscleMass} label={t('muscle_mass')} kind="decimal" suffix={t('unit_kg')} error={!muscleValid} inCard />
            </div>
          </div>
          <TextField value={notes} onChange={setNotes} label={t('notes')} multiline minRows={5} placeholder={t('followup_notes_hint')} />
          {showScheduleNext && (
            <CheckboxRow text={t('schedule_next', pretty(nextDate))} checked={scheduleNext} onChange={setScheduleNext} />
          )}
          <PrimaryButton text={t('save')} onClick={save} enabled={canSave} />
        </form>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('delete_follow_up_title')}
          text={t('delete_follow_up_text')}
          onConfirm={remove}
          onDismiss={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
