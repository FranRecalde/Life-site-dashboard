import React from 'react';
import { TodoistTask } from '../types';

export interface TaskChecklistActions {
  onComplete: (task: TodoistTask) => void;
  onOpen: (task: TodoistTask) => void;
  completingTaskIds: Set<string>;
  taskErrors: Record<string, string>;
  isOffline: boolean;
}

export function TaskChecklistRow({ task, onComplete, onOpen, completingTaskIds, taskErrors, isOffline }: TaskChecklistActions & { task: TodoistTask }) {
  const pending = completingTaskIds.has(task.id);
  return <div className="p-2 rounded-lg border border-[var(--color-divider)]">
    <div className="flex items-start gap-3">
      <input type="checkbox" aria-label={`Complete task: ${task.title}`} checked={Boolean(task.completed)} disabled={isOffline || pending || task.completed} onChange={() => onComplete(task)} className="mt-1 w-5 h-5 shrink-0 accent-[var(--color-control)]" />
      <button type="button" onClick={() => onOpen(task)} className="text-left min-w-0 flex-1 hover:underline">
        <span className={`block text-sm break-words ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
        <span className={`block text-xs mt-1 ${task.isOverdue ? 'text-[var(--color-overdue)]' : 'text-[var(--color-secondary)]'}`}>
          {task.isOverdue ? 'Overdue · ' : ''}{task.dueDate || 'No due date'}{task.projectName ? ` · ${task.projectName}` : ''}
        </span>
      </button>
      {pending && <span role="status" className="text-xs">Saving…</span>}
    </div>
    {taskErrors[task.id] && <p role="alert" className="text-xs mt-2 text-[var(--color-warning)]">{taskErrors[task.id]} Try again.</p>}
  </div>;
}
