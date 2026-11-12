import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppDb } from './db';
import { BackupError, exportBackup, readBackup, restoreBackup } from './backup';
import { Repository } from './repository';

const androidBackup = readFileSync(new URL('./__fixtures__/android-backup.json', import.meta.url), 'utf8');

let dbCounter = 0;
const freshDb = () => new AppDb(`test-${dbCounter++}`);

/** Parses a backup and drops the export time, so two backups can be compared. */
const comparable = (json: string) => {
  const o = JSON.parse(json);
  delete o.exportedAt;
  return o;
};

describe('reading an Android backup', () => {
  const content = readBackup(androidBackup);

  it('counts everything in the file', () => {
    expect(content.exportedAt).toBe('2026-11-10T09:30:00');
    expect(content.stats).toEqual({ clients: 2, checkIns: 3, plans: 2, meals: 3, photos: 1, prospects: 2 });
  });

  it('reads client fields, including the escaped "/" Android writes', () => {
    const ana = content.clients[0].client;
    expect(ana).toMatchObject({
      name: 'Ana Popescu',
      startWeight: 78.4,
      startMuscleMass: 26,
      notes: 'Prefers mornings / no dairy',
      fromAppointment: '2026-08-28',
      status: 'ACTIVE',
    });
    expect(content.clients[1].client).toMatchObject({
      name: 'Ștefan Ionescu',
      status: 'INACTIVE',
      startWeight: null,
      fromAppointment: null,
      followUpIntervalDays: 21,
    });
  });

  it('decodes the photo to JPEG bytes', () => {
    const bytes = new Uint8Array(content.clients[0].photo!);
    expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('keeps meals and program in file order', () => {
    const phase2 = content.clients[0].plans[1];
    expect(phase2.plan).toMatchObject({ title: 'Phase 2', active: true, carbsG: null, calories: 1650 });
    expect(phase2.meals.map((m) => m.type)).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);
    expect(content.clients[0].tasks.map((t) => t.kind)).toEqual([
      'NUTRITION_ASSIGNMENT', 'NUTRITION_ASSIGNMENT', 'FIT_CLUB', 'PERSONALISED_PLAN',
    ]);
  });
});

describe('tolerant reading (same rules as Android)', () => {
  it('rejects files that are not backups', () => {
    expect(() => readBackup('hello')).toThrow(BackupError);
    expect(() => readBackup('{"app":"Other","clients":[]}')).toThrow(BackupError);
    expect(() => readBackup('{"app":"ClientTracker"}')).toThrow(BackupError);
  });

  it('accepts a byte-order mark and a missing prospects list', () => {
    const c = readBackup('﻿  {"app":"ClientTracker","clients":[{"name":"X"}]}');
    expect(c.stats.clients).toBe(1);
    expect(c.prospects).toEqual([]);
    expect(c.clients[0].client.followUpIntervalDays).toBe(14);
  });

  it('skips bad entries and falls back on unknown values', () => {
    const c = readBackup(JSON.stringify({
      app: 'ClientTracker',
      formatVersion: 99,
      futureField: { anything: true },
      clients: [
        { name: '   ' },
        'not an object',
        {
          name: 'Old',
          status: 'PAUSED',
          startDate: 'garbage',
          followUpIntervalDays: 9999,
          startWeight: '80.5',
          photoJpegBase64: '%%%not base64%%%',
          followUps: [{ date: 'bad' }, { date: '2026-02-30' }, { date: '2026-02-28', completed: 'true' }],
          nutritionPlans: [{ title: '' }, { title: 'P', meals: [{ type: 'MIDNIGHT_FEAST' }] }],
          programTasks: [{ kind: 'NEW_THING' }, { kind: 'THE_OPEN', done: true }],
        },
      ],
      prospects: [{ name: 'P', status: 'SOMETHING_NEW', appointmentDate: '2026-12-01' }],
    }));
    expect(c.clients).toHaveLength(1);
    const old = c.clients[0];
    expect(old.client.status).toBe('INACTIVE');
    expect(old.client.followUpIntervalDays).toBe(365);
    expect(old.client.startWeight).toBe(80.5);
    expect(old.client.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(old.photo).toBeNull();
    expect(old.followUps).toEqual([expect.objectContaining({ date: '2026-02-28', completed: true })]);
    expect(old.plans).toHaveLength(1);
    expect(old.plans[0].meals[0].type).toBe('LUNCH');
    expect(old.tasks).toEqual([expect.objectContaining({ kind: 'THE_OPEN', done: true })]);
    expect(old.tasks[0].doneDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.prospects[0].status).toBe('APPOINTMENT');
  });
});

describe('restore and export', () => {
  it('restores everything and exports an identical backup', async () => {
    const db = freshDb();
    await restoreBackup(db, readBackup(androidBackup));

    expect(await db.clients.count()).toBe(2);
    expect(await db.followUps.count()).toBe(3);
    expect(await db.plans.count()).toBe(2);
    expect(await db.meals.count()).toBe(3);
    expect(await db.tasks.count()).toBe(4);
    expect(await db.prospects.count()).toBe(2);
    expect(await db.photos.count()).toBe(1);

    const { json, stats } = await exportBackup(db);
    expect(stats).toEqual({ clients: 2, checkIns: 3, plans: 2, meals: 3, photos: 1, prospects: 2 });
    expect(comparable(json)).toEqual(comparable(androidBackup));
  });

  it('replaces the existing data instead of adding to it', async () => {
    const db = freshDb();
    const repo = new Repository(db);
    await repo.saveClient({
      name: 'Will be gone', phone: '', email: '', startDate: '2026-01-01', goal: '', status: 'ACTIVE',
      startWeight: null, followUpIntervalDays: 14, notes: '', startBodyFat: null, startMuscleMass: null,
      photoId: null, fromAppointment: null,
    });
    await restoreBackup(db, readBackup(androidBackup));
    expect((await repo.clients()).map((c) => c.name)).toEqual(['Ana Popescu', 'Ștefan Ionescu']);
  });

  it('keeps the old data if the restore fails half-way', async () => {
    const db = freshDb();
    await restoreBackup(db, readBackup(androidBackup));
    const other = readBackup('{"app":"ClientTracker","clients":[{"name":"New","nutritionPlans":[{"title":"P","meals":[{}]}]}]}');
    // Make writing meals fail — happens after the old data was cleared and the new client added.
    db.meals.bulkAdd = (() => Promise.reject(new Error('disk full'))) as never;
    await expect(restoreBackup(db, other)).rejects.toThrow('disk full');
    expect((await db.clients.toArray()).map((c) => c.name)).toEqual(['Ana Popescu', 'Ștefan Ionescu']);
    expect(await db.prospects.count()).toBe(2);
    expect(await db.photos.count()).toBe(1);
  });
});
