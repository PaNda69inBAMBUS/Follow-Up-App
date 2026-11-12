/*
 * Backup file — the SAME format as the Android app (data/Backup.kt), so a backup made on
 * one phone can be restored on the other.
 *
 * {
 *   "app": "ClientTracker",
 *   "formatVersion": 1,
 *   "exportedAt": "2026-11-10T09:30:00",
 *   "clients": [ { "name": "...", ..., "photoJpegBase64": "...",
 *                  "followUps": [...], "nutritionPlans": [ { ..., "meals": [...] } ], "programTasks": [...] } ],
 *   "prospects": [ ... ]
 * }
 *
 * Compatibility rules (shared with the Android app):
 *  - Field names never change; new versions only ADD fields.
 *  - Readers ignore fields they don't know and use defaults for missing ones.
 *  - Unknown enum values fall back to a sensible default (or the item is skipped).
 *  - Data is nested (follow-ups inside their client), so no database ids are stored.
 */
import type { AppDb } from './db';
import { nowLocalDateTime, parseDate, today, type LocalDate } from './dates';
import {
  DEFAULT_INTERVAL_DAYS,
  MEAL_TYPES,
  TASK_KINDS,
  type Client,
  type ClientTask,
  type FollowUp,
  type Meal,
  type NutritionPlan,
  type Prospect,
} from './types';

export const APP_ID = 'ClientTracker';
export const FORMAT_VERSION = 1;

export type BackupErrorReason = 'NOT_A_BACKUP' | 'READ_FAILED';

export class BackupError extends Error {
  constructor(readonly reason: BackupErrorReason, cause?: unknown) {
    super(reason, { cause });
  }
}

export interface BackupStats {
  clients: number;
  checkIns: number;
  plans: number;
  meals: number;
  photos: number;
  prospects: number;
}

interface PlanBundle {
  plan: Omit<NutritionPlan, 'id' | 'clientId'>;
  meals: Omit<Meal, 'id' | 'planId'>[];
}

interface ClientBundle {
  client: Omit<Client, 'id' | 'photoId'>;
  photo: ArrayBuffer | null;
  followUps: Omit<FollowUp, 'id' | 'clientId'>[];
  plans: PlanBundle[];
  /** Empty for backups made before the follow-up program existed (defaults are created later). */
  tasks: Omit<ClientTask, 'id' | 'clientId' | 'position'>[];
}

/** A backup read into memory and checked, ready to be restored. */
export interface BackupContent {
  /** 'YYYY-MM-DDTHH:mm:ss', or null if the file doesn't say. */
  exportedAt: string | null;
  clients: ClientBundle[];
  prospects: Omit<Prospect, 'id'>[];
  stats: BackupStats;
}

// ----------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------

