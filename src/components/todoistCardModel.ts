import type { TodoistTask } from '../types';

export type CardView = 'today' | 'inbox';

export function localDate(date: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function taskDay(task: TodoistTask, timeZone?: string): string | undefined {
  const due = task.dueDatetime || task.dueDate;
  if (!due) return undefined;
  // API v1 can include time in due.date. Floating times are local wall-clock times.
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(due)) {
    const date = new Date(due);
    return Number.isNaN(date.getTime()) ? undefined : localDate(date, timeZone);
  }
  return due.slice(0, 10);
}

export function cardTasks(tasks: TodoistTask[], view: CardView, inboxId: string | null, now = new Date(), timeZone?: string) {
  const today = localDate(now, timeZone);
  return tasks.filter(task => !task.completed && (view === 'inbox'
    ? inboxId !== null && String(task.projectId) === inboxId
    : !!taskDay(task, timeZone) && taskDay(task, timeZone)! <= today))
    .sort((a, b) => (taskDay(a, timeZone) || '9999').localeCompare(taskDay(b, timeZone) || '9999') || (b.priority || 1) - (a.priority || 1));
}

export function dueLabel(task: TodoistTask): string {
  const due = task.dueDatetime || task.dueDate;
  if (!due) return '';
  if (!due.includes('T')) return due;
  const date = new Date(due);
  return Number.isNaN(date.getTime()) ? due : date.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
