import test from 'node:test';
import assert from 'node:assert/strict';
import { cardTasks, dueLabel, taskDay } from './todoistCardModel';
import type { TodoistTask } from '../types';
const task = (id: string, dueDate?: string, extras = {}): TodoistTask => ({ id, provider: 'todoist', title: id, dueDate, labels: [], isOverdue: false, projectId: 'inbox', ...extras });

test('today includes earlier dates, excludes tomorrow/completed; inbox includes undated and future recurring tasks', () => {
  const tasks = [task('overdue','2026-11-03'), task('today','2026-11-04'), task('future','2026-11-05', { recurring: true }), task('undated'), task('done','2026-11-04',{completed:true}),task('other',undefined,{projectId:'other'})];
  const now = new Date('2026-11-04T12:00:00Z');
  assert.deepEqual(cardTasks(tasks,'today','inbox',now,'Europe/London').map(t=>t.id),['overdue','today']);
  assert.deepEqual(new Set(cardTasks(tasks,'inbox','inbox',now).map(t=>t.id)),new Set(['overdue','today','future','undated']));
  assert.deepEqual(cardTasks(tasks,'inbox',null,now),[]);
});
test('timezone boundaries, date-only and floating date-times follow the user day', () => {
  assert.equal(taskDay(task('utc','2026-11-05T00:30:00Z'),'America/Los_Angeles'),'2026-11-04');
  assert.equal(taskDay(task('floating','2026-11-05T00:30:00'),'America/Los_Angeles'),'2026-11-05');
  assert.equal(taskDay(task('date','2026-11-05'),'Pacific/Auckland'),'2026-11-05');
  assert.equal(taskDay(task('bad','bad',{dueDatetime:'invalidTZ'})), undefined);
  assert.equal(dueLabel(task('date','2026-11-05')),'2026-11-05');
});
