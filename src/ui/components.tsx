/* Shared building blocks — the web version of the Android app's components/Common.kt. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { today, type LocalDate } from '../data/dates';
import type { Client, ClientStatus, Prospect, ProspectStatus } from '../data/types';
import { dayOfMonth, durationText, fmt, pretty, relativeDayText, shortMonth, statusLabel } from './format';
import { Icon, type IconName } from './icons';
import { usePhotoUrl } from './photo';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// =====================================================================
// Layout
// =====================================================================

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'back',
  children,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  backIcon?: IconName;
  children?: ReactNode;
}) {
  return (
    <header className={cx('header', onBack && 'header--sub')}>
      {onBack && <CircleIconButton icon={backIcon} label={t('back')} onClick={onBack} />}
      <div className="header__titles">
        {subtitle && <div className="header__subtitle">{subtitle}</div>}
        {title && <h1 className="header__title">{title}</h1>}
      </div>
      {children && <div className="header__actions">{children}</div>}
    </header>
  );
}

export function CircleIconButton({
  icon,
  label,
  onClick,
  tone = 'default',
  size = 44,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'call';
  size?: number;
}) {
  return (
    <button
      type="button"
      className={cx('icon-btn', `icon-btn--${tone}`)}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}

export function HeaderTextAction({ text, enabled, onClick }: { text: string; enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="header-action" disabled={!enabled} onClick={onClick}>
      {text}
    </button>
  );
}

export function Card({
  children,
  onClick,
  padding = 16,
  className,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  padding?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const props = { className: cx('card', onClick && 'card--tap', className), style: { padding, ...style } };
  return onClick ? (
    <div {...props} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      {children}
    </div>
  ) : (
    <div {...props}>{children}</div>
  );
}

/** Pill-shaped segmented control used instead of tabs and chips. */
export function SegmentedPicker<T>({
  options,
  selected,
  onSelect,
  label,
  fill = true,
  compact = false,
  className,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  label: (value: T) => string;
  fill?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('segmented', fill && 'segmented--fill', compact && 'segmented--compact', className)} role="tablist">
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={o === selected}
          className={cx('segmented__item', o === selected && 'is-selected')}
          onClick={() => onSelect(o)}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export function SectionHeader({ text, count }: { text: string; count?: number }) {
  return (
    <div className="section-header">
      <h2>{text}</h2>
      {count != null && <CountBadge count={count} />}
    </div>
  );
}

export function CountBadge({ count }: { count: number }) {
  return <span className="count-badge">{count}</span>;
}

export function EmptyState({ message, icon = 'calendar' }: { message: string; icon?: IconName }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={32} />
      </div>
      <p>{message}</p>
    </div>
  );
}

// =====================================================================
// Form controls
// =====================================================================

type FieldKind = 'text' | 'decimal' | 'number' | 'tel' | 'email' | 'name';

export function TextField({
  value,
  onChange,
  label,
  kind = 'text',
  multiline = false,
  minRows = 1,
  suffix,
  placeholder,
  error = false,
  supporting,
  inCard = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  kind?: FieldKind;
  multiline?: boolean;
  minRows?: number;
  suffix?: string;
  placeholder?: string;
  error?: boolean;
  supporting?: string | null;
  inCard?: boolean;
  className?: string;
}) {
  const id = useId();
  const inputProps = {
    id,
    value,
    placeholder,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    'aria-invalid': error || undefined,
  };
  const keyboard =
    kind === 'decimal' ? { inputMode: 'decimal' as const }
    : kind === 'number' ? { inputMode: 'numeric' as const, pattern: '[0-9]*' }
    : kind === 'tel' ? { type: 'tel', autoComplete: 'tel' }
    : kind === 'email' ? { type: 'email', autoCapitalize: 'none', autoCorrect: 'off', autoComplete: 'email' }
    : kind === 'name' ? { autoCapitalize: 'words', autoComplete: 'off' }
    : { autoCapitalize: 'sentences' };
  return (
    <div className={cx('field-wrap', className)}>
      <label className={cx('field', inCard && 'field--in-card', error && 'field--error', multiline && 'field--multi')} htmlFor={id}>
        <span className="field__label">{label}</span>
        <span className="field__row">
          {multiline ? (
            <textarea {...inputProps} rows={minRows} autoCapitalize="sentences" />
          ) : (
            <input {...inputProps} {...keyboard} />
          )}
          {suffix && <span className="field__suffix">{suffix}</span>}
        </span>
      </label>
      {supporting && <div className="field__supporting">{supporting}</div>}
    </div>
  );
}

