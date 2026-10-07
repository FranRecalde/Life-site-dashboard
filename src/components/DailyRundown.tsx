import React from 'react';
import { TodoistTask, DashboardContext } from '../types';
import { ContextTabs } from './ContextTabs';
import { TaskChecklistRow, TaskChecklistActions } from './TaskChecklistRow';
import { dailyTasks } from './calendarWorkflow';

export function DailyRundown({ tasks, activeContext, onContextChange, lastUpdated, loading, unavailable, ...actions }: TaskChecklistActions & {
  tasks: TodoistTask[];
  activeContext: DashboardContext;
  onContextChange: (context: DashboardContext) => void;
  lastUpdated: string;
  loading: boolean;
  unavailable?: string;
}) {
  const items = dailyTasks(tasks);
  return <section className="space-y-5 p-4 sm:p-6 rounded-xl bg-[var(--color-card)] border border-[var(--color-divider)]">
    <h1 className="text-2xl font-display">Rundown of the Day</h1>
    <p className="text-sm text-[var(--color-secondary)]">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · Today's and overdue Todoist tasks</p>
    <ContextTabs activeTab={activeContext} setActiveTab={onContextChange} lastUpdated={lastUpdated} />
    {actions.isOffline && <p role="status">Offline. Reconnect to complete tasks.</p>}
    {unavailable && <p role="alert" className="text-sm text-[var(--color-warning)]">{unavailable}</p>}
    {loading && <p role="status">Updating checklist…</p>}
    {!loading && !unavailable && items.length === 0 && <p>No tasks due today. Add a task due today in the Tasks tab to include it here.</p>}
    <ul className="space-y-2" aria-label="Daily to-do checklist">
      {items.map(task => <li key={task.id}><TaskChecklistRow task={task} {...actions} /></li>)}
    </ul>
  </section>;
}
