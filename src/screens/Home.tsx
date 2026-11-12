/*
 * Temporary Home page until the dashboard arrives in step 3: what's on this device plus
 * backup import / export, so real data from the Android phone can be loaded.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '../data';
import { backupFileName, BackupError, exportBackup, readBackupFile, restoreBackup, type BackupContent } from '../data/backup';
import { today } from '../data/dates';
import { t } from '../i18n';
import { Card, ConfirmDialog, ScreenHeader, useSnackbar } from '../ui/components';
import { longDay } from '../ui/format';

function greeting(): string {
  const h = new Date().getHours();
  return t(h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_afternoon' : 'greeting_evening');
}

export function HomeScreen() {
  const clientCount = useLiveQuery(() => db.clients.count());
  const [pending, setPending] = useState<BackupContent | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const snackbar = useSnackbar();

  async function onPick(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      const invalid = e instanceof BackupError && e.reason === 'NOT_A_BACKUP';
      snackbar({ message: t(invalid ? 'restore_invalid' : 'restore_read_failed') });
    }
  }

  async function onRestore() {
    const content = pending;
    setPending(null);
    if (!content) return;
    try {
      await restoreBackup(db, content);
      snackbar({ message: t('restore_done', content.stats.clients) });
    } catch (e) {
      console.error(e);
      snackbar({ message: t('restore_failed') });
    }
  }

  async function onExport() {
    const { json, stats } = await exportBackup(db);
    const file = new File([json], backupFileName(), { type: 'application/json' });
    // On iPhone the share sheet lets you save the file to Files / iCloud Drive or send it.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        return; // cancelled
      }
    } else {
      const url = URL.createObjectURL(file);
      Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    snackbar({ message: t('backup_saved', stats.clients, stats.checkIns, stats.plans, stats.photos) });
  }

  return (
    <div className="screen">
      <ScreenHeader title={greeting()} subtitle={longDay(today())} />
      <div className="screen__content screen__content--tabs">
        <div className="hero">
          <div className="hero__label">{t('nav_clients')}</div>
          <div className="hero__value">{clientCount ?? '–'}</div>
        </div>

        <p className="muted text-md mt-16">{t('dashboard_coming')}</p>

        <Card className="mt-12" padding={18}>
          <h2 className="title-lg">{t('backup')}</h2>
          <p className="text-sm muted mt-4">{t('data_on_device')}</p>
          <div className="stack-10 mt-12">
            <button type="button" className="primary-btn" onClick={onExport}>
              {t('export_backup')}
            </button>
            <button type="button" className="secondary-btn" onClick={() => fileInput.current?.click()}>
              {t('restore_backup')}
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json,text/plain" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        </Card>
      </div>

      {pending && (
        <ConfirmDialog
          title={t('restore_confirm_title')}
          text={t(
            'restore_confirm_text',
            pending.exportedAt?.replace('T', ' ') ?? t('unknown_date'),
            pending.stats.clients,
            pending.stats.checkIns,
            pending.stats.plans,
            pending.stats.photos,
            pending.stats.prospects,
          )}
          confirmText={t('restore')}
          onConfirm={onRestore}
          onDismiss={() => setPending(null)}
        />
      )}
    </div>
  );
}