/** A date shown as "12 Nov 2026"; tapping opens the phone's own date picker. */
export function DateField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: LocalDate;
  onChange: (date: LocalDate) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={cx('field', 'field--date', className)} htmlFor={id}>
      <span className="field__label">{label}</span>
      <span className="field__row">
        <span className="field__value">{pretty(value)}</span>
        <Icon name="calendar" className="field__icon" />
      </span>
      <input
        id={id}
        type="date"
        className="field__date-input"
        value={value}
        aria-label={label}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Not allowed in this browser — the native control still opens on tap.
          }
        }}
      />
    </label>
  );
}

/** Opens the phone's date picker from any button (e.g. "Done 3 Nov" on a program item). */
export function useDatePicker(onPick: (date: LocalDate) => void) {
  const input = useRef<HTMLInputElement>(null);
  const open = (initial: LocalDate) => {
    const el = input.current;
    if (!el) return;
    el.value = initial;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  const element = (
    <input
      ref={input}
      type="date"
      className="hidden-date-input"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => e.target.value && onPick(e.target.value)}
    />
  );
  return { open, element };
}

export function FieldLabel({ text }: { text: string }) {
  return <div className="field-label">{text}</div>;
}

export function SwitchRow({
  text,
  checked,
  onChange,
  supporting,
}: {
  text: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  supporting?: string;
}) {
  return (
    <label className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__title">{text}</span>
        {supporting && <span className="switch-row__supporting">{supporting}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function CheckboxRow({ text, checked, onChange }: { text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" className="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{text}</span>
    </label>
  );
}

export function PrimaryButton({ text, onClick, enabled = true }: { text: string; onClick: () => void; enabled?: boolean }) {
  return (
    <button type="button" className="primary-btn" disabled={!enabled} onClick={onClick}>
      {text}
    </button>
  );
}

/** Big tinted button with a dashed-style outline ("+ New nutrition plan", "+ Add meal"). */
export function AddButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button type="button" className="add-btn" onClick={onClick}>
      <span className="add-btn__plus">
        <Icon name="add" size={18} />
      </span>
      {text}
    </button>
  );
}

// =====================================================================
// Display pieces
// =====================================================================

export function StatusPill({ status }: { status: ClientStatus }) {
  return (
    <span className={cx('status-pill', status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive')}>
      <span className="status-pill__dot" />
      {statusLabel(status)}
    </span>
  );
}

/** Gradients for avatars, picked by name so each client keeps the same color (same as Android). */
const AVATAR_GRADIENTS = [
  ['#5B4CF0', '#9B51E0'],
  ['#FF6B4A', '#FF9A62'],
  ['#0FA97A', '#3DDBA6'],
  ['#2D8CFF', '#5CC8FF'],
  ['#E5487A', '#FF7EB3'],
  ['#F2A100', '#FFCC4D'],
];

/** Java's String.hashCode, so a client gets the same avatar color as on the Android phone. */
function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  );
}

/** Client photo if there is one, otherwise colored initials. */
export function Avatar({
  name,
  size = 46,
  photoId,
  photoUrl,
}: {
  name: string;
  size?: number;
  photoId?: number | null;
  /** Overrides [photoId] (e.g. a photo picked but not saved yet). */
  photoUrl?: string | null;
}) {
  const stored = usePhotoUrl(photoUrl === undefined ? photoId : null);
  const url = photoUrl === undefined ? stored : photoUrl;
  // A photo the browser can't show (damaged file) falls back to the initials.
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size, borderRadius: size * 0.36 };
  if (url && url !== broken) return <img className="avatar" src={url} alt={name} style={style} onError={() => setBroken(url)} />;
  const n = AVATAR_GRADIENTS.length;
  const [a, b] = AVATAR_GRADIENTS[((javaHash(name.trim().toLowerCase()) % n) + n) % n];
  return (
    <div className="avatar" style={{ ...style, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

/** Calendar-style tile: day number over short month. */
export function DateTile({ date, completed }: { date: LocalDate; completed: boolean }) {
  const now = today();
  const tone = completed ? 'done' : date < now ? 'overdue' : date === now ? 'today' : 'future';
  return (
    <div className={`date-tile date-tile--${tone}`}>
      <span className="date-tile__day">{dayOfMonth(date)}</span>
      <span className="date-tile__month">{shortMonth(date)}</span>
    </div>
  );
}

export function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="info-row">
      <div className="info-row__icon">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className="info-row__label">{label}</div>
        <div className="info-row__value">{value}</div>
      </div>
    </div>
  );
}

export function ClientItem({ client, onClick, supporting }: { client: Client; onClick: () => void; supporting?: string }) {
  return (
    <Card onClick={onClick} padding={14} className="list-item">
      <div className="row">
        <Avatar name={client.name} photoId={client.photoId} />
        <div className="grow min0">
          <div className="title-md ellipsis">{client.name}</div>
          <div className="text-sm muted ellipsis">
            {supporting ?? t('client_since', pretty(client.startDate), durationText(client.startDate))}
          </div>
        </div>
        <StatusPill status={client.status} />
      </div>
    </Card>
  );
}

export function FollowUpItem({
  date,
  title,
  details,
  completed,
  onClick,
  onMarkDone,
}: {
  date: LocalDate;
  title: string;
  details?: string;
  completed: boolean;
  onClick: () => void;
  onMarkDone?: () => void;
}) {
  const overdue = !completed && date < today();
  return (
    <Card onClick={onClick} padding={12} className="list-item">
      <div className="row">
        <DateTile date={date} completed={completed} />
        <div className="grow min0">
          <div className="title-sm ellipsis">{title}</div>
          <div className={cx('text-sm', overdue ? 'error bold' : completed ? 'tertiary' : 'muted')}>
            {completed ? t('completed') : relativeDayText(date)}
          </div>
          {details?.trim() && <div className="text-sm muted ellipsis">{details}</div>}
        </div>
        {onMarkDone && (
          <button
            type="button"
            className="mark-done"
            aria-label={t('mark_done')}
            onClick={(e) => {
              e.stopPropagation();
              onMarkDone();
            }}
          >
            <Icon name="check" size={20} />
          </button>
        )}
      </div>
    </Card>
  );
}

// ---------- Prospects ----------

export const prospectStatusLabel = (s: ProspectStatus) =>
  t(s === 'APPOINTMENT' ? 'prospect_status_appointment' : 'prospect_status_no_purchase');

/** "📅 Tomorrow 15:00", "Appointment passed · 7 Nov 2026", "Came on 3 Nov 2026 · didn't buy". */
export function prospectSubtitle(p: Prospect, now: LocalDate = today()): string {
  const time = p.appointmentTime.trim() ? ` ${p.appointmentTime.trim()}` : '';
  if (p.status === 'NO_PURCHASE') return t('came_on', pretty(p.appointmentDate));
  if (p.appointmentDate < now) return t('appointment_passed', pretty(p.appointmentDate));
  return t('appointment_on', relativeDayText(p.appointmentDate, now) + time);
}

/** Round green phone button that opens the dialer. */
export function CallButton({ phone, size = 40 }: { phone: string; size?: number }) {
  return (
    <a
      className="icon-btn icon-btn--call"
      style={{ width: size, height: size }}
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      aria-label={t('call')}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="phone" />
    </a>
  );
}

export function ProspectItem({ prospect, onClick }: { prospect: Prospect; onClick: () => void }) {
  const overdue = prospect.status === 'APPOINTMENT' && prospect.appointmentDate < today();
  return (
    <Card onClick={onClick} padding={14} className="list-item">
      <div className="row">
        <Avatar name={prospect.name} />
        <div className="grow min0">
          <div className="title-md ellipsis">{prospect.name}</div>
          <div className={cx('text-sm ellipsis', overdue ? 'error' : 'muted')}>{prospectSubtitle(prospect)}</div>
        </div>
        <span className={cx('pill', prospect.status === 'APPOINTMENT' ? 'pill--primary-soft' : 'pill--secondary-soft')}>
          {prospectStatusLabel(prospect.status)}
        </span>
        {prospect.phone.trim() && <CallButton phone={prospect.phone} />}
      </div>
    </Card>
  );
}

/** "↑ 3", "↓ 1", "→ 0" — green up, red down, grey flat. */
export function DeltaPill({ delta, suffix = '' }: { delta: number; suffix?: string }) {
  const [tone, arrow] = delta > 0 ? ['good', '↑'] : delta < 0 ? ['bad', '↓'] : ['neutral', '→'];
  return <span className={`chip chip--sm chip--${tone}`}>{`${arrow} ${Math.abs(delta)}${suffix}`}</span>;
}

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="progress">
      <div className="progress__fill" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
    </div>
  );
}

