/*
 * The data model — a 1:1 copy of the Android app's Room entities (data/Entities.kt),
 * so backups move between the two apps without losing anything.
 * `id` is undefined until the record is first saved.
 */
import type { LocalDate } from './dates';

export type ClientStatus = 'ACTIVE' | 'INACTIVE';

export interface Client {
  id?: number;
  name: string;
  phone: string;
  email: string;
  startDate: LocalDate;
  goal: string;
  status: ClientStatus;
  /** Weight in kg when the client started. */
  startWeight: number | null;
  /** How often this client should get a follow-up. */
  followUpIntervalDays: number;
  notes: string;
  /** Body fat in % when the client started. */
  startBodyFat: number | null;
  /** Muscle mass in kg when the client started. */
  startMuscleMass: number | null;
  /** Id of the client's photo in the `photos` table. */
  photoId: number | null;
  /** Set when the client was converted from a prospect: the date of their appointment. */
  fromAppointment: LocalDate | null;
}

export interface FollowUp {
  id?: number;
  clientId: number;
  date: LocalDate;
  completed: boolean;
  /** Weight in kg recorded at this check-in. */
  weight: number | null;
  notes: string;
  bodyFat: number | null;
  muscleMass: number | null;
}

/** A follow-up together with the name of the client it belongs to (for cross-client lists). */
export interface FollowUpWithClient {
  followUp: FollowUp;
  clientName: string;
}

export interface NutritionPlan {
  id?: number;
  clientId: number;
  title: string;
  startDate: LocalDate;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** Free-text notes: water, supplements, rules, swaps… */
  details: string;
  /** Only one plan per client is the current one. */
  active: boolean;
  startWeight: number | null;
  endWeight: number | null;
}

/** Meals in the order they happen during the day. */
export const MEAL_TYPES = [
  'BREAKFAST',
  'MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'EVENING_SNACK',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface Meal {
  id?: number;
  planId: number;
  type: MealType;
  /** Optional time of day, free text like "08:00". */
  time: string;
  foods: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** Order within the plan. */
  position: number;
}

export const TASK_KINDS = [
  'NUTRITION_ASSIGNMENT',
  'PERSONALISED_PLAN',
  'FIT_CLUB',
  'SHAKE_PARTY',
  'THE_OPEN',
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** One item of a client's follow-up program. */
export interface ClientTask {
  id?: number;
  clientId: number;
  kind: TaskKind;
  /** For nutrition assignments: 1–10. */
  number: number;
  done: boolean;
  doneDate: LocalDate | null;
  /** Order chosen by the user (drag & drop). */
  position: number;
}

/** The default program every client gets: 10 nutrition assignments + 4 community items. */
export function defaultTasks(clientId: number): ClientTask[] {
  const base = { clientId, done: false, doneDate: null, number: 0 };
  return [
    ...Array.from({ length: 10 }, (_, i) => ({ ...base, kind: 'NUTRITION_ASSIGNMENT' as const, number: i + 1 })),
    ...(['PERSONALISED_PLAN', 'FIT_CLUB', 'SHAKE_PARTY', 'THE_OPEN'] as const).map((kind) => ({ ...base, kind })),
  ].map((t, i) => ({ ...t, position: i }));
}

export const DEFAULT_TASK_COUNT = 14;

/** APPOINTMENT: has an appointment booked. NO_PURCHASE: came to the appointment but did not buy. */
export type ProspectStatus = 'APPOINTMENT' | 'NO_PURCHASE';

export interface Prospect {
  id?: number;
  name: string;
  phone: string;
  email: string;
  status: ProspectStatus;
  /** Appointment date, or the date they came (for NO_PURCHASE). */
  appointmentDate: LocalDate;
  /** Optional time of day, free text like "15:00". */
  appointmentTime: string;
  notes: string;
  createdDate: LocalDate;
}

/** A client photo (JPEG bytes). Kept in its own table so client lists stay light. */
export interface Photo {
  id?: number;
  data: ArrayBuffer;
  type: string;
}

export const DEFAULT_INTERVAL_DAYS = 14;

/** A new client with every optional field empty. */
export function newClient(fields: Pick<Client, 'name' | 'startDate'> & Partial<Client>): Client {
  return {
    phone: '',
    email: '',
    goal: '',
    status: 'ACTIVE',
    startWeight: null,
    followUpIntervalDays: DEFAULT_INTERVAL_DAYS,
    notes: '',
    startBodyFat: null,
    startMuscleMass: null,
    photoId: null,
    fromAppointment: null,
    ...fields,
  };
}

export function newFollowUp(fields: Pick<FollowUp, 'clientId' | 'date'> & Partial<FollowUp>): FollowUp {
  return { completed: false, weight: null, notes: '', bodyFat: null, muscleMass: null, ...fields };
}
