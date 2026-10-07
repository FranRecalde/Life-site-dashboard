import React, { useState } from 'react';
import { TodoistTask, DashboardContext, CreateTodoistTaskOptions } from '../types';
import { ContextTabs } from './ContextTabs';
import { TaskChecklistRow, TaskChecklistActions } from './TaskChecklistRow';
import { localDateKey, rundownTasks } from './calendarWorkflow';

export function DailyRundown({ tasks, activeContext, onContextChange, onAddTask, lastUpdated, loading, unavailable, ...actions }: TaskChecklistActions & {
  tasks: TodoistTask[];
  activeContext: DashboardContext;
  onContextChange: (context: DashboardContext) => void;
  onAddTask: (content: string, context: 'personal' | 'professional', options: CreateTodoistTaskOptions) => Promise<void>;
  lastUpdated: string;
  loading: boolean;
  unavailable?: string;
}) {
  const today = localDateKey(new Date());
  const [day, setDay] = useState(today);
  const [upcoming, setUpcoming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(1);
  const [context, setContext] = useState<'personal' | 'professional'>('personal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const items = rundownTasks(tasks, day, today, upcoming);
  const changeDay = (offset: number) => {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + offset);
    setDay(localDateKey(date));
    setUpcoming(false);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving || actions.isOffline) return;
    setSaving(true);
    setError('');
    try {
      await onAddTask(title.trim(), activeContext === 'combined' ? context : activeContext, { dueDate: day, description: description.trim() || undefined, priority });
      setTitle(''); setDescription(''); setPriority(1); setAdding(false);
    } catch {
      setError('Could not save to Todoist. Check your connection in Settings and try again. Your draft is retained.');
    } finally { setSaving(false); }
  };
  const buttonClass = 'px-3 py-2 border border-[var(--color-divider)] rounded-lg disabled:opacity-50';
  return <section className="space-y-5 p-4 sm:p-6 rounded-xl bg-[var(--color-card)] border border-[var(--color-divider)]">
    <h1 className="text-2xl font-display">Rundown of the Day</h1>
    <p className="text-sm text-[var(--color-secondary)]">{new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {upcoming ? 'Upcoming Todoist tasks from this date' : day === today ? "Today's and overdue Todoist tasks" : 'Todoist tasks due on this date'}</p>
    <div className="flex flex-wrap items-center gap-2" aria-label="Rundown date navigation">
      <button type="button" className={buttonClass} onClick={() => changeDay(-1)}>Previous day</button>
      <input type="date" aria-label="Rundown date" className={buttonClass} value={day} onChange={e => { if (e.target.value) { setDay(e.target.value); setUpcoming(false); } }} />
      <button type="button" className={buttonClass} onClick={() => changeDay(1)}>Next day</button>
      <button type="button" className={buttonClass} onClick={() => { setDay(today); setUpcoming(false); }}>Today</button>
      <button type="button" className={buttonClass} aria-pressed={upcoming} onClick={() => setUpcoming(!upcoming)}>Upcoming</button>
      <button type="button" className={buttonClass} aria-expanded={adding} onClick={() => { setAdding(!adding); setContext(activeContext === 'professional' ? 'professional' : 'personal'); }}>Add task</button>
    </div>
    <ContextTabs activeTab={activeContext} setActiveTab={onContextChange} lastUpdated={lastUpdated} />
    {actions.isOffline && <p role="status">Offline. Reconnect to save or complete tasks.</p>}
    {unavailable && <p role="alert" className="text-sm text-[var(--color-warning)]">{unavailable}</p>}
    {adding && <form onSubmit={submit} className="space-y-3 border border-[var(--color-divider)] p-3 rounded-lg" aria-label="Add rundown task">
      <p>New task due {day}. Save to sync with Todoist.</p>
      <label className="block">Task title<input autoFocus required maxLength={500} className="block w-full border p-2 rounded" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block">Description<textarea className="block w-full border p-2 rounded" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="block">Priority<select className={buttonClass} value={priority} onChange={e => setPriority(Number(e.target.value))}>{[1,2,3,4].map(value => <option key={value} value={value}>{5-value} {value === 1 ? '(normal)' : value === 4 ? '(urgent)' : ''}</option>)}</select></label>
      {activeContext === 'combined' && <label className="block">Task context<select className={buttonClass} value={context} onChange={e => setContext(e.target.value as 'personal' | 'professional')}><option value="personal">Personal</option><option value="professional">Professional</option></select></label>}
      {error && <p role="alert">{error}</p>}
      <button className={buttonClass} disabled={saving || actions.isOffline || !title.trim()} type="submit">{saving ? 'Saving…' : 'Save task'}</button>
      <button className={buttonClass} disabled={saving} type="button" onClick={() => setAdding(false)}>Cancel</button>
    </form>}
    <p className="text-sm text-[var(--color-secondary)]">Select a task to edit its date, title, priority or project, and view comments and subtasks.</p>
    {loading && <p role="status">Updating checklist…</p>}
    {!loading && !unavailable && items.length === 0 && <p>No tasks {upcoming ? 'scheduled from this date' : 'due on this date'}. Use Add task to plan this day.</p>}
    <ul className="space-y-2" aria-label="Daily to-do checklist">
      {items.map(task => <li key={task.id}><TaskChecklistRow task={task} {...actions} /></li>)}
    </ul>
  </section>;
}