/** Builds the backup file text (pretty-printed JSON) from everything in the database. */
export async function exportBackup(db: AppDb): Promise<{ json: string; stats: BackupStats }> {
  return db.transaction('r', db.allTables, async () => {
    const clients = (await db.clients.toArray()).sort((a, b) => a.id! - b.id!);
    const followUps = groupBy(await db.followUps.toArray(), (f) => f.clientId);
    const plans = groupBy(await db.plans.toArray(), (p) => p.clientId);
    const meals = groupBy(await db.meals.toArray(), (m) => m.planId);
    const tasks = groupBy(await db.tasks.toArray(), (t) => t.clientId);
    const prospects = (await db.prospects.toArray()).sort((a, b) => a.id! - b.id!);
    let photoCount = 0;

    const clientsJson = [];
    for (const c of clients) {
      const photo = c.photoId != null ? await db.photos.get(c.photoId) : undefined;
      if (photo) photoCount++;
      clientsJson.push(
        compact({
          name: c.name,
          phone: c.phone,
          email: c.email,
          startDate: c.startDate,
          goal: c.goal,
          status: c.status,
          startWeight: c.startWeight,
          startBodyFat: c.startBodyFat,
          startMuscleMass: c.startMuscleMass,
          followUpIntervalDays: c.followUpIntervalDays,
          notes: c.notes,
          fromAppointment: c.fromAppointment,
          photoJpegBase64: photo ? toBase64(photo.data) : null,
          followUps: (followUps.get(c.id!) ?? [])
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((f) =>
              compact({
                date: f.date,
                completed: f.completed,
                weight: f.weight,
                bodyFat: f.bodyFat,
                muscleMass: f.muscleMass,
                notes: f.notes,
              }),
            ),
          nutritionPlans: (plans.get(c.id!) ?? [])
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((p) =>
              compact({
                title: p.title,
                startDate: p.startDate,
                calories: p.calories,
                protein: p.proteinG,
                carbs: p.carbsG,
                fat: p.fatG,
                notes: p.details,
                current: p.active,
                startWeight: p.startWeight,
                endWeight: p.endWeight,
                meals: (meals.get(p.id!) ?? [])
                  .sort((a, b) => a.position - b.position)
                  .map((m) =>
                    compact({
                      type: m.type,
                      time: m.time,
                      foods: m.foods,
                      calories: m.calories,
                      protein: m.proteinG,
                      carbs: m.carbsG,
                      fat: m.fatG,
                    }),
                  ),
              }),
            ),
          programTasks: (tasks.get(c.id!) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((t) => compact({ kind: t.kind, number: t.number, done: t.done, doneDate: t.doneDate })),
        }),
      );
    }

    const root = {
      app: APP_ID,
      formatVersion: FORMAT_VERSION,
      exportedAt: nowLocalDateTime(),
      clients: clientsJson,
      prospects: prospects.map((p) => ({
        name: p.name,
        phone: p.phone,
        email: p.email,
        status: p.status,
        appointmentDate: p.appointmentDate,
        appointmentTime: p.appointmentTime,
        notes: p.notes,
        createdDate: p.createdDate,
      })),
    };

    const stats: BackupStats = {
      clients: clients.length,
      checkIns: [...followUps.values()].reduce((n, l) => n + l.length, 0),
      plans: [...plans.values()].reduce((n, l) => n + l.length, 0),
      meals: [...meals.values()].reduce((n, l) => n + l.length, 0),
      photos: photoCount,
      prospects: prospects.length,
    };
    return { json: JSON.stringify(root, null, 2), stats };
  });
}

/** File name for a new backup, e.g. ClientTracker-backup-2026-11-12.json */
export function backupFileName(date: LocalDate = today()): string {
  return `ClientTracker-backup-${date}.json`;
}

// ----------------------------------------------------------------------
// Import
// ----------------------------------------------------------------------

/** Reads and checks a backup file's text without changing any data. */
export function readBackup(text: string): BackupContent {
  let root: unknown;
  try {
    root = JSON.parse(text.replace(/^[﻿\s]+/, ''));
  } catch (e) {
    throw new BackupError('NOT_A_BACKUP', e);
  }
  // Accept any formatVersion: unknown fields are ignored, missing ones get defaults.
  if (!isObject(root) || root.app !== APP_ID || !Array.isArray(root.clients)) {
    throw new BackupError('NOT_A_BACKUP');
  }
  const exportedAtRaw = str(root, 'exportedAt');
  const exportedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(exportedAtRaw) ? exportedAtRaw.slice(0, 19) : null;
  const clients = objects(root.clients).map(tryParse(parseClient)).filter(notNull);
  // Missing in backups made before prospects existed → empty list.
  const prospects = objects(root.prospects).map(tryParse(parseProspect)).filter(notNull);

  return {
    exportedAt,
    clients,
    prospects,
    stats: {
      clients: clients.length,
      checkIns: clients.reduce((n, c) => n + c.followUps.length, 0),
      plans: clients.reduce((n, c) => n + c.plans.length, 0),
      meals: clients.reduce((n, c) => n + c.plans.reduce((m, p) => m + p.meals.length, 0), 0),
      photos: clients.filter((c) => c.photo != null).length,
      prospects: prospects.length,
    },
  };
}

/** Reads a backup from a file the user picked. */
export async function readBackupFile(file: Blob): Promise<BackupContent> {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    throw new BackupError('READ_FAILED', e);
  }
  return readBackup(text);
}

/**
 * Replaces ALL data in the app with the backup. Done in one database transaction:
 * if anything fails, the current data stays as it was.
 */
export async function restoreBackup(db: AppDb, content: BackupContent): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    await Promise.all(db.allTables.map((t) => t.clear()));

    await db.prospects.bulkAdd(content.prospects.map((p) => ({ ...p })));

    for (const bundle of content.clients) {
      const photoId = bundle.photo ? await db.photos.add({ data: bundle.photo, type: 'image/jpeg' }) : null;
      const clientId = await db.clients.add({ ...bundle.client, photoId });
      await db.followUps.bulkAdd(bundle.followUps.map((f) => ({ ...f, clientId })));
      await db.tasks.bulkAdd(bundle.tasks.map((t, position) => ({ ...t, clientId, position })));
      for (const pb of bundle.plans) {
        const planId = await db.plans.add({ ...pb.plan, clientId });
        await db.meals.bulkAdd(pb.meals.map((m, position) => ({ ...m, planId, position })));
      }
    }
  });
}

// ----------------------------------------------------------------------
// Tolerant parsing (same rules as the Android app)
// ----------------------------------------------------------------------

type Json = Record<string, unknown>;