/** "Lost 5 kg" (green) / "Gained 2 kg" (orange) / "No change". */
export function WeightResultChip({ change }: { change: number }) {
  const [tone, text] =
    change < 0 ? ['good', `↓ ${t('weight_lost', fmt(Math.abs(change)))}`]
    : change > 0 ? ['gain', `↑ ${t('weight_gained', fmt(change))}`]
    : ['neutral', `→ ${t('weight_no_change')}`];
  return <span className={`chip chip--${tone}`}>{text}</span>;
}

// =====================================================================
// Overlays: dialog, bottom sheet, snackbar
// =====================================================================

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

export function ConfirmDialog({
  title,
  text,
  confirmText = t('delete'),
  destructive = true,
  onConfirm,
  onDismiss,
}: {
  title: string;
  text: string;
  confirmText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEscape(onDismiss);
  return createPortal(
    <div className="scrim" onClick={onDismiss}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">{title}</h2>
        <p className="dialog__text">{text}</p>
        <div className="dialog__actions">
          <button type="button" className="text-btn" onClick={onDismiss}>
            {t('cancel')}
          </button>
          <button type="button" className={cx('text-btn', destructive && 'text-btn--danger')} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Sheet({ onDismiss, children, label }: { onDismiss: () => void; children: ReactNode; label: string }) {
  useEscape(onDismiss);
  return createPortal(
    <div className="scrim scrim--sheet" onClick={onDismiss}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface SnackbarMessage {
  id: number;
  message: string;
  action?: string;
  onAction?: () => void;
}

const SnackbarContext = createContext<(m: Omit<SnackbarMessage, 'id'>) => void>(() => {});

/** Shows a short message at the bottom, optionally with one action ("Next: 26 Nov"). */
export const useSnackbar = () => useContext(SnackbarContext);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<SnackbarMessage | null>(null);
  const show = useCallback((m: Omit<SnackbarMessage, 'id'>) => setCurrent({ ...m, id: Date.now() }), []);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), current.action ? 10_000 : 4_000);
    return () => clearTimeout(timer);
  }, [current]);
  return (
    <SnackbarContext.Provider value={show}>
      {children}
      {current &&
        createPortal(
          <div className="snackbar" role="status" key={current.id}>
            <span className="snackbar__text">{current.message}</span>
            {current.action && (
              <button
                type="button"
                className="snackbar__action"
                onClick={() => {
                  current.onAction?.();
                  setCurrent(null);
                }}
              >
                {current.action}
              </button>
            )}
            <button type="button" className="snackbar__close" aria-label={t('dismiss')} onClick={() => setCurrent(null)}>
              <Icon name="close" size={18} />
            </button>
          </div>,
          document.body,
        )}
    </SnackbarContext.Provider>
  );
}

/** "Check-in marked as done · Next: 26 Nov 2026" — tapping the action schedules the next one. */
export function useOfferScheduleNext() {
  const show = useSnackbar();
  return (next: LocalDate, schedule: () => void) =>
    show({ message: t('snackbar_done'), action: t('snackbar_next', pretty(next)), onAction: schedule });
}
