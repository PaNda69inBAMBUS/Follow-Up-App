/*
 * Everything the screens do with data goes through here — mirrors the Android app's
 * Repository.kt so both apps behave the same (cascading deletes, one current plan, …).
 */
import type { AppDb } from './db';
import { addDays, today, type LocalDate } from './dates';
import {
  DEFAULT_INTERVAL_DAYS,
  defaultTasks,
  newClient,
  newFollowUp,
  type Client,
  type ClientTask,
  type FollowUp,
  type FollowUpWithClient,
  type Meal,
  type NutritionPlan,
  type Prospect,
} from './types';

/** Case-insensitive name order that also handles diacritics (Ș, Ț, Ă…). */
export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export class Repository {
  constructor(readonly db: AppDb) {}

  // ---- Clients ----
  async clients(): Promise<Client[]> {
    return (await this.db.clients.toArray()).sort(byName);
  }

  getClient(id: number): Promise<Client | undefined> {
    return this.db.clients.get(id);
  }

  /** Saves a client; optionally schedules their first follow-up. Returns the client id. */
  saveClient(client: Client, scheduleFirstFollowUpOn: LocalDate | null = null): Promise<number> {
    return this.db.transaction('rw', this.db.clients, this.db.followUps, async () => {
      const id = await this.db.clients.put(client);
      if (scheduleFirstFollowUpOn) {
        await this.db.followUps.add(newFollowUp({ clientId: id, date: scheduleFirstFollowUpOn }));
      }
      return id;
    });
  }

  /** Deletes a client with all their follow-ups, plans, meals, program and photo. */
  deleteClient(clientId: number): Promise<void> {
    const { db } = this;
    return db.transaction('rw', db.allTables, async () => {
      const client = await db.clients.get(clientId);
      if (!client) return;
      const planIds = (await db.plans.where('clientId').equals(clientId).primaryKeys()) as number[];
      await db.meals.where('planId').anyOf(planIds).delete();
      await db.plans.where('clientId').equals(clientId).delete();
      await db.followUps.where('clientId').equals(clientId).delete();
      await db.tasks.where('clientId').equals(clientId).delete();
      if (client.photoId != null) await db.photos.delete(client.photoId);
      await db.clients.delete(clientId);
    });
  }

  /** Replaces (or removes, with null) a client's photo and deletes the old one. */
  setClientPhoto(clientId: number, photo: { data: ArrayBuffer; type: string } | null): Promise<void> {
    const { db } = this;
    return db.transaction('rw', db.clients, db.photos, async () => {
      const client = await db.clients.get(clientId);
      if (!client) return;
      const photoId = photo ? await db.photos.add(photo) : null;
      await db.clients.update(clientId, { photoId });
      if (client.photoId != null) await db.photos.delete(client.photoId);
    });
  }

  // ---- Follow-ups ----
  async followUpsFor(clientId: number): Promise<FollowUp[]> {
    const list = await this.db.followUps.where('clientId').equals(clientId).toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  getFollowUp(id: number): Promise<FollowUp | undefined> {
    return this.db.followUps.get(id);
  }

  /** Open follow-ups of active clients, soonest first. */
  async pendingFollowUps(): Promise<FollowUpWithClient[]> {
    const clients = new Map((await this.db.clients.toArray()).map((c) => [c.id!, c]));
    return (await this.db.followUps.toArray())
      .filter((f) => !f.completed && clients.get(f.clientId)?.status === 'ACTIVE')
      .map((f) => ({ followUp: f, clientName: clients.get(f.clientId)!.name }))
      .sort((a, b) => a.followUp.date.localeCompare(b.followUp.date) || byName({ name: a.clientName }, { name: b.clientName }));
  }

  /** The 100 most recent completed check-ins, newest first. */
  async recentCompletedFollowUps(): Promise<FollowUpWithClient[]> {
    const clients = new Map((await this.db.clients.toArray()).map((c) => [c.id!, c]));
    return (await this.db.followUps.toArray())
      .filter((f) => f.completed && clients.has(f.clientId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100)
      .map((f) => ({ followUp: f, clientName: clients.get(f.clientId)!.name }));
  }

  /** Every completed check-in (activity chart + "most active"). */
  async completedFollowUps(): Promise<FollowUp[]> {
    return (await this.db.followUps.toArray()).filter((f) => f.completed);
  }

  saveFollowUp(followUp: FollowUp, scheduleNextOn: LocalDate | null = null): Promise<void> {
    return this.db.transaction('rw', this.db.followUps, async () => {
      await this.db.followUps.put(followUp);
      if (scheduleNextOn) {
        await this.db.followUps.add(newFollowUp({ clientId: followUp.clientId, date: scheduleNextOn }));
      }
    });
  }

  /** Marks a follow-up as done and returns the suggested date for the next one. */
  async completeFollowUp(followUp: FollowUp): Promise<LocalDate> {
    await this.db.followUps.put({ ...followUp, completed: true });
    const interval = (await this.db.clients.get(followUp.clientId))?.followUpIntervalDays ?? DEFAULT_INTERVAL_DAYS;
    return addDays(today(), interval);
  }

  async scheduleFollowUp(clientId: number, date: LocalDate): Promise<void> {
    await this.db.followUps.add(newFollowUp({ clientId, date }));
  }

  deleteFollowUp(id: number): Promise<void> {
    return this.db.followUps.delete(id);
  }

  // ---- Nutrition ----
  /** A client's plans: the current one first, then newest first. */
  async plansFor(clientId: number): Promise<NutritionPlan[]> {
    const list = await this.db.plans.where('clientId').equals(clientId).toArray();
    return list.sort((a, b) => Number(b.active) - Number(a.active) || b.startDate.localeCompare(a.startDate));
  }

  getPlan(id: number): Promise<NutritionPlan | undefined> {
    return this.db.plans.get(id);
  }

  async activePlans(): Promise<NutritionPlan[]> {
    return (await this.db.plans.toArray()).filter((p) => p.active);
  }

  async mealsForPlan(planId: number): Promise<Meal[]> {
    return (await this.db.meals.where('planId').equals(planId).toArray()).sort((a, b) => a.position - b.position);
  }

  /** All meals of all plans of one client (for the plan cards). */
  async mealsForClient(clientId: number): Promise<Meal[]> {
    const planIds = (await this.db.plans.where('clientId').equals(clientId).primaryKeys()) as number[];
    return (await this.db.meals.where('planId').anyOf(planIds).toArray()).sort((a, b) => a.position - b.position);
  }

  /**
   * Saves a plan together with its meals (replacing the old meals).
   * If the plan is marked as current, every other plan of that client becomes past.
   */
  savePlan(plan: NutritionPlan, meals: Meal[]): Promise<number> {
    const { db } = this;
    return db.transaction('rw', db.plans, db.meals, async () => {
      const id = await db.plans.put(plan);
      await db.meals.where('planId').equals(id).delete();
      await db.meals.bulkAdd(meals.map(({ id: _old, ...m }, i) => ({ ...m, planId: id, position: i })));
      if (plan.active) {
        await db.plans
          .where('clientId')
          .equals(plan.clientId)
          .and((p) => p.id !== id && p.active)
          .modify({ active: false });
      }
      return id;
    });
  }

  deletePlan(planId: number): Promise<void> {
    const { db } = this;
    return db.transaction('rw', db.plans, db.meals, async () => {
      await db.meals.where('planId').equals(planId).delete();
      await db.plans.delete(planId);
    });
  }

  /** Most recent weight known for a client (latest check-in, else start weight). */
  async latestWeight(clientId: number): Promise<number | null> {
    const client = await this.db.clients.get(clientId);
    if (!client) return null;
    const latest = (await this.db.followUps.where('clientId').equals(clientId).toArray())
      .filter((f) => f.completed && f.weight != null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return latest?.weight ?? client.startWeight;
  }

  // ---- Follow-up program checklist ----
  async tasksFor(clientId: number): Promise<ClientTask[]> {
    return (await this.db.tasks.where('clientId').equals(clientId).toArray()).sort((a, b) => a.position - b.position);
  }

  /** Gives a client the default program the first time it is opened. */
  ensureTasks(clientId: number): Promise<void> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      if ((await this.db.tasks.where('clientId').equals(clientId).count()) === 0) {
        await this.db.tasks.bulkAdd(defaultTasks(clientId));
      }
    });
  }

  async setTaskDone(task: ClientTask, done: boolean, date: LocalDate = today()): Promise<void> {
    await this.db.tasks.update(task.id!, { done, doneDate: done ? date : null });
  }

  async setTaskDate(task: ClientTask, date: LocalDate): Promise<void> {
    await this.db.tasks.update(task.id!, { done: true, doneDate: date });
  }

  /** Saves the order the user dragged the tasks into. Only positions change, so a stale list can't undo a tick. */
  async saveTaskOrder(ordered: ClientTask[]): Promise<void> {
    await this.db.tasks.bulkUpdate(ordered.map((t, i) => ({ key: t.id!, changes: { position: i } })));
  }

  // ---- Prospects ----
  /** All prospects, by appointment date then name. */
  async prospects(): Promise<Prospect[]> {
    return (await this.db.prospects.toArray()).sort(
      (a, b) => a.appointmentDate.localeCompare(b.appointmentDate) || byName(a, b),
    );
  }

  getProspect(id: number): Promise<Prospect | undefined> {
    return this.db.prospects.get(id);
  }

  saveProspect(prospect: Prospect): Promise<number> {
    return this.db.prospects.put(prospect);
  }

  deleteProspect(id: number): Promise<void> {
    return this.db.prospects.delete(id);
  }

  /** The prospect bought: creates an active client from them and removes the prospect. Returns the client id. */
  convertProspect(prospect: Prospect): Promise<number> {
    const { db } = this;
    return db.transaction('rw', db.clients, db.prospects, async () => {
      const clientId = await db.clients.add(
        newClient({
          name: prospect.name,
          phone: prospect.phone,
          email: prospect.email,
          startDate: today(),
          notes: prospect.notes,
          fromAppointment: prospect.appointmentDate,
        }),
      );
      if (prospect.id != null) await db.prospects.delete(prospect.id);
      return clientId;
    });
  }
}
