/* Picking a client photo: camera or photo library, then shrunk to a small JPEG. */
import { useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { Avatar, Sheet, useSnackbar } from './components';
import { Icon } from './icons';
import { processPhoto } from './photo';

export interface Picked {
  data: ArrayBuffer;
  type: string;
}

/**
 * Hidden file inputs that live at screen level (not inside the options sheet), so the
 * picked photo still arrives after the sheet has closed. Render [inputs] once on the screen.
 */
export function usePhotoPicker(onPicked: (photo: Picked) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const snackbar = useSnackbar();

  async function handle(file: File | undefined, input: HTMLInputElement) {
    input.value = ''; // so picking the same photo again still triggers a change
    if (!file) return;
    setBusy(true);
    try {
      onPicked(await processPhoto(file));
    } catch {
      snackbar({ message: t('photo_error') });
    } finally {
      setBusy(false);
    }
  }

  const inputs: ReactNode = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0], e.target)} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0], e.target)} />
    </>
  );
  return { inputs, busy, takePhoto: () => camera.current?.click(), chooseFromLibrary: () => library.current?.click() };
}

/** Sheet with "Take photo / Choose from library / Remove photo". */
export function PhotoOptionsSheet({
  hasPhoto,
  picker,
  onRemove,
  onDismiss,
}: {
  hasPhoto: boolean;
  picker: ReturnType<typeof usePhotoPicker>;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  // Opening the picker must happen inside the tap itself (iOS rule), so it runs before closing.
  const option = (emoji: string, text: string, action: () => void, destructive = false) => (
    <button
      type="button"
      className={`sheet-option${destructive ? ' sheet-option--danger' : ''}`}
      onClick={() => {
        action();
        onDismiss();
      }}
    >
      <span className="sheet-option__emoji">{emoji}</span>
      {text}
    </button>
  );
  const title = t(hasPhoto ? 'change_photo' : 'add_photo');
  return (
    <Sheet onDismiss={onDismiss} label={title}>
      <h2 className="sheet__title">{title}</h2>
      <div className="stack-8">
        {option('📷', t('take_photo'), picker.takePhoto)}
        {option('🖼️', t('choose_photo'), picker.chooseFromLibrary)}
        {hasPhoto && option('🗑️', t('remove_photo'), onRemove, true)}
      </div>
    </Sheet>
  );
}

/** Avatar with a small round badge; tapping it opens the photo options. */
export function EditableAvatar({
  name,
  photoId,
  photoUrl,
  hasPhoto,
  onClick,
  size = 96,
  busy = false,
}: {
  name: string;
  photoId?: number | null;
  photoUrl?: string | null;
  hasPhoto: boolean;
  onClick: () => void;
  size?: number;
  busy?: boolean;
}) {
  const label = t(hasPhoto ? 'change_photo' : 'add_photo');
  return (
    <button type="button" className="editable-avatar" onClick={onClick} aria-label={label} style={{ width: size, height: size }}>
      <Avatar name={name.trim() || '?'} size={size} photoId={photoId} photoUrl={photoUrl} />
      {busy && <span className="editable-avatar__busy" />}
      <span className="editable-avatar__badge" style={{ width: size * 0.36, height: size * 0.36 }}>
        <Icon name={hasPhoto ? 'edit' : 'add'} size={size * 0.18} />
      </span>
    </button>
  );
}
