import { useEffect, useState } from 'react';
import { repo } from '../data';
import { addDays, today, type LocalDate } from '../data/dates';
import { DEFAULT_INTERVAL_DAYS, newClient, type Client, type ClientStatus } from '../data/types';
import { t } from '../i18n';
import {
  CheckboxRow,
  DateField,
  FieldLabel,
  HeaderTextAction,
  PrimaryButton,
  ScreenHeader,
  SegmentedPicker,
  TextField,
} from '../ui/components';
import { fmt, pretty, statusLabel, toDoubleLenient, toIntLenient } from '../ui/format';
import { usePhotoUrl } from '../ui/photo';
import { EditableAvatar, PhotoOptionsSheet, usePhotoPicker, type Picked } from '../ui/PhotoPicker';
import { goBack, paths, replace } from '../ui/router';

const STATUSES: ClientStatus[] = ['ACTIVE', 'INACTIVE'];
const num = (n: number | null) => (n != null ? fmt(n) : '');

export function ClientEditScreen({ clientId }: { clientId: number | null }) {
  const isNew = clientId == null;
  const [original, setOriginal] = useState<Client | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startDate, setStartDate] = useState<LocalDate>(today());
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<ClientStatus>('ACTIVE');
  const [startWeight, setStartWeight] = useState('');
  const [startBodyFat, setStartBodyFat] = useState('');
  const [startMuscleMass, setStartMuscleMass] = useState('');
  const [intervalDays, setIntervalDays] = useState(String(DEFAULT_INTERVAL_DAYS));
  const [notes, setNotes] = useState('');
  const [scheduleFirst, setScheduleFirst] = useState(true);

  // Photo shown in the form; saved only when the client is saved. undefined = unchanged.
  const [photo, setPhoto] = useState<Picked | null | undefined>(undefined);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const picker = usePhotoPicker(setPhoto);
  const draftUrl = usePhotoUrl(original?.photoId, photo === undefined ? undefined : photo?.data ?? null);
  const hasPhoto = photo === undefined ? original?.photoId != null : photo != null;

  useEffect(() => {
    if (isNew) return;
    repo.getClient(clientId).then((c) => {
      if (c) {
        setOriginal(c);
        setName(c.name);
        setPhone(c.phone);
        setEmail(c.email);
        setStartDate(c.startDate);
        setGoal(c.goal);
        setStatus(c.status);
        setStartWeight(num(c.startWeight));
        setStartBodyFat(num(c.startBodyFat));
        setStartMuscleMass(num(c.startMuscleMass));
        setIntervalDays(String(c.followUpIntervalDays));
        setNotes(c.notes);
      }
      setLoaded(true);
    });
  }, [clientId, isNew]);

  const interval = toIntLenient(intervalDays);
  const intervalValid = interval != null && interval >= 1 && interval <= 365;
  const weightValid = !startWeight.trim() || toDoubleLenient(startWeight) != null;
  const fat = toDoubleLenient(startBodyFat);
  const bodyFatValid = !startBodyFat.trim() || (fat != null && fat >= 0 && fat <= 100);
  const muscleValid = !startMuscleMass.trim() || toDoubleLenient(startMuscleMass) != null;
  const canSave = !!name.trim() && intervalValid && weightValid && bodyFatValid && muscleValid && !picker.busy && !saving;
  const firstFollowUp = addDays(startDate > today() ? startDate : today(), interval ?? DEFAULT_INTERVAL_DAYS);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const client: Client = {
      ...(original ?? newClient({ name: '', startDate })),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      startDate,
      goal: goal.trim(),
      status,
      startWeight: toDoubleLenient(startWeight),
      startBodyFat: toDoubleLenient(startBodyFat),
      startMuscleMass: toDoubleLenient(startMuscleMass),
      followUpIntervalDays: interval ?? DEFAULT_INTERVAL_DAYS,
      notes: notes.trim(),
      // Kept from the original: photoId (changed below) and fromAppointment.
    };
    const schedule = isNew && scheduleFirst && status === 'ACTIVE' ? firstFollowUp : null;
    const id = await repo.saveClient(client, schedule);
    if (photo !== undefined) await repo.setClientPhoto(id, photo);
    if (isNew) replace(paths.client(id));
    else goBack(paths.client(id));
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={t(isNew ? 'new_client' : 'edit_client')}
        onBack={() => goBack(isNew ? paths.clients() : paths.client(clientId))}
        backIcon="close"
      >
        <HeaderTextAction text={t('save')} enabled={canSave} onClick={save} />
      </ScreenHeader>
      {loaded && (
        <form className="screen__content form" onSubmit={(e) => (e.preventDefault(), save())}>
          <div className="photo-field">
            <EditableAvatar
              name={name}
              photoId={original?.photoId}
              photoUrl={photo === undefined ? undefined : draftUrl}
              hasPhoto={hasPhoto}
              busy={picker.busy}
              onClick={() => setShowPhotoOptions(true)}
            />
            <button type="button" className="text-btn" onClick={() => setShowPhotoOptions(true)}>
              {t(hasPhoto ? 'change_photo' : 'add_photo')}
            </button>
          </div>

          <TextField value={name} onChange={setName} label={t('full_name')} kind="name" />

          <FieldLabel text={t('status')} />
          <SegmentedPicker options={STATUSES} selected={status} onSelect={setStatus} label={statusLabel} />

          <FieldLabel text={t('program')} />
          <DateField label={t('start_date')} value={startDate} onChange={setStartDate} />
          <TextField value={goal} onChange={setGoal} label={t('goal')} multiline placeholder={t('goal_hint')} />
          <TextField
            value={intervalDays}
            onChange={setIntervalDays}
            label={t('check_in_every')}
            kind="number"
            suffix={t('unit_days')}
            error={!intervalValid}
          />

          <FieldLabel text={t('starting_measurements')} />
          <div className="field-group">
            <TextField value={startWeight} onChange={setStartWeight} label={t('start_weight')} kind="decimal" suffix={t('unit_kg')} error={!weightValid} inCard />
            <div className="row row--fields">
              <TextField value={startBodyFat} onChange={setStartBodyFat} label={t('body_fat')} kind="decimal" suffix={t('unit_percent')} error={!bodyFatValid} inCard />
              <TextField value={startMuscleMass} onChange={setStartMuscleMass} label={t('muscle_mass')} kind="decimal" suffix={t('unit_kg')} error={!muscleValid} inCard />
            </div>
          </div>

          <FieldLabel text={t('contact')} />
          <TextField value={phone} onChange={setPhone} label={t('phone')} kind="tel" />
          <TextField value={email} onChange={setEmail} label={t('email')} kind="email" />
          <TextField value={notes} onChange={setNotes} label={t('notes')} multiline minRows={3} placeholder={t('notes_hint')} />
          {isNew && status === 'ACTIVE' && (
            <CheckboxRow text={t('schedule_first', pretty(firstFollowUp))} checked={scheduleFirst} onChange={setScheduleFirst} />
          )}
          <PrimaryButton text={t(isNew ? 'add_client' : 'save_changes')} onClick={save} enabled={canSave} />
        </form>
      )}

      {picker.inputs}
      {showPhotoOptions && (
        <PhotoOptionsSheet hasPhoto={hasPhoto} picker={picker} onRemove={() => setPhoto(null)} onDismiss={() => setShowPhotoOptions(false)} />
      )}
    </div>
  );
}
