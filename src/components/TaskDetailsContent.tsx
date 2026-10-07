import React, { useEffect, useState } from 'react';
import { TodoistComment, TodoistTask } from '../types';
import { ApiClient } from '../services/apiClient';
import { TaskChecklistActions, TaskChecklistRow } from './TaskChecklistRow';

export function TaskDetailsContent({ task, allTasks, ...actions }: TaskChecklistActions & { task: TodoistTask; allTasks: TodoistTask[] }) {
  const [comments, setComments] = useState<TodoistComment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setError('');
    setLoading(true);
    if (actions.isOffline) {
      setError('Comments are unavailable offline. Reconnect and retry.');
      setLoading(false);
      return;
    }
    ApiClient.getTodoistComments(task.id).then(result => {
      if (!cancelled) setComments(result);
    }).catch(error => {
      if (!cancelled) setError(error.message || 'Unable to load comments.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [task.id, actions.isOffline, attempt]);

  const children = (parentId: string, ancestors: string[] = []): React.ReactNode => {
    if (ancestors.includes(parentId)) return null;
    const items = allTasks.filter(child => child.parentId === parentId).sort((a, b) => (a.childOrder || 0) - (b.childOrder || 0));
    return items.length ? <ul className="space-y-2 pl-3 border-l border-[var(--color-divider)]">
      {items.map(child => <li key={child.id}><TaskChecklistRow task={child} {...actions} />{children(child.id, [...ancestors, parentId])}</li>)}
    </ul> : null;
  };
  const subtasks = children(task.id);
  const parent = allTasks.find(item => item.id === task.parentId);
  return <div className="space-y-5 border-t border-[var(--color-divider)] pt-4">
    {parent && <button type="button" onClick={() => actions.onOpen(parent)} className="text-xs underline">Parent: {parent.title}</button>}
    <section aria-label="Subtasks">
      <h3 className="font-semibold text-sm mb-2">Subtasks</h3>
      {subtasks || <p className="text-xs text-[var(--color-secondary)]">No subtasks.</p>}
    </section>
    <section aria-label="Task comments" className="space-y-2">
      <h3 className="font-semibold text-sm">Comments</h3>
      {loading && <p role="status" className="text-xs">Loading comments…</p>}
      {error && <div role="alert" className="text-xs text-[var(--color-warning)]">{error} <button type="button" disabled={actions.isOffline} onClick={() => setAttempt(value => value + 1)} className="underline">Retry comments</button></div>}
      {!loading && !error && comments.length === 0 && <p className="text-xs text-[var(--color-secondary)]">No comments.</p>}
      {comments.map(comment => <article key={comment.id} className="p-3 rounded border border-[var(--color-divider)] text-sm">
        {comment.postedAt && <time className="text-xs text-[var(--color-secondary)]" dateTime={comment.postedAt}>{new Date(comment.postedAt).toLocaleString('en-GB')}</time>}
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-1">{comment.content}</p>
        {comment.attachment?.fileUrl?.startsWith('https://') && <a href={comment.attachment.fileUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">{comment.attachment.fileName || 'View attachment'}</a>}
      </article>)}
    </section>
  </div>;
}
