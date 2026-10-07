import { CalendarEvent, TodoistTask } from '../types';

export const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function weekDates(date: Date, firstDay: 'monday' | 'sunday' = 'monday') {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - (start.getDay() - (firstDay === 'monday' ? 1 : 0) + 7) % 7);
  return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export function eventsOnDay(events: CalendarEvent[], day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events.filter(event => event.allDay
    ? event.start.slice(0, 10) <= localDateKey(start) && event.end.slice(0, 10) > localDateKey(start)
    : new Date(event.start) < end && new Date(event.end) > start);
}

export function dailyTasks(tasks: TodoistTask[], date = new Date()) {
  const today = localDateKey(date);
  return tasks.filter(task => task.dueDate && task.dueDate <= today)
    .sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || (a.dueDate || '').localeCompare(b.dueDate || '') || (b.priority || 1) - (a.priority || 1));
}

export function rundownTasks(tasks: TodoistTask[], day: string, today: string, upcoming = false) {
  return tasks.filter(task => {
    if (task.completed || task.parentId || !task.dueDate) return false;
    const due = task.dueDate.slice(0, 10);
    return upcoming ? due >= day : due === day || (day === today && (task.isOverdue || due < today));
  }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}
