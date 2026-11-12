/*
 * Step 1 — temporary "Data check" screen: shows what's stored on this device and lets you
 * import / export backups, to confirm the data layer works with real Android backups.
 * The real screens (clients, follow-ups, …) replace this in step 2.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, repo, requestPersistentStorage } from './data';
import {
  backupFileName,
  BackupError,
  exportBackup,
  readBackupFile,
  restoreBackup,
  type BackupContent,
  type BackupStats,
} from './data/backup';

export function App() {
  const counts = useLiveQuery(async () => ({
    clients: await db.clients.count(),
    checkIns: (await repo.completedFollowUps()).length,
    pending: (await repo.pendingFollowUps()).length,
    plans: await db.plans.count(),
    meals: await db.meals.count(),
    photos: await db.photos.count(),
    prospects: await db.prospects.count(),
  }));
  const clients = useLiveQuery(() => repo.clients());

  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [pending, setPending] = useState<BackupContent | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestPersistentStorage().then(setPersistent);
  }, []);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      const reason = e instanceof BackupError ? e.reason : 'READ_FAILED';
      setMessage({ text: reason === 'NOT_A_BACKUP' ? "That file isn't a Client Tracker backup." : "Couldn't read that file.", error: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onRestore() {
    if (!pending) return;
    try {
      await restoreBackup(db, pending);
      setMessage({ text: `Restored: ${summary(pending.stats)}` });
    } catch (e) {
      console.error(e);
      setMessage({ text: 'Restore failed — your existing data was not changed.', error: true });
    }
    setPending(null);
  }

  async function onExport() {
    const { json, stats } = await exportBackup(db);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: backupFileName() });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ text: `Exported: ${summary(stats)}` });
  }

  return (
    <main>
      <h1>Client Tracker</h1>
      <p className="muted">Step 1 · data check</p>

      <section className="card">
        <h2>On this device</h2>
        {counts ? (
          <dl className="grid">
            <Stat label="Clients" value={counts.clients} />
            <Stat label="Check-ins done" value={counts.checkIns} />
            <Stat label="Follow-ups open" value={counts.pending} />
            <Stat label="Nutrition plans" value={counts.plans} />
            <Stat label="Meals" value={counts.meals} />
            <Stat label="Photos" value={counts.photos} />
            <Stat label="Prospects" value={counts.prospects} />
          </dl>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <p className="muted small">
          Storage:{' '}
          {persistent == null ? 'checking…' : persistent ? 'protected from automatic clean-up ✓' : 'not protected yet (add to home screen)'}
        </p>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <div className="row">
          <button onClick={() => fileInput.current?.click()}>Import backup…</button>
          <button className="secondary" onClick={onExport}>Export backup</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => onPick(e.target.files?.[0])} />

        {pending && (
          <div className="confirm">
            <p>
              <strong>Replace all data on this device?</strong>
              <br />
              Backup{pending.exportedAt ? ` from ${pending.exportedAt.replace('T', ' ')}` : ''}: {summary(pending.stats)}
            </p>
            <div className="row">
              <button className="danger" onClick={onRestore}>Replace</button>
              <button className="secondary" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
        {message && <p className={message.error ? 'error' : 'ok'}>{message.text}</p>}
      </section>

      {clients && clients.length > 0 && (
        <section className="card">
          <h2>Clients</h2>
          <ul className="list">
            {clients.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <span className="muted small">
                  {c.status === 'ACTIVE' ? 'Active' : 'Inactive'} · since {c.startDate}
                  {c.fromAppointment ? ' · from appointment' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function summary(s: BackupStats): string {
  return `${s.clients} clients, ${s.checkIns} check-ins, ${s.plans} plans, ${s.meals} meals, ${s.photos} photos, ${s.prospects} prospects`;
}
