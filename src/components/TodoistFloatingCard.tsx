import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../services/apiClient';
import type { TodoistTask } from '../types';
import { cardTasks, dueLabel, localDate, taskDay, type CardView } from './todoistCardModel';
import styles from './todoistFloatingCard.css?inline';

type CardData = { connected: boolean; tasks: TodoistTask[]; inboxProjectId: string | null };
type PipAPI = { window?: Window; requestWindow(options: { width: number; height: number }): Promise<Window> };

export function TodoistFloatingCard(props: {
  tasks?: TodoistTask[];
  completing: Set<string>;
  errors: Record<string, string>;
  onComplete: (id: string) => Promise<void>;
  onTasks: (tasks: TodoistTask[], inbox: string | null) => void;
  onConnections: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<CardView>('today');
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pipError, setPipError] = useState('');
  const [pip, setPip] = useState<Window | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const alive = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const reloadAfterRead = useRef(false);
  const failures = useRef(0);
  const nextRefresh = useRef(0);
  const floating = useRef<Window | null>(null);
  const opening = useRef(false);
  const detach = useRef<(() => void) | null>(null);
  const api = (window as Window & { documentPictureInPicture?: PipAPI }).documentPictureInPicture;
  const supported = window.isSecureContext && !!api?.requestWindow;

  const refresh = useCallback(async () => {
    if (!alive.current || inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const result = await ApiClient.request<CardData>('/api/todoist/card', { signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]) });
      if (!alive.current || request.signal.aborted) return;
      setData(result);
      callbacks.current.onTasks(result.tasks, result.inboxProjectId);
      setError('');
      failures.current = 0;
    } catch (err: any) {
      if (!request.signal.aborted) {
        if (alive.current) setError(err.message || 'Could not refresh Todoist. Try again.');
        failures.current = Math.min(failures.current + 1, 4);
      }
    } finally {
      nextRefresh.current = Date.now() + Math.min(60000 * 2 ** failures.current, 900000);
      inFlight.current = false;
      if (alive.current) setLoading(false);
      if (reloadAfterRead.current && alive.current) {
        reloadAfterRead.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (inFlight.current) reloadAfterRead.current = true;
    else void refresh();
    const tick = () => {
      if (Date.now() >= nextRefresh.current && (!document.hidden || floating.current)) void refresh();
    };
    const resume = () => { if (!document.hidden && (failures.current === 0 || Date.now() >= nextRefresh.current)) void refresh(); };
    const timer = window.setInterval(tick, 10000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    const close = () => floating.current?.close();
    const connectionChanged = () => {
      controller.current?.abort();
      setData(null);
      setError('');
      failures.current = 0;
      nextRefresh.current = 0;
      callbacks.current.onTasks([], null);
      if (inFlight.current) reloadAfterRead.current = true;
      else void refresh();
    };
    window.addEventListener('todoist-connection-changed', connectionChanged);
    window.addEventListener('pagehide', close);
    return () => {
      alive.current = false;
      controller.current?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('todoist-connection-changed', connectionChanged);
      detach.current?.();
      floating.current?.close();
      floating.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    if (props.tasks) setData(prev => prev ? { ...prev, tasks: props.tasks!.map(task => ({ ...task, projectName: task.projectName || prev.tasks.find(t => t.id === task.id)?.projectName })) } : prev);
  }, [props.tasks]);

  useEffect(() => {
    // A read begun before a completion must not put the old occurrence back.
    if (props.completing.size) controller.current?.abort();
  }, [props.completing]);

  async function floatTasks() {
    setPipError('');
    if (!supported || !api) return;
    if (floating.current && !floating.current.closed) { floating.current.focus(); return; }
    if (opening.current) return;
    opening.current = true;
    try {
      // Invoke before any await: the browser requires this exact user gesture.
      const child = await api.requestWindow({ width: 340, height: 440 });
      if (!alive.current) { child.close(); return; }
      child.document.title = 'My tasks • Life Site';
      child.document.body.style.margin = '0';
      floating.current = child;
      const closed = () => {
        detach.current?.();
        detach.current = null;
        floating.current = null;
        if (alive.current) { setPip(null); void refresh(); }
      };
      const focus = () => { if (failures.current === 0 || Date.now() >= nextRefresh.current) void refresh(); };
      child.addEventListener('pagehide', closed);
      child.addEventListener('focus', focus);
      detach.current = () => { child.removeEventListener('pagehide', closed); child.removeEventListener('focus', focus); };
      setPip(child);
    } catch {
      setPipError('Floating mode was blocked by your browser or device policy. Your tasks still work here.');
    } finally { opening.current = false; }
  }

  const tasks = cardTasks(data?.tasks || [], view, data?.inboxProjectId || null);
  const renderCard = (isFloating: boolean) => <section className={`todoist-card ${isFloating ? 'todoist-card-window' : ''}`} aria-label={isFloating ? 'Floating tasks' : 'My tasks'}>
    <style>{styles}</style>
    <header className="todoist-card-header"><div><small>Life Site</small><h2>My tasks</h2></div>
      {isFloating ? <button onClick={() => { window.focus(); pip?.close(); }}>Return to tab</button> : <button aria-label="Close task panel" onClick={() => setExpanded(false)}>×</button>}
    </header>
    <div className="todoist-card-views" role="group" aria-label="Tasks to show">
      <button aria-pressed={view === 'today'} onClick={() => setView('today')}>Today + overdue</button>
      <button aria-pressed={view === 'inbox'} onClick={() => setView('inbox')}>Inbox</button>
    </div>
    <div className="todoist-card-toolbar">
      <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      <a href={view === 'inbox' ? 'https://app.todoist.com/app/inbox' : 'https://app.todoist.com/app/today'} target="_blank" rel="noopener noreferrer">Open Todoist ↗</a>
    </div>
    <div className="todoist-card-list" aria-busy={loading}>
      {error && <p role="alert" className="todoist-card-error">{error}</p>}
      {!data && loading && <p role="status">Loading your tasks…</p>}
      {data && !data.connected && <div><p>Connect Todoist to see your tasks here.</p><button onClick={() => { setExpanded(false); pip?.close(); callbacks.current.onConnections(); }}>Connect Todoist</button></div>}
      {data?.connected && view === 'inbox' && !data.inboxProjectId && <p role="status">Inbox could not be found. Try Refresh.</p>}
      {data?.connected && !loading && !error && tasks.length === 0 && (view !== 'inbox' || data.inboxProjectId) && <p role="status">{view === 'inbox' ? 'Your inbox is clear.' : 'All clear for today.'}</p>}
      {data?.connected && <ul>{tasks.map(task => <li key={task.id}>
        <button className="todoist-card-check" role="checkbox" aria-checked={false} aria-label={`Complete ${task.title}`} disabled={props.completing.has(task.id) || loading} onClick={async () => { await callbacks.current.onComplete(task.id); await refresh(); }}>{props.completing.has(task.id) ? '…' : ''}</button>
        <div className="todoist-card-task"><a href={`https://app.todoist.com/app/task/${encodeURIComponent(task.id)}`} target="_blank" rel="noopener noreferrer">{task.title}</a>
          <div className="todoist-card-meta">{task.dueDate || task.dueDatetime ? <span className={taskDay(task)! < localDate(new Date()) ? 'todoist-card-overdue' : ''}>{dueLabel(task)}{task.recurring ? ' · repeats' : ''}</span> : null}<span>{task.projectName || 'Project'}</span></div>
          {props.errors[task.id] && <p role="alert" className="todoist-card-error">{props.errors[task.id]}</p>}
        </div>
      </li>)}</ul>}
    </div>
    <footer>
      {!isFloating && <button className="todoist-card-float" onClick={floatTasks} disabled={!supported}>{pip ? 'Focus floating card' : 'Float my tasks'}</button>}
      {!supported && <p>Floating mode is unavailable in this browser. Use this panel here.</p>}
      {pipError && <p role="alert">{pipError}</p>}
      <p>Keep this tab open while using the floating card.</p>
      {isFloating && <p>Always on top. Return to tab to put it away. Glass styling; desktop transparency is unavailable.</p>}
      {data?.connected && <button onClick={() => { setExpanded(false); pip?.close(); callbacks.current.onConnections(); }}>Connection settings</button>}
    </footer>
  </section>;

  return <><style>{styles}</style><aside className="todoist-card-dock">
    {expanded && renderCard(false)}
    <button className="todoist-card-launcher" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>My tasks</button>
  </aside>{pip && createPortal(renderCard(true), pip.document.body)}</>;
}
