import { describe, expect, it } from 'vitest';
import { AppDb } from './db';
import { addDays, today } from './dates';
import { Repository } from './repository';
import { newClient, newFollowUp, type NutritionPlan } from './types';

let dbCounter = 0;
const freshRepo = () => new Repository(new AppDb(`repo-test-${dbCounter++}`));

const plan = (clientId: number, title: string, active: boolean): NutritionPlan => ({
  clientId, title, startDate: '2026-10-01', calories: null, proteinG: null, carbsG: null, fatG: null,
  details: '', active, startWeight: null, endWeight: null,
});

describe('Repository', () => {
  it('sorts clients by name ignoring case and diacritics', async () => {
    const repo = freshRepo();
    for (const name of ['bogdan', 'Ștefan', 'Ana', 'sorin']) {
      await repo.saveClient(newClient({ name, startDate: '2026-01-01' }));
    }
    expect((await repo.clients()).map((c) => c.name)).toEqual(['Ana', 'bogdan', 'sorin', 'Ștefan']);
  });

  it('schedules the first follow-up when asked', async () => {
    const repo = freshRepo();
    const id = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01' }), '2026-01-15');
    expect((await repo.followUpsFor(id)).map((f) => f.date)).toEqual(['2026-01-15']);
  });

  it('lists pending follow-ups only for active clients, soonest first', async () => {
    const repo = freshRepo();
    const a = await repo.saveClient(newClient({ name: 'Active', startDate: '2026-01-01' }));
    const b = await repo.saveClient(newClient({ name: 'Inactive', startDate: '2026-01-01', status: 'INACTIVE' }));
    await repo.scheduleFollowUp(a, '2026-03-01');
    await repo.scheduleFollowUp(a, '2026-02-01');
    await repo.scheduleFollowUp(b, '2026-01-20');
    await repo.saveFollowUp(newFollowUp({ clientId: a, date: '2026-01-10', completed: true }));
    const pending = await repo.pendingFollowUps();
    expect(pending.map((p) => [p.clientName, p.followUp.date])).toEqual([
      ['Active', '2026-02-01'],
      ['Active', '2026-03-01'],
    ]);
  });

  it('completing a follow-up suggests the next date from the client interval', async () => {
    const repo = freshRepo();
    const id = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01', followUpIntervalDays: 10 }));
    await repo.scheduleFollowUp(id, today());
    const [f] = await repo.followUpsFor(id);
    expect(await repo.completeFollowUp(f)).toBe(addDays(today(), 10));
    expect((await repo.getFollowUp(f.id!))?.completed).toBe(true);
  });

  it('keeps only one current nutrition plan per client and replaces meals', async () => {
    const repo = freshRepo();
    const c = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01' }));
    const other = await repo.saveClient(newClient({ name: 'B', startDate: '2026-01-01' }));
    const p1 = await repo.savePlan(plan(c, 'One', true), []);
    const pOther = await repo.savePlan(plan(other, 'Other', true), []);
    const meal = { planId: 0, type: 'LUNCH' as const, time: '', foods: 'x', calories: null, proteinG: null, carbsG: null, fatG: null, position: 5 };
    const p2 = await repo.savePlan(plan(c, 'Two', true), [meal, { ...meal, type: 'DINNER' }]);

    expect((await repo.getPlan(p1))?.active).toBe(false);
    expect((await repo.getPlan(p2))?.active).toBe(true);
    expect((await repo.getPlan(pOther))?.active).toBe(true); // other clients untouched
    expect((await repo.mealsForPlan(p2)).map((m) => [m.type, m.position])).toEqual([['LUNCH', 0], ['DINNER', 1]]);

    await repo.savePlan({ ...plan(c, 'Two', true), id: p2 }, [meal]);
    expect(await repo.mealsForPlan(p2)).toHaveLength(1);
  });

  it('deleting a client removes everything that belongs to them', async () => {
    const repo = freshRepo();
    const keep = await repo.saveClient(newClient({ name: 'Keep', startDate: '2026-01-01' }), '2026-02-01');
    const gone = await repo.saveClient(newClient({ name: 'Gone', startDate: '2026-01-01' }), '2026-02-01');
    await repo.setClientPhoto(gone, { data: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg' });
    await repo.savePlan(plan(gone, 'P', true), [
      { planId: 0, type: 'LUNCH', time: '', foods: '', calories: null, proteinG: null, carbsG: null, fatG: null, position: 0 },
    ]);
    await repo.ensureTasks(gone);
    await repo.ensureTasks(keep);

    await repo.deleteClient(gone);
    const { db } = repo;
    expect((await repo.clients()).map((c) => c.name)).toEqual(['Keep']);
    expect(await db.followUps.count()).toBe(1);
    expect(await db.plans.count()).toBe(0);
    expect(await db.meals.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    expect(await db.tasks.count()).toBe(14);
  });

  it('replacing a photo deletes the old one', async () => {
    const repo = freshRepo();
    const id = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01' }));
    await repo.setClientPhoto(id, { data: new Uint8Array([1]).buffer, type: 'image/jpeg' });
    await repo.setClientPhoto(id, { data: new Uint8Array([2]).buffer, type: 'image/jpeg' });
    expect(await repo.db.photos.count()).toBe(1);
    await repo.setClientPhoto(id, null);
    expect(await repo.db.photos.count()).toBe(0);
    expect((await repo.getClient(id))?.photoId).toBeNull();
  });

  it('gives each client the 14-item default program once', async () => {
    const repo = freshRepo();
    const id = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01' }));
    await repo.ensureTasks(id);
    await repo.ensureTasks(id);
    const tasks = await repo.tasksFor(id);
    expect(tasks).toHaveLength(14);
    expect(tasks[0]).toMatchObject({ kind: 'NUTRITION_ASSIGNMENT', number: 1, position: 0 });
    expect(tasks[13]).toMatchObject({ kind: 'THE_OPEN', position: 13 });

    await repo.setTaskDone(tasks[0], true, '2026-03-03');
    await repo.saveTaskOrder([tasks[13], ...tasks.slice(0, 13)]);
    const after = await repo.tasksFor(id);
    expect(after[0].kind).toBe('THE_OPEN');
    expect(after[1]).toMatchObject({ number: 1, done: true, doneDate: '2026-03-03' });
  });

  it('converting a prospect creates a client that remembers the appointment', async () => {
    const repo = freshRepo();
    const pid = await repo.saveProspect({
      name: 'Maria', phone: '0700', email: '', status: 'APPOINTMENT', appointmentDate: '2026-11-05',
      appointmentTime: '15:00', notes: 'note', createdDate: '2026-11-01',
    });
    const clientId = await repo.convertProspect((await repo.getProspect(pid))!);
    expect(await repo.prospects()).toEqual([]);
    expect(await repo.getClient(clientId)).toMatchObject({
      name: 'Maria', phone: '0700', notes: 'note', status: 'ACTIVE', fromAppointment: '2026-11-05', startDate: today(),
    });
  });

  it('latest weight comes from the newest completed check-in, else the start weight', async () => {
    const repo = freshRepo();
    const id = await repo.saveClient(newClient({ name: 'A', startDate: '2026-01-01', startWeight: 90 }));
    expect(await repo.latestWeight(id)).toBe(90);
    await repo.saveFollowUp(newFollowUp({ clientId: id, date: '2026-02-01', completed: true, weight: 88 }));
    await repo.saveFollowUp(newFollowUp({ clientId: id, date: '2026-03-01', completed: true, weight: 86.5 }));
    await repo.saveFollowUp(newFollowUp({ clientId: id, date: '2026-04-01', completed: false, weight: 80 }));
    expect(await repo.latestWeight(id)).toBe(86.5);
  });
});
