import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Flag, Play, RefreshCw, Sun, Target } from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { conflicts, duration, groupingIds, localDate, mins, progress, taskDate, type TimelinePlan, type TimelineSnapshot, type TimelineTask, type WorkBlock } from '../timeline/model';
import './projectsTimeline.css';

const dayLabel = (date: string, full = false) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: full ? 'long' : 'short', day: 'numeric', month: full ? 'long' : undefined }).format(new Date(`${date}T12:00:00Z`));
const addDays = (date: string, count: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };
const formatDue = (due: any, timezone: string) => {
  const value = due?.datetime || due?.date;
  if (!value) return 'None';
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? `${localDate(new Date(value), timezone)} ${new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))}` : value.replace('T', ' ');
};
const request = <T,>(path: string, method = 'GET', body?: any) => ApiClient.request<T>(`/api/timeline${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });

export function ProjectsTimeline({ onChanged, onSettings }: { onChanged(): Promise<void>; onSettings(): void }) {
  const [data, setData] = useState<TimelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [date, setDate] = useState(() => localStorage.getItem('timeline:selected-on') === localDate() ? localStorage.getItem('timeline:selected-date') || localDate() : localDate());
  const [range, setRange] = useState(() => date >= '2026-10-20' && date <= '2026-10-31' ? '2026-10-20' : date);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkBlock | null>(null);
  const [availability, setAvailability] = useState<TimelinePlan | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState('');
  const [projectTarget, setProjectTarget] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const pointer = useRef<{ id: string; x: number; y: number; moved: boolean; date?: string } | null>(null);
  const suppressClick = useRef(false);
  const locks = useRef(new Set<string>());
  const flight = useRef<Promise<any> | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (flight.current) return flight.current;
    setLoading(true);
    flight.current = request<TimelineSnapshot>('').then(result => { if (mounted.current) { setData(result); setError(''); } }).catch(e => { if (mounted.current) setError(e.message); }).finally(() => { flight.current = null; if (mounted.current) setLoading(false); });
    return flight.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    let last = Date.now();
    const focus = () => { if (Date.now() - last > 15000) { last = Date.now(); void load(); } };
    // Poll includes local midnight and external Todoist edits; no fixed UTC offset.
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    window.addEventListener('focus', focus);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [load]);
  useEffect(() => { localStorage.setItem('timeline:selected-date', date); localStorage.setItem('timeline:selected-on', localDate()); }, [date]);
  const act = async (key: string, action: () => Promise<void>) => {
    if (locks.current.has(key)) return;
    locks.current.add(key); setPending(new Set(locks.current)); setError(''); setNotice('');
    try { await action(); } catch (e: any) { setError(e.message); }
    finally { locks.current.delete(key); if (mounted.current) setPending(new Set(locks.current)); }
  };
  const chooseDate = (next: string) => { setDate(next); if (next < range || next > addDays(range, 11)) setRange(next); };
  const save = async (plan: TimelinePlan) => {
    const issues = conflicts(plan);
    if (issues.length) throw new Error(issues.join('\n'));
    const saved = await request<TimelinePlan>('/plan', 'PUT', plan);
    setData(d => d && { ...d, plan: saved }); setNotice('Plan saved. Todoist dates have not changed.');
  };
  const complete = (task: TimelineTask) => act(task.id, async () => {
    await request(`/tasks/${encodeURIComponent(task.id)}/complete`, 'POST');
    setData(d => d && { ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, completed: true } : t), todayTasks: d.todayTasks.map(t => t.id === task.id ? { ...t, completed: true } : t) });
    setNotice(`Completed: ${task.title}`);
    await load(); await onChanged();
  });
  const start = (task: TimelineTask) => act(task.id, async () => {
    const plan = await request<TimelinePlan>(`/tasks/${encodeURIComponent(task.id)}/start`, 'POST');
    setData(d => d && { ...d, plan });
  });
  const reopen = (task: TimelineTask) => act(task.id, async () => {
    await request(`/tasks/${encodeURIComponent(task.id)}/reopen`, 'POST');
    setNotice(`Reopened: ${task.title}`); await load(); await onChanged();
  });
  // Native dialogs provide focus containment, Escape, and focus restoration.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modalOpen = !!editing || !!availability || !!(showPreview && data?.plan.preview);
  useEffect(() => { if (modalOpen) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [modalOpen]);
  if (!data) return <section className="projects-timeline"><h1>Projects Timeline</h1>{loading ? <p role="status">Loading your projects and completion history…</p> : <div role="alert"><p>{error}</p><button onClick={() => void load()}>Retry</button> <button onClick={onSettings}>Open Connections</button></div>}</section>;
  const { plan, tasks, todayTasks, today } = data;
  const dates = Array.from({ length: 12 }, (_, i) => addDays(range, i));
  const selectedProjects = plan.projects.filter(p => p.selected);
  const priorityProject = plan.projects.find(p => p.priority);
  const allTasks = [...tasks, ...todayTasks];
  const taskMap = new Map(allTasks.map(t => [t.id, t]));
  const visibleBlocks = plan.blocks.filter(b => !b.taskId || taskMap.has(b.taskId));
  const blocks = visibleBlocks.filter(b => b.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const reservations = plan.blocks.filter(b => b.date === date);
  const effort = reservations.reduce((sum, b) => sum + b.activeMinutes, 0);
  const reserved = reservations.reduce((sum, b) => sum + mins(b.end) - mins(b.start), 0);
  const capacity = plan.windows.reduce((sum, w) => sum + mins(w.end) - mins(w.start), 0);
  const total = progress(tasks, data.historyComplete);
  const detail = allTasks.find(t => t.id === selected);
  const editIssues = editing ? conflicts({ ...plan, blocks: plan.blocks.some(b => b.id === editing.id) ? plan.blocks.map(b => b.id === editing.id ? editing : b) : [...plan.blocks, editing] }) : [];
  const toggleProject = (id: string) => setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderTask = (task: TimelineTask) => {
    const grouping = groupingIds.has(task.id);
    const children = tasks.filter(t => t.parentId === task.id);
    const groupComplete = grouping && children.length > 0 && children.every(t => t.completed);
    const taskBlocks = plan.blocks.filter(b => b.taskId === task.id);
    const estimated = taskBlocks.reduce((sum, b) => sum + b.activeMinutes, 0);
    return <article key={task.id} className={`tl-task ${task.completed || groupComplete ? 'tl-done' : ''} ${plan.started[task.id] && !task.completed ? 'tl-active' : ''}`}>
      <div className="tl-task-main">
        {grouping ? <span aria-label="Grouping task">↳</span> : <input type="checkbox" aria-label={`Complete ${task.title}`} checked={task.completed} disabled={pending.has(task.id) || task.completed || task.missing} onChange={() => void complete(task)} />}
        <button className="tl-task-title" onClick={() => setSelected(task.id)}>{task.title}{task.parentId && <small>↳ {taskMap.get(task.parentId)?.title || 'Subtask'}</small>}</button>
        {taskDate(task, plan.timezone) === today && <span className="tl-badge tl-today"><Sun size={12} />Today</span>}
        {task.missing && <span className="tl-badge">Missing / unavailable</span>}
        {task.completed && <span className="tl-badge"><CheckCircle2 size={12} />Complete</span>}
      </div>
      <div className="tl-task-meta"><span>{task.projectName}</span><span>{grouping ? `Group · ${groupComplete ? 'Complete' : 'Children determine status'}` : taskBlocks.length ? `${duration(estimated)} active · ${taskBlocks.length} block${taskBlocks.length > 1 ? 's' : ''}` : 'Unscheduled · Not estimated'}</span>{taskBlocks.some(b => b.kind === 'Visit' || b.note.includes('Provisional')) && <span>Provisional</span>}</div>
      {!grouping && !task.completed && !task.missing && <button className="tl-start" disabled={pending.has(task.id)} onClick={() => void start(task)}><Play size={12} />{plan.started[task.id] ? 'In progress · Stop work' : 'Start work'}</button>}
      {task.completed && !task.recurring && !grouping && <button className="tl-start" disabled={pending.has(task.id)} onClick={() => void reopen(task)}>Undo completion</button>}
      {taskBlocks.map(b => <div key={b.id} className="tl-block-line"><span>{dayLabel(b.date)} · {b.start}–{b.end} · {b.kind} · {duration(b.activeMinutes)}</span><button onClick={() => setEditing({ ...b })}>Edit block</button></div>)}
      {!grouping && !task.missing && <button className="tl-text-button" onClick={() => setEditing({ id: crypto.randomUUID(), taskId: task.id, date, start: '09:30', end: '10:00', kind: 'Computer', activeMinutes: 30, note: 'Draft estimate' })}>+ Add work block</button>}
    </article>;
  };
  const preview = plan.preview;
  const availableProjects = data.availableProjects.filter(p => !plan.projects.some(selected => selected.id === p.id && selected.selected));
  const moveBlock = (id: string, nextDate: string) => {
    setDragging(null); setDropDate(null);
    const block = plan.blocks.find(b => b.id === id);
    if (!block || block.date === nextDate || pending.size || data.connectionError) return;
    void act('plan', async () => {
      await save({ ...plan, blocks: plan.blocks.map(b => b.id === id ? { ...b, date: nextDate } : b) });
      chooseDate(nextDate);
    });
  };
  const dragProps = (id: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || pending.size || data.connectionError) return;
      suppressClick.current = false;
      pointer.current = { id, x: event.clientX, y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const current = pointer.current;
      if (!current || current.id !== id) return;
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
      current.moved = true;
      current.date = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-timeline-date]')?.getAttribute('data-timeline-date') || undefined;
      setDragging(id); setDropDate(current.date || null);
    },
    onPointerUp: () => {
      const current = pointer.current; pointer.current = null;
      setDragging(null); setDropDate(null);
      suppressClick.current = !!current?.moved;
      if (current?.moved && current.date) moveBlock(id, current.date);
    },
    onPointerCancel: () => { pointer.current = null; setDragging(null); setDropDate(null); suppressClick.current = true; },
  });
  return <section className="projects-timeline" aria-label="Projects Timeline">
    <header className="tl-header"><div><p className="tl-eyebrow">YOUR PROJECTS, IN MOTION</p><h1>Projects Timeline<span className="tl-draft">Draft plan</span></h1><p>Make room for what matters. One clear next step at a time.</p></div><div className="tl-actions"><button disabled={loading || pending.size > 0} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'tl-spin' : ''} />Refresh</button><button onClick={() => setAvailability(structuredClone(plan))}>Availability & targets</button><button disabled={pending.size > 0 || !!data.connectionError} onClick={() => void act('preview', async () => { const result = await request<NonNullable<TimelinePlan['preview']>>('/preview', 'POST'); setData(d => d && { ...d, plan: { ...d.plan, preview: result } }); setShowPreview(true); })}>Review Todoist dates</button></div></header>
    {data.verificationNotice && <div role="status" className="tl-warning"><strong>{data.verificationNotice}</strong></div>}
    {data.connectionError && <div className="tl-alert" role="alert"><p>{data.connectionError} Showing the supplied draft only; live actions are unavailable.</p><button onClick={onSettings}>Open Connections</button><button onClick={() => void load()}>Retry connection</button></div>}
    {error && <div role="alert" className="tl-alert"><p>{error}</p><button onClick={() => void load()}>Refresh & retry</button><button onClick={onSettings}>Connections</button></div>}
    <div role="status" aria-live="polite" className={notice ? 'tl-notice' : ''}>{notice}</div>
    {data.warnings.length > 0 && <details className="tl-warning"><summary>Data needs attention · {data.warnings.length} notice{data.warnings.length > 1 ? 's' : ''}</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}</details>}
    <div className="tl-summary"><div><Target size={22} /><span><strong>{selectedProjects.length}</strong>projects in focus</span></div><div><CheckCircle2 size={22} /><span><strong>{total.percent === null ? '—' : `${total.percent}%`}</strong>{total.done} / {total.total} known actionable steps · {total.percent === null ? 'Incomplete data' : 'Actual completion'}</span></div><div><Sun size={22} /><span><strong>{allTasks.filter(t => taskDate(t, plan.timezone) === today && !t.completed).length}</strong>Today · {dayLabel(today)}</span></div><div><Flag size={22} /><span><strong>{priorityProject ? dayLabel(priorityProject.target) : "—"}</strong>Downstairs target{priorityProject?.fallback && ` · ${dayLabel(priorityProject.fallback)} fallback`}</span></div></div>
    <div className="tl-toolbar"><div><button aria-label="Previous 12 days" onClick={() => setRange(addDays(range, -12))}><ChevronLeft size={18} /></button><strong>{dayLabel(range)} — {dayLabel(addDays(range, 11))} {range.slice(0, 4)}</strong><button aria-label="Next 12 days" onClick={() => setRange(addDays(range, 12))}><ChevronRight size={18} /></button></div><div><button onClick={() => chooseDate(today)}><Sun size={14} />Today</button><label>Selected date <input aria-label="Selected date" type="date" value={date} onChange={e => e.target.value && chooseDate(e.target.value)} /></label></div></div>
    <details className="tl-add-project"><summary>Add projects to timeline</summary><form onSubmit={event => { event.preventDefault(); void act('plan', async () => { const result = await request<TimelineSnapshot>('/projects', 'POST', { projectId, target: projectTarget || addDays(range, 11), revision: plan.revision }); setData(result); setExpanded(previous => new Set([...previous, projectId])); setProjectId(''); setNotice('Project added to the timeline. Expand its tasks to add work blocks.'); }); }}><label>Todoist project<select aria-label="Todoist project" required value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Choose a project</option>{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Target date<input aria-label="New project target date" type="date" required value={projectTarget || addDays(range, 11)} onChange={e => setProjectTarget(e.target.value)} /></label><button disabled={!projectId || pending.size > 0 || !!data.connectionError}>Add project</button></form>{!availableProjects.length && <p>All available Todoist projects are already on this timeline.</p>}</details>
    <p className="tl-footnote">Drag a work block onto a date to move it, keeping its time. Click a block to edit its date or time.</p>
    <div className="tl-scroll" tabIndex={0} role="region" aria-label="Project by day timeline, scroll horizontally">
      <div className="tl-grid" style={{ gridTemplateColumns: 'var(--tl-project-width, 280px) repeat(12, minmax(78px, 1fr))' }}>
        <div className="tl-corner">PROJECT / ACTUAL PROGRESS</div>{dates.map(d => <button data-timeline-date={d} className={`tl-date ${date === d ? 'tl-selected' : ''} ${d === today ? 'tl-is-today' : ''} ${dropDate === d ? 'tl-drop-target' : ''}`} key={d} onClick={() => chooseDate(d)}><span>{dayLabel(d).split(' ')[0]}</span><strong>{Number(d.slice(-2))}</strong>{d === today && <small>Today</small>}</button>)}
        {selectedProjects.map((p, i) => {
          const projectTasks = tasks.filter(t => t.projectId === p.id);
          const actual = progress(projectTasks, data.historyComplete);
          const next = visibleBlocks.filter(b => projectTasks.some(t => t.id === b.taskId && !t.completed) && b.date >= today).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
          const state = projectTasks.some(t => t.missing) || !data.historyComplete ? 'Data incomplete' : !actual.total ? 'No tasks' : actual.percent === 100 ? '✓ Complete' : p.target < today ? 'Past target' : projectTasks.some(t => plan.started[t.id] || t.completed) ? 'In progress' : 'Not started';
          return <React.Fragment key={p.id}><button className={`tl-project ${p.priority ? 'tl-priority' : ''}`} style={{ '--lane': `var(--tl-lane-${i % 5})` } as React.CSSProperties} onClick={() => { toggleProject(p.id); document.getElementById(`tl-project-${p.id}`)?.scrollIntoView({ behavior: 'instant', block: 'nearest' }); }} aria-expanded={expanded.has(p.id)}><span className="tl-project-top">{p.priority && <span className="tl-badge"><Flag size={11} />Priority</span>}<span>{state}</span></span><strong>{p.name}</strong><div className="tl-progress-label"><b>{actual.percent === null ? '—' : `${actual.percent}%`}</b><span>{actual.done} / {actual.total} steps{actual.percent === null && ' · incomplete data'}</span></div><progress aria-label={`${p.name} actual completion`} max={100} value={actual.percent ?? undefined} /><small>Target {dayLabel(p.target)}{p.fallback && ` · fallback ${dayLabel(p.fallback)}`}</small><small>{next ? `Next: ${taskMap.get(next.taskId!)?.title} · ${dayLabel(next.date)} ${next.start}` : 'No upcoming scheduled action'}</small></button>{dates.map(d => {
            const dayBlocks = visibleBlocks.filter(b => b.date === d && projectTasks.some(t => t.id === b.taskId));
            return <div data-timeline-date={d} key={d} className={`tl-cell ${date === d ? 'tl-cell-selected' : ''} ${dropDate === d ? 'tl-drop-target' : ''}`} style={{ '--lane': `var(--tl-lane-${i % 5})` } as React.CSSProperties}>
              <button className="tl-cell-date" onClick={() => chooseDate(d)} aria-label={`${p.name}, ${dayLabel(d)}, ${dayBlocks.length} blocks`}>View day</button>
              {p.target === d && <span className="tl-target"><Target size={12} />Target</span>}{p.fallback === d && <span className="tl-target">↪ Fallback</span>}
              {dayBlocks.map(b => <button key={b.id} data-block-id={b.id} {...dragProps(b.id)} disabled={pending.size > 0 || !!data.connectionError} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setEditing({ ...b }); }} title={`${taskMap.get(b.taskId!)?.title} · ${b.start}–${b.end}. Drag to another date or click to edit.`} aria-label={`${taskMap.get(b.taskId!)?.title}, ${d}, ${b.start}–${b.end}. Move or edit block`} className={`tl-day-block ${taskMap.get(b.taskId!)?.completed ? 'tl-completed-block' : ''} ${dragging === b.id ? 'tl-dragging' : ''}`}><b>{duration(b.activeMinutes)}</b><small>{b.start}–{b.end}</small><small className="tl-block-title">{taskMap.get(b.taskId!)?.title}</small>{plan.started[b.taskId!] && !taskMap.get(b.taskId!)?.completed && <small>▶ Active</small>}{taskMap.get(b.taskId!)?.completed && <small>✓ Complete</small>}</button>)}
            </div>;
          })}</React.Fragment>;
        })}
        <div className="tl-effort-label">Daily active effort · spare capacity</div>{dates.map(d => { const items = plan.blocks.filter(b => b.date === d); const active = items.reduce((s, b) => s + b.activeMinutes, 0); const held = items.reduce((s, b) => s + mins(b.end) - mins(b.start), 0); return <button key={d} className="tl-day-total" onClick={() => chooseDate(d)}><b>{duration(active)}</b><small>{duration(Math.max(0, capacity - held))} spare</small></button>; })}
      </div>
    </div>
    <div className="tl-lower"><section className="tl-schedule"><header><div><p className="tl-eyebrow">SELECTED DAY</p><h2><CalendarDays size={20} />{dayLabel(date, true)}</h2></div><span>{plan.computerOnlyDates.includes(date) ? 'Computer only' : 'Flexible work day'}</span></header><p className="tl-capacity">{duration(effort)} active · {duration(reserved - effort)} reserved / waiting · {duration(Math.max(0, capacity - reserved))} available</p>
      {reservations.length > blocks.length && <p className="tl-footnote">Capacity includes reservations for hidden projects.</p>}
      {effort >= 570 && <p className="tl-warning">Heavy day: 9½ hours or more of active work. Estimates remain provisional.</p>}
      {!blocks.length && <p className="tl-empty">No blocks scheduled. Available time is yours to keep.</p>}
      {blocks.map(b => { const t = taskMap.get(b.taskId!); return <article key={b.id} className={`tl-schedule-block ${!t ? 'tl-buffer' : ''} ${t?.completed ? 'tl-done' : ''} ${plan.started[b.taskId!] && !t?.completed ? 'tl-active' : ''}`}><div className="tl-time"><strong>{b.start}</strong><span>{b.end}</span></div><div className="tl-schedule-content">{t ? <button className="tl-task-title" onClick={() => setSelected(t.id)}>{t.completed && '✓ '}{t.title}</button> : <strong>{b.note}</strong>}<p>{t?.projectName || 'Reserved time'} · {b.kind} · {b.activeMinutes ? `${duration(b.activeMinutes)} active` : 'No active effort'}</p><small>{b.note}</small>{t && !t.completed && !t.missing && <div className="tl-actions"><button disabled={pending.has(t.id)} onClick={() => void start(t)}>{plan.started[t.id] ? 'In progress · Stop work' : 'Start work'}</button><button disabled={pending.has(t.id)} onClick={() => void complete(t)}>Complete</button></div>}<button className="tl-text-button" onClick={() => setEditing({ ...b })}>Edit block</button></div></article>; })}
    </section><section className="tl-today-panel"><p className="tl-eyebrow"><Sun size={15} />LIVE TODAY</p><h2>Today — other projects</h2><p>Due {dayLabel(today)} · {plan.timezone}. Inbox excluded.</p>{!todayTasks.length && <p className="tl-empty">No other tasks due today.</p>}{todayTasks.map(renderTask)}<p className="tl-footnote">Today tasks in selected projects stay in their own lane. Overdue tasks remain in the existing Tasks view.</p></section></div>
    <section className="tl-project-lists"><h2>All project tasks</h2><p>Expand a project to see every step. Estimates and planned blocks are separate from actual completion.</p>{plan.projects.map(p => <section key={p.id} id={`tl-project-${p.id}`} className="tl-project-list"><button className="tl-list-heading" aria-expanded={expanded.has(p.id)} onClick={() => toggleProject(p.id)}><span>{expanded.has(p.id) ? '−' : '+'} {p.name}</span><span>{tasks.filter(t => t.projectId === p.id).length} tasks</span></button>{expanded.has(p.id) && <div>{!p.selected ? <p>Hidden from timeline. Enable in Availability & targets.</p> : tasks.filter(t => t.projectId === p.id).length ? tasks.filter(t => t.projectId === p.id).map(renderTask) : <p className="tl-empty">No tasks available. Check account access and data notices.</p>}</div>}</section>)}</section>
    <footer className="tl-footnote">Refreshed {new Date(data.fetchedAt).toLocaleTimeString('en-GB', { timeZone: plan.timezone })} · Draft bookings and estimates need confirmation. Blocks never complete tasks automatically.</footer>
    {detail && <div className="tl-detail" role="region" aria-label="Task details"><button className="tl-close" onClick={() => setSelected(null)}>Close details ×</button><h2>{detail.title}</h2><p>{detail.projectName} · {detail.completed ? 'Complete' : plan.started[detail.id] ? 'In progress (app)' : 'Not started'}</p><p className="tl-description">{detail.description || 'No description'}</p><p>Labels: {detail.labels.join(', ') || 'None'}</p><p>Parent: {taskMap.get(detail.parentId!)?.title || detail.parentId || 'None'}</p><p>Due: {formatDue(detail.due, plan.timezone)} · Deadline: {detail.deadline?.date || 'None'}</p>{detail.url?.startsWith('https://') && <a href={detail.url} target="_blank" rel="noopener noreferrer">Open in Todoist ↗</a>}{renderTask(detail)}{detail.completed && detail.recurring && <p>Reopen recurring occurrences in Todoist to preserve the recurrence schedule, then Refresh.</p>}</div>}
    <dialog onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setEditing(null); setAvailability(null); setShowPreview(false); } }} aria-label={editing ? "Edit work block" : availability ? "Availability and project targets" : "Review schedule changes"} ref={dialogRef} className="tl-native-dialog" onCancel={() => { setEditing(null); setAvailability(null); setShowPreview(false); }}>{editing && <section className="tl-dialog" aria-label="Edit work block"><h2>Edit work block</h2><p>{taskMap.get(editing.taskId!)?.title || editing.note}</p><form onSubmit={e => { e.preventDefault(); void act('save', async () => { await save({ ...plan, blocks: plan.blocks.some(b => b.id === editing.id) ? plan.blocks.map(b => b.id === editing.id ? editing : b) : [...plan.blocks, editing] }); setEditing(null); }); }}><div className="tl-fields">{(['date', 'start', 'end'] as const).map(field => <label key={field}>{field}<input required type={field === 'date' ? 'date' : 'time'} value={editing[field]} onChange={e => setEditing({ ...editing, [field]: e.target.value })} /></label>)}<label>Work type<select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value })}>{['Computer', 'In person', 'Visit', 'Teaching', 'Buffer', 'Wait'].map(k => <option key={k}>{k}</option>)}</select></label><label>Active minutes<input type="number" min={0} required value={editing.activeMinutes} onChange={e => setEditing({ ...editing, activeMinutes: Number(e.target.value) })} /></label><label>Note<input value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label></div>{editIssues.length > 0 && <div className="tl-alert" role="alert">{editIssues.map(issue => <p key={issue}>{issue}</p>)}</div>}{error && <p role="alert">{error}</p>}<div className="tl-actions"><button type="submit" disabled={editIssues.length > 0 || pending.size > 0}>Save draft block</button><button type="button" onClick={() => setEditing(null)}>Cancel</button>{plan.blocks.some(b => b.id === editing.id) && <button type="button" disabled={pending.size > 0} onClick={() => void act('save', async () => { await save({ ...plan, blocks: plan.blocks.filter(b => b.id !== editing.id) }); setEditing(null); })}>Remove block</button>}</div></form></section>}
    {availability && <section className="tl-dialog" aria-label="Availability and project targets"><h2>Availability & targets</h2><p>Times are local to {plan.timezone}. Morning work is computer only.</p>{availability.windows.map((w, i) => <div className="tl-fields" key={i}><strong>{w.name}</strong><label>Start<input type="time" value={w.start} onChange={e => setAvailability({ ...availability, windows: availability.windows.map((v, n) => n === i ? { ...v, start: e.target.value } : v) })} /></label><label>End<input type="time" value={w.end} onChange={e => setAvailability({ ...availability, windows: availability.windows.map((v, n) => n === i ? { ...v, end: e.target.value } : v) })} /></label></div>)}<label>Computer-only dates (comma separated)<input value={availability.computerOnlyDates.join(', ')} onChange={e => setAvailability({ ...availability, computerOnlyDates: e.target.value.split(',').map(s => s.trim()) })} /></label>{availability.projects.map((p, i) => <div className="tl-fields" key={p.id}><label><input type="checkbox" checked={p.selected} onChange={e => setAvailability({ ...availability, projects: availability.projects.map((v, n) => n === i ? { ...v, selected: e.target.checked } : v) })} />{p.name}</label><label>Target<input type="date" value={p.target} onChange={e => setAvailability({ ...availability, projects: availability.projects.map((v, n) => n === i ? { ...v, target: e.target.value } : v) })} /></label></div>)}{error && <p role="alert" className="tl-alert">{error}</p>}<div className="tl-actions"><button disabled={pending.size > 0} onClick={() => void act('save', async () => { await save(availability); setAvailability(null); await load(); })}>Save planning settings</button><button onClick={() => setAvailability(null)}>Cancel</button></div></section>}
    {showPreview && preview && <section className="tl-dialog tl-preview" aria-label="Review schedule changes"><h2>Review Todoist dates</h2><p>Only the final block end becomes a due time. Deadlines, durations and recurring schedules stay unchanged. No task or project is created.</p><p>All times below are {plan.timezone}. Missing/completed/recurring tasks are excluded.</p><div className="tl-preview-table"><table><thead><tr><th>Task</th><th>Current due</th><th>Proposed due</th><th>Deadline</th><th>Result</th></tr></thead><tbody>{preview.changes.map(c => <tr key={c.taskId}><td>{c.title}</td><td>{formatDue(JSON.parse(c.oldDue), plan.timezone)}</td><td>{c.newDate} {c.newTime}</td><td>Unchanged</td><td>{c.status || 'Draft'}</td></tr>)}</tbody></table></div>{error && <p role="alert" className="tl-alert">{error}</p>}<div className="tl-actions"><button disabled={pending.size > 0 || !preview.changes.some(c => c.status !== 'Applied')} onClick={() => void act('apply', async () => { const result = await request<NonNullable<TimelinePlan['preview']>>('/apply', 'POST', { previewId: preview.id }); setData(d => d && { ...d, plan: { ...d.plan, preview: result } }); setNotice(`${result.changes.filter(c => c.status === 'Applied').length} applied; ${result.changes.filter(c => c.status !== 'Applied').length} need attention.`); await onChanged(); })}>{preview.changes.some(c => c.status) ? 'Retry failed writes only' : 'Apply schedule to Todoist'}</button><button onClick={() => setShowPreview(false)}>Close preview</button></div></section>}
    </dialog>
  </section>;
}
