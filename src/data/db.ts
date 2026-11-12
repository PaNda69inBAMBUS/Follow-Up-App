import Dexie, { type Table } from 'dexie';
import type { Client, ClientTask, FollowUp, Meal, NutritionPlan, Photo, Prospect } from './types';

/** A table whose records get an auto-increment number id. */
type EntityTable<T> = Table<T, number>;

/**
 * The on-phone database (IndexedDB, via Dexie).
 * When the shape of the data changes later, add a new `this.version(n)` block below
 * instead of editing the existing one — that is what keeps old data on the phone readable.
 */
export class AppDb extends Dexie {
  clients!: EntityTable<Client>;
  followUps!: EntityTable<FollowUp>;
  plans!: EntityTable<NutritionPlan>;
  meals!: EntityTable<Meal>;
  tasks!: EntityTable<ClientTask>;
  prospects!: EntityTable<Prospect>;
  photos!: EntityTable<Photo>;

  constructor(name = 'client_tracker') {
    super(name);
    // Only indexed fields are listed; every other field is still stored.
    this.version(1).stores({
      clients: '++id, name',
      followUps: '++id, clientId, date',
      plans: '++id, clientId',
      meals: '++id, planId',
      tasks: '++id, clientId',
      prospects: '++id, appointmentDate',
      photos: '++id',
    });
  }

  /** Every table, for transactions that touch all data (restore, delete client). */
  get allTables() {
    return [this.clients, this.followUps, this.plans, this.meals, this.tasks, this.prospects, this.photos];
  }
}
