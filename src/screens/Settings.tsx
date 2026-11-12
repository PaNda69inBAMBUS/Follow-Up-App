/* Settings — appearance, language, install, backup, about (like the Android SettingsScreen). */
import { useRef, useState, type CSSProperties } from 'react';
import { db } from '../data';
import { backupFileName, BackupError, exportBackup, readBackupFile, restoreBackup, type BackupContent } from '../data/backup';
import { today } from '../data/dates';
import { t } from '../i18n';
import { Card, ConfirmDialog, ScreenHeader, SegmentedPicker, useSnackbar } from '../ui/components';
import { pretty } from '../ui/format';
import { Icon } from '../ui/icons';
import { goBack, paths } from '../ui/router';
import { isInstalled } from '../ui/pwa';
import { setSetting, useSetting, type Language, type ThemeMode, type VisualStyle } from '../ui/settings';

const THEMES: ThemeMode[] = ['SYSTEM', 'LIGHT', 'DARK'];
const STYLES: VisualStyle[] = ['SOLID', 'GLASS'];

export function SettingsScreen() {
  const theme = useSetting('theme');
  const style = useSetting('style');
  const glassLevel = useSetting('glassLevel');
  const language = useSetting('language');
  const lastBackup = useSetting('lastBackup');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupContent | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const snackbar = useSnackbar();
  const percent = Math.round(glassLevel * 100);

  async function onPick(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      const invalid = !(e instanceof BackupError) || e.reason === 'NOT_A_BACKUP';
      snackbar({ message: t(invalid ? 'restore_invalid' : 'restore_read_failed') });
    }
  }

  async function onRestore() {
    const content = pending;
    setPending(null);
    if (!content) return;
    setBusy(true);
    try {
      await restoreBackup(db, content);
      snackbar({ message: t('restore_done', content.stats.clients) });
    } catch (e) {
      console.error(e);
      snackbar({ message: t('restore_failed') });
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setBusy(true);
    try {
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
      setSetting('lastBackup', today());
      snackbar({ message: t('backup_saved', stats.clients, stats.checkIns, stats.plans, stats.photos) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={t('settings')} onBack={() => goBack(paths.home())} />
      <div className="screen__content stack-12">
        {/* ---- Appearance ---- */}
        <Card padding={18}>
          <h2 className="title-md">{t('appearance')}</h2>
          <SegmentedPicker
            className="mt-12"
            options={THEMES}
            selected={theme}
            onSelect={(v) => setSetting('theme', v)}
            label={(v) => t(v === 'SYSTEM' ? 'theme_system' : v === 'LIGHT' ? 'theme_light' : 'theme_dark')}
          />
          {theme === 'SYSTEM' && <p className="text-sm muted mt-8 pl-4">{t('theme_system_hint')}</p>}

          <h3 className="title-sm mt-18">{t('style')}</h3>
          <SegmentedPicker
            className="mt-8"
            options={STYLES}
            selected={style}
            onSelect={(v) => setSetting('style', v)}
            label={(v) => (v === 'SOLID' ? `◼  ${t('style_solid')}` : `◇  ${t('style_glass')}`)}
          />
          <p className="text-sm muted mt-8 pl-4">{t(style === 'GLASS' ? 'style_glass_hint' : 'style_solid_hint')}</p>
          {style === 'GLASS' && (
            <div className="mt-14">
              <div className="row">
                <span className="title-sm grow">{t('glass_transparency')}</span>
                <span className="pill pill--primary-soft">{t('percent_value', percent)}</span>
              </div>
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                value={percent}
                aria-label={t('glass_transparency')}
                style={{ '--fill': `${percent}%` } as CSSProperties}
                onChange={(e) => setSetting('glassLevel', Number(e.target.value) / 100)}
              />
              <div className="row">
                <span className="label-md muted grow">{t('glass_less')}</span>
                <span className="label-md muted">{t('glass_more')}</span>
              </div>
            </div>
          )}
        </Card>

        {/* ---- Language ---- */}
        <Card padding={18}>
          <h2 className="title-md">{t('language')}</h2>
          <div className="stack-8 mt-12">
            <LanguageOption flag="🇬🇧" name={t('language_en')} value="en" selected={language === 'en'} />
            <LanguageOption flag="🇷🇴" name={t('language_ro')} value="ro" selected={language === 'ro'} />
          </div>
        </Card>

        {/* ---- Install ---- */}
        <Card padding={18}>
          <h2 className="title-md">{t('install_title')}</h2>
          {isInstalled() ? (
            <p className="text-md tertiary mt-8">{t('install_installed')}</p>
          ) : (
            <p className="text-sm muted mt-8">{t('install_text')}</p>
          )}
        </Card>

        {/* ---- Backup ---- */}
        <Card padding={18}>
          <div className="row row--tight">
            <h2 className="title-md">{t('backup')}</h2>
            {busy && <span className="spinner" aria-hidden="true" />}
          </div>
          <p className="text-sm muted mt-4">{t('backup_desc')}</p>
          <p className={`label-lg mt-10 ${lastBackup ? 'tertiary' : 'error'}`}>
            {lastBackup ? t('backup_last', pretty(lastBackup)) : t('backup_never')}
          </p>
          <div className="stack-8 mt-12">
            <button type="button" className="primary-btn" disabled={busy} onClick={onExport}>
              {`💾  ${t('export_backup')}`}
            </button>
            <button type="button" className="secondary-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
              {`📂  ${t('restore_backup')}`}
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json,text/plain" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        </Card>

        {/* ---- About ---- */}
        <Card padding={18}>
          <h2 className="title-md">{t('about')}</h2>
          <div className="title-sm mt-8">{t('app_name')}</div>
          <div className="text-sm muted">{t('version', __APP_VERSION__)}</div>
          <p className="text-sm muted mt-8">{t('data_on_device')}</p>
        </Card>
      </div>

      {pending && (
        <ConfirmDialog
          title={t('restore_confirm_title')}
          text={t(
            'restore_confirm_text',
            pending.exportedAt ? pretty(pending.exportedAt.slice(0, 10)) : t('unknown_date'),
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

function LanguageOption({ flag, name, value, selected }: { flag: string; name: string; value: Language; selected: boolean }) {
  return (
    <button
      type="button"
      className={`language-option${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={() => setSetting('language', value)}
    >
      <span className="language-option__flag">{flag}</span>
      <span className="grow">{name}</span>
      <span className="language-option__check">{selected && <Icon name="check" size={16} />}</span>
    </button>
  );
}
