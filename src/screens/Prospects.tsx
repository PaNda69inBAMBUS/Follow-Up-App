import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { repo } from '../data';
import { addDays, today, type LocalDate } from '../data/dates';
import type { Prospect, ProspectStatus } from '../data/types';
import { t } from '../i18n';
import {
  CallButton,
  CircleIconButton,
  ConfirmDialog,
  DateField,
  EmptyState,
  FieldLabel,
  HeaderTextAction,
  PrimaryButton,
  ProspectItem,
  ScreenHeader,
  SegmentedPicker,
  TextField,
  prospectStatusLabel,
} from '../ui/components';
import { Icon } from '../ui/icons';
import { goBack, navigate, paths, replace } from '../ui/router';

// =====================================================================
// List
// =====================================================================

const FILTERS: (ProspectStatus | null)[] = [null, 'APPOINTMENT', 'NO_PURCHASE'];
let lastFilter: ProspectStatus | null = null;

/** Upcoming appointments first (soonest first), then people who didn't buy (most recent first). */
const listOrder = (a: Prospect, b: Prospect) =>
  Number(a.status !== 'APPOINTMENT') - Number(b.status !== 'APPOINTMENT') ||
  (a.status === 'APPOINTMENT' ? a.appointmentDate.localeCompare(b.appointmentDate) : b.appointmentDate.localeCompare(a.appointmentDate));

export function ProspectListScreen() {
  const all = useLiveQuery(() => repo.prospects());
  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState(lastFilter);
  const setFilter = (f: ProspectStatus | null) => setFilterState((lastFilter = f));

  if (!all) return null;
  const appointments = all.filter((p) => p.status === 'APPOINTMENT').length;
  const noPurchase = all.length - appointments;
  const term = query.trim().toLowerCase();
  const visible = all
    .filter(
      (p) =>
        (filter == null || p.status === filter) &&
        (!term || p.name.toLowerCase().includes(term) || p.notes.toLowerCase().includes(term) || p.phone.includes(term)),
    )
    .sort(listOrder);

  return (
    <div className="screen">
      <ScreenHeader title={t('nav_prospects')} subtitle={t('prospects_subtitle', appointments, noPurchase)} />
      <div className="screen__tools">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_prospects_hint')}
            autoCapitalize="words"
            aria-label={t('search_prospects_hint')}
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
          compact
          label={(s) =>
            s == null ? t('filter_all', all.length) : `${prospectStatusLabel(s)} ${s === 'APPOINTMENT' ? appointments : noPurchase}`
          }
        />
      </div>
      <div className="screen__content screen__content--tabs">
        {visible.length === 0 ? (
          <EmptyState message={t(all.length === 0 ? 'no_prospects' : 'no_prospects_match')} icon="face" />
        ) : (
          visible.map((p) => <ProspectItem key={p.id} prospect={p} onClick={() => navigate(paths.prospect(p.id!))} />)
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Add / edit
// =====================================================================

const STATUSES: ProspectStatus[] = ['APPOINTMENT', 'NO_PURCHASE'];

export function ProspectEditScreen({ prospectId }: { prospectId: number | null }) {
  const isNew = prospectId == null;
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState<Prospect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<ProspectStatus>('APPOINTMENT');
  const [date, setDate] = useState<LocalDate>(addDays(today(), 1));
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (prospectId == null) return;
    repo.getProspect(prospectId).then((p) => {
      if (!p) return goBack(paths.prospects()); // deleted or converted meanwhile
      setOriginal(p);
      setName(p.name);
      setPhone(p.phone);
      setEmail(p.email);
      setStatus(p.status);
      setDate(p.appointmentDate);
      setTime(p.appointmentTime);
      setNotes(p.notes);
      setLoaded(true);
    });
  }, [prospectId]);

  const canSave = !!name.trim() && !busy;
  const back = () => goBack(paths.prospects());
  const current = (): Prospect => ({
    ...(original ?? {}),
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    status,
    appointmentDate: date,
    appointmentTime: time.trim(),
    notes: notes.trim(),
    createdDate: original?.createdDate ?? today(),
  });

  async function save() {
    if (!canSave) return;
    setBusy(true);
    await repo.saveProspect(current());
    back();
  }

  async function remove() {
    setConfirmDelete(false);
    if (original?.id != null) await repo.deleteProspect(original.id);
    back();
  }

  /** Saves any edits, then turns the prospect into a client and opens the client. */
  async function convert() {
    setConfirmConvert(false);
    if (!canSave || isNew) return;
    setBusy(true);
    const p = current();
    await repo.saveProspect(p);
    const clientId = await repo.convertProspect(p);
    replace(paths.client(clientId));
  }

  return (
    <div className="screen">
      <ScreenHeader title={t(isNew ? 'new_prospect' : 'edit_prospect')} onBack={back} backIcon="close">
        {!isNew && <CircleIconButton icon="delete" label={t('delete_prospect')} tone="danger" onClick={() => setConfirmDelete(true)} />}
        <HeaderTextAction text={t('save')} enabled={canSave} onClick={save} />
      </ScreenHeader>
      {loaded && (
        <form className="screen__content form" onSubmit={(e) => (e.preventDefault(), save())}>
          <TextField value={name} onChange={setName} label={t('full_name')} kind="name" />

          <FieldLabel text={t('status')} />
          <SegmentedPicker
            options={STATUSES}
            selected={status}
            onSelect={setStatus}
            compact
            label={(s) => (s === 'APPOINTMENT' ? `📅  ${t('prospect_status_appointment')}` : `🚶  ${t('prospect_status_no_purchase_long')}`)}
          />

          <div className="row row--fields">
            <DateField className="w-date" label={t(status === 'APPOINTMENT' ? 'appointment_date' : 'came_date')} value={date} onChange={setDate} />
            <TextField value={time} onChange={setTime} label={t('meal_time')} placeholder={t('appointment_time_hint')} />
          </div>

          <FieldLabel text={t('contact')} />
          <div className="row">
            <TextField className="grow" value={phone} onChange={setPhone} label={t('phone')} kind="tel" />
            {phone.trim() && <CallButton phone={phone} size={52} />}
          </div>
          <TextField value={email} onChange={setEmail} label={t('email')} kind="email" />
          <TextField value={notes} onChange={setNotes} label={t('notes')} multiline minRows={3} placeholder={t('prospect_notes_hint')} />
          <PrimaryButton text={t('save')} onClick={save} enabled={canSave} />
          {!isNew && (
            <button type="button" className="convert-btn" disabled={!canSave} onClick={() => setConfirmConvert(true)}>
              {t('became_client')}
            </button>
          )}
        </form>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('delete_prospect_title')}
          text={t('delete_prospect_text', name)}
          onConfirm={remove}
          onDismiss={() => setConfirmDelete(false)}
        />
      )}
      {confirmConvert && (
        <ConfirmDialog
          title={t('became_client_title')}
          text={t('became_client_text', name.trim())}
          confirmText={t('convert')}
          destructive={false}
          onConfirm={convert}
          onDismiss={() => setConfirmConvert(false)}
        />
      )}
    </div>
  );
}
