import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyTasks, eventsOnDay, localDateKey, weekDates } from './calendarWorkflow';
import type { CalendarEvent, TodoistTask } from '../types';

test('week uses selected local date, handles Sundays and respects first day', () => {
  const sunday = new Date(2026, 9, 11, 20);
  assert.deepEqual(weekDates(sunday).map(localDateKey), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(localDateKey(weekDates(sunday, 'sunday')[0]), '2026-10-11');
  assert.equal(localDateKey(weekDates(new Date(2027, 0, 1))[0]), '2026-12-28');
});

test('events include every matching event and overnight continuation with exclusive end dates', () => {
  const event = (id: string, start: string, end: string, allDay = false): CalendarEvent => ({ id, start, end, allDay, provider: 'google_calendar', title: id, calendarId: 'primary' });
  const events = [
    event('overnight', '2026-10-06T23:00:00', '2026-10-07T01:00:00'),
    event('ended', '2026-10-06T22:00:00', '2026-10-07T00:00:00'),
    event('all-day', '2026-10-06', '2026-10-08', true),
    event('ended-all-day', '2026-10-06', '2026-10-07', true),
    ...Array.from({ length: 5 }, (_, i) => event(String(i), '2026-10-07T09:00:00', '2026-10-07T10:00:00')),
  ];
  assert.deepEqual(eventsOnDay(events, new Date(2026, 9, 7)).map(event => event.id), ['overnight', 'all-day', '0', '1', '2', '3', '4']);
});

test('daily checklist includes independently due subtasks, excludes future and undated tasks', () => {
  const task = (id: string, dueDate?: string, completed = false, parentId?: string): TodoistTask => ({ id, title: id, provider: 'todoist', dueDate, completed, parentId, labels: [], isOverdue: false });
  assert.deepEqual(dailyTasks([task('future', '2026-10-08'), task('today', '2026-10-07'), task('done', '2026-10-07', true), task('undated'), task('overdue', '2026-10-06'), task('child', '2026-10-07', false, 'today')], new Date(2026, 9, 7)).map(task => task.id), ['overdue', 'today', 'child', 'done']);
});

test('rundown selects local date, upcoming projects, overdue today and excludes completed children', async () => {
  const { rundownTasks } = await import('./calendarWorkflow');
  const task = (id: string, dueDate: string, extra = {}): TodoistTask => ({id, title:id, provider:'todoist', labels:[], completed:false, isOverdue:false, dueDate, ...extra});
  const tasks = [task('tomorrow','2026-10-08T09:00:00',{projectId:'non-inbox'}),task('today','2026-10-07'),task('overdue','2026-10-06',{isOverdue:true}),task('child','2026-10-08',{parentId:'tomorrow'}),task('done','2026-10-08',{completed:true}),task('later','2026-10-09')];
  assert.deepEqual(rundownTasks(tasks,'2026-10-07','2026-10-07').map(t=>t.id),['overdue','today']);
  assert.deepEqual(rundownTasks(tasks,'2026-10-08','2026-10-07').map(t=>t.id),['tomorrow']);
  assert.deepEqual(rundownTasks(tasks,'2026-10-08','2026-10-07',true).map(t=>t.id),['tomorrow','later']);
  assert.deepEqual(rundownTasks(tasks,'2026-10-06','2026-10-07').map(t=>t.id),['overdue']);
});
