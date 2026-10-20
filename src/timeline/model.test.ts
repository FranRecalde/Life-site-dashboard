import assert from 'node:assert/strict';
import test from 'node:test';
import seed from './seed.json';
import { conflicts, initialPlan, localDate, progress, reconcile, taskDate, zonedISO } from './model';

const projectId = seed.projects[0].id;
const projects = [{ id: projectId, name: 'Downstairs toilet' }, { id: 'other', name: 'Other' }, { id: 'inbox', name: 'Renamed collection', is_inbox_project: true }];
const now = new Date('2026-10-20T09:00:00Z');
test('seed has 78 references, 75 actionable steps, 11 projects and valid constraints', () => {
  assert.equal(seed.tasks.length, 78); assert.equal(seed.projects.length, 11);
  assert.equal(seed.tasks.filter(t => !t.grouping).length, 75);
  const plan = initialPlan(); assert.deepEqual(conflicts(plan), []);
  assert.equal(plan.blocks.filter(b => b.kind === 'Teaching').length, 3);
  assert.equal(plan.blocks.filter(b => b.date === '2026-10-26').reduce((sum, b) => sum + b.activeMinutes, 0), 570);
  assert.equal(plan.blocks.filter(b => b.date === '2026-10-20').reduce((sum, b) => sum + b.activeMinutes, 0), 90);
});
test('progress counts each actionable ID once and refuses incomplete-history percentages', () => {
  const result = reconcile([{ id: 'a', project_id: projectId, content: 'A' }], [{ task_id: 'b', project_id: projectId, content: 'B' }, { task_id: 'b', project_id: projectId, content: 'B' }], projects, initialPlan(), now);
  const tasks = result.tasks.filter(t => !t.missing);
  assert.deepEqual(progress(tasks, true), { done: 1, total: 2, percent: 50 });
  assert.equal(progress(tasks, false).percent, null);
  assert.equal(progress([], true).percent, null);
  assert.equal(progress(result.tasks, true).percent, null);
  const group = { ...tasks[0], id: '6hpVFvVMWCw3HFr3' };
  const actionableParent = { ...tasks[0], id: '6hpVHPPfqR6pGFR3' };
  assert.equal(progress([...tasks, tasks[0], group, actionableParent], true).total, 3);
});
test('Inbox exclusion uses identity, Today is independent, selected projects do not duplicate', () => {
  const result = reconcile([
    { id: 'in', project_id: 'inbox', due: { date: '2026-10-20' } },
    { id: 'selected', project_id: projectId, due: { date: '2026-10-20' } },
    { id: 'today', project_id: 'other', due: { date: '2026-10-20', is_recurring: true } },
    { id: 'overdue', project_id: 'other', due: { date: '2026-10-19' } },
    { id: 'undated', project_id: 'other' },
  ], [], projects, initialPlan(), now);
  assert.deepEqual(result.todayTasks.map(t => t.id), ['today']);
  assert.equal(result.tasks.filter(t => t.id === 'selected').length, 1);
  assert.ok(![...result.tasks, ...result.todayTasks].some(t => t.id === 'in'));
});
test('recurring completion acknowledgement survives advancing due and expires at local midnight', () => {
  const plan = initialPlan();
  const prior = reconcile([{ id: 'rec', project_id: 'other', content: 'Daily', due: { date: '2026-10-20', is_recurring: true } }], [], projects, plan, now).todayTasks[0];
  plan.occurrences['2026-10-20:rec'] = { ...prior, completed: true };
  const raw = [{ id: 'rec', project_id: 'other', content: 'Daily', due: { date: '2026-10-21', is_recurring: true } }];
  const result = reconcile(raw, [], projects, plan, now);
  assert.equal(result.todayTasks.length, 1); assert.equal(result.todayTasks[0].completed, true);
  const tomorrow = reconcile(raw, [], projects, plan, new Date('2026-10-20T23:00:00Z'));
  assert.equal(tomorrow.today, '2026-10-21'); assert.equal(tomorrow.todayTasks[0].completed, false);
});
test('London midnight and DST do not shift local work blocks', () => {
  assert.equal(taskDate({ due: { date: '2026-10-20T23:30:00Z' } } as any, 'Europe/London'), '2026-10-21');
  assert.equal(localDate(new Date('2026-10-24T23:30:00Z')), '2026-10-25');
  assert.equal(localDate(new Date('2026-10-25T23:30:00Z')), '2026-10-25');
  assert.equal(zonedISO('2026-10-24', '09:30', 'Europe/London'), '2026-10-24T08:30:00.000Z');
  assert.equal(zonedISO('2026-10-25', '09:30', 'Europe/London'), '2026-10-25T09:30:00.000Z');
});
test('external recurring completion remains acknowledged after Todoist advances due', () => {
  const raw = [{ id: 'rec', project_id: 'other', content: 'Daily', due: { date: '2026-10-21', is_recurring: true } }];
  const result = reconcile(raw, [{ task_id: 'rec', project_id: 'other', completed_at: '2026-10-20T08:00:00Z' }], projects, initialPlan(), now);
  assert.equal(result.todayTasks.length, 1); assert.equal(result.todayTasks[0].completed, true);
});
test('edits detect overlap, incompatible work windows, date restrictions and order', () => {
  const p = initialPlan(); const b = p.blocks.find(b => b.taskId === '6hpVFvV55Fgf7443')!;
  p.blocks.push({ ...b, id: 'overlap' }); assert.ok(conflicts(p).some(c => c.includes('overlaps')));
  p.blocks.pop(); b.date = '2026-10-26'; b.kind = 'Visit'; assert.ok(conflicts(p).some(c => c.includes('computer-only')));
  b.date = '2026-10-21'; b.start = '05:00'; b.end = '05:15'; assert.ok(conflicts(p).some(c => c.includes('window')));
  const q = initialPlan(); const paint = q.blocks.find(b => b.taskId === '6hpVFvV7hhgVV6cV')!; paint.date = '2026-10-21';
  assert.ok(conflicts(q).some(c => c.includes('Dependency')));
});