function parseClient(o: Json): ClientBundle | null {
  const name = str(o, 'name').trim();
  if (!name) return null;
  const startDate = date(o, 'startDate') ?? today();
  const photoB64 = str(o, 'photoJpegBase64');

  const followUps = objects(o.followUps).flatMap((f) => {
    const d = date(f, 'date');
    if (!d) return [];
    return [{
      date: d,
      completed: bool(f, 'completed', false),
      weight: dbl(f, 'weight'),
      notes: str(f, 'notes'),
      bodyFat: dbl(f, 'bodyFat'),
      muscleMass: dbl(f, 'muscleMass'),
    }];
  });

  const plans = objects(o.nutritionPlans).flatMap((p): PlanBundle[] => {
    const title = str(p, 'title').trim();
    if (!title) return [];
    return [{
      plan: {
        title,
        startDate: date(p, 'startDate') ?? startDate,
        calories: int(p, 'calories'),
        proteinG: int(p, 'protein'),
        carbsG: int(p, 'carbs'),
        fatG: int(p, 'fat'),
        details: str(p, 'notes'),
        active: bool(p, 'current', false),
        startWeight: dbl(p, 'startWeight'),
        endWeight: dbl(p, 'endWeight'),
      },
      meals: objects(p.meals).map((m, position) => ({
        type: MEAL_TYPES.find((t) => t === str(m, 'type')) ?? 'LUNCH',
        time: str(m, 'time'),
        foods: str(m, 'foods'),
        calories: int(m, 'calories'),
        proteinG: int(m, 'protein'),
        carbsG: int(m, 'carbs'),
        fatG: int(m, 'fat'),
        position,
      })),
    }];
  });

  const tasks = objects(o.programTasks).flatMap((t) => {
    // Unknown kinds (from a newer app version) are skipped.
    const kind = TASK_KINDS.find((k) => k === str(t, 'kind'));
    if (!kind) return [];
    const done = bool(t, 'done', false);
    return [{ kind, number: int(t, 'number') ?? 0, done, doneDate: done ? date(t, 'doneDate') ?? today() : null }];
  });

  return {
    client: {
      name,
      phone: str(o, 'phone'),
      email: str(o, 'email'),
      startDate,
      goal: str(o, 'goal'),
      // Old "PAUSED"/"FINISHED" values or anything unknown → INACTIVE.
      status: str(o, 'status', 'ACTIVE') === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      startWeight: dbl(o, 'startWeight'),
      startBodyFat: dbl(o, 'startBodyFat'),
      startMuscleMass: dbl(o, 'startMuscleMass'),
      followUpIntervalDays: clamp(int(o, 'followUpIntervalDays') ?? DEFAULT_INTERVAL_DAYS, 1, 365),
      notes: str(o, 'notes'),
      fromAppointment: date(o, 'fromAppointment'),
    },
    photo: photoB64 ? fromBase64(photoB64) : null,
    followUps,
    plans,
    tasks,
  };
}

function parseProspect(o: Json): Omit<Prospect, 'id'> | null {
  const name = str(o, 'name').trim();
  if (!name) return null;
  return {
    name,
    phone: str(o, 'phone'),
    email: str(o, 'email'),
    status: str(o, 'status') === 'NO_PURCHASE' ? 'NO_PURCHASE' : 'APPOINTMENT',
    appointmentDate: date(o, 'appointmentDate') ?? today(),
    appointmentTime: str(o, 'appointmentTime'),
    notes: str(o, 'notes'),
    createdDate: date(o, 'createdDate') ?? today(),
  };
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const notNull = <T>(v: T | null): v is T => v != null;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A bad entry is skipped instead of failing the whole import (like runCatching on Android). */
const tryParse = <T>(fn: (o: Json) => T | null) => (o: Json): T | null => {
  try {
    return fn(o);
  } catch {
    return null;
  }
};

/** The objects inside a JSON array; anything else (missing, null, not an array) → empty list. */
function objects(v: unknown): Json[] {
  return Array.isArray(v) ? v.filter(isObject) : [];
}

function str(o: Json, key: string, def = ''): string {
  const v = o[key];
  if (v == null) return def;
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : def;
}

function dbl(o: Json, key: string): number | null {
  const v = o[key];
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function int(o: Json, key: string): number | null {
  const n = dbl(o, key);
  return n == null ? null : Math.trunc(n);
}

function bool(o: Json, key: string, def: boolean): boolean {
  const v = o[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return def;
}

function date(o: Json, key: string): LocalDate | null {
  return parseDate(str(o, key).slice(0, 10));
}

/** Drops null/undefined fields, like Android's JSONObject.putOpt. */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
}

function groupBy<T, K>(list: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Decodes base64 (with or without line breaks); null if it's not valid base64. */
function fromBase64(b64: string): ArrayBuffer | null {
  try {
    const binary = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}
