import { Router } from 'express';
import crypto from 'node:crypto';
import seed from '../../src/timeline/seed.json';
import { UserSettings } from '../../src/types';
import { conflicts, dueKey, initialPlan, localDate, reconcile, taskDate, zonedISO, type TimelinePlan, type TimelineSnapshot, type TimelineTask } from '../../src/timeline/model';

type Dependencies = {
  now?(): Date;
  loadSettings(): Promise<UserSettings>; saveSettings(settings: UserSettings): Promise<void>;
  read(selectedProjectIds: string[]): Promise<{ active: any[]; projects: any[]; history: any[]; historyComplete: boolean; verificationNotice?: string }>;
  deleteProject(projectId: string): Promise<void>;
  command(taskId: string, action: 'complete' | 'schedule' | 'reopen', payload?: object): Promise<void>;
};
export function createTimelineRouter(deps: Dependencies) {
  const router = Router();
  const now = () => deps.now?.() || new Date();
  let tail: Promise<any> = Promise.resolve();
  const exclusive = <T,>(fn: () => Promise<T>): Promise<T> => { const result = tail.then(fn); tail = result.catch(() => {}); return result; };
  const owner = (req: any) => crypto.createHash('sha256').update(req.user).digest('hex');
  async function getPlan(req: any) { const settings = await deps.loadSettings(); return structuredClone(settings.timelineByUser?.[owner(req)] || initialPlan()); }
  async function savePlan(req: any, plan: TimelinePlan) {
    const settings = await deps.loadSettings();
    // Keep the plan JSON-compatible for both existing local and strict Firestore stores.
    const persisted = JSON.parse(JSON.stringify(plan)) as TimelinePlan;
    await deps.saveSettings({ ...settings, timelineByUser: { ...settings.timelineByUser, [owner(req)]: persisted } });
  }
  async function snapshot(req: any): Promise<TimelineSnapshot> {
    const plan = await getPlan(req);
    let data: Awaited<ReturnType<Dependencies['read']>>;
    let connectionError: string | undefined;
    try { data = await deps.read(plan.projects.filter(p => p.selected).map(p => p.id)); } catch (error: any) {
      connectionError = error.status === 401 ? 'Todoist connection expired. Reconnect in Settings → Connections, then Refresh.' : error.status === 429 ? 'Todoist rate limited this request. Wait before refreshing.' : 'Todoist data unavailable. Retry or reconnect in Settings → Connections.';
      data = { active: [], projects: [], history: [], historyComplete: false };
    }
    const reconciled = reconcile(data.active, data.history, data.projects, plan, now());
    return { plan, ...reconciled, historyComplete: data.historyComplete, fetchedAt: new Date().toISOString(), ...(connectionError ? { connectionError } : {}), ...(data.verificationNotice ? { verificationNotice: data.verificationNotice } : {}), warnings: [
      ...(connectionError ? [connectionError] : []),
      ...reconciled.missingProjects.map(p => `Project unavailable: ${p}. Check the connected account.`),
      ...(!data.historyComplete ? ['Completion history is incomplete. Actual percentages are unavailable; counts show known records only.'] : []),
      ...(reconciled.tasks.some(t => t.missing) ? ['Some seed tasks are missing from current Todoist data/history. They have not been recreated or marked complete.'] : []),
      ...(plan.blocks.some(b => b.taskId && b.date === localDate(now(), plan.timezone) && zonedISO(b.date, b.start, plan.timezone) < now().toISOString()) ? ['The draft contains earlier work times today. Review elapsed blocks; they have not been marked complete or moved automatically.'] : []),
    ] };
  }
  const handle = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
    try { await fn(req, res); } catch (error: any) {
      const status = error.status || 500;
      res.status(status).json({ error: status === 401 ? 'Todoist connection expired. Reconnect in Settings → Connections.' : error.message || 'Timeline unavailable. Retry.', todoistError: status === 401 });
    }
  };
  const connectedSnapshot = async (req: any) => {
    const data = await snapshot(req);
    if (data.connectionError) throw Object.assign(new Error(data.connectionError), { status: 503 });
    return data;
  };
  router.get('/', handle(async (req, res) => res.json(await snapshot(req))));
  router.delete('/projects/:id', handle((req, res) => exclusive(async () => {
    const plan = await getPlan(req);
    const project = plan.projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project unavailable in this timeline.' });
    if (req.body.confirmName !== project.name || req.body.revision !== plan.revision) return res.status(409).json({ error: 'Project or plan changed. Refresh and confirm deletion again.' });
    // A successful fresh read is required, including when retrying local cleanup.
    const data = await deps.read(plan.projects.map(p => p.id));
    const remote = data.projects.find(p => p.id === project.id);
    if (remote && (remote.is_inbox_project || remote.inbox_project || remote.is_inbox)) return res.status(403).json({ error: 'The Todoist Inbox cannot be deleted.' });
    if (data.projects.some(p => p.parent_id === project.id)) return res.status(409).json({ error: 'This project contains subprojects. Delete or move them in Todoist first, then retry.' });
    const taskIds = new Set([
      ...(plan.deletionTaskIds?.[project.id] || []),
      ...data.active.filter(t => t.project_id === project.id).map(t => t.id),
      ...data.history.filter(t => t.project_id === project.id).map(t => t.task_id || t.id),
      ...seed.tasks.filter(t => t.projectId === project.id).map(t => t.id),
      ...Object.values(plan.occurrences).filter(t => t.projectId === project.id).map(t => t.id),
    ]);
    if (remote) {
      // Save task ownership before the irreversible write so cleanup survives lost
      // responses or a later storage outage, including tasks absent from the seed.
      plan.deletionTaskIds = { ...plan.deletionTaskIds, [project.id]: [...taskIds] };
      await savePlan(req, plan);
      await deps.deleteProject(project.id);
    }
    if (plan.deletionTaskIds) {
      delete plan.deletionTaskIds[project.id];
      if (!Object.keys(plan.deletionTaskIds).length) delete plan.deletionTaskIds;
    }
    plan.projects = plan.projects.filter(p => p.id !== project.id);
    plan.blocks = plan.blocks.filter(b => !b.taskId || !taskIds.has(b.taskId));
    for (const id of taskIds) delete plan.started[id];
    plan.occurrences = Object.fromEntries(Object.entries(plan.occurrences).filter(([, t]) => t.projectId !== project.id));
    delete plan.preview;
    plan.revision++;
    try { await savePlan(req, plan); } catch { return res.status(503).json({ error: 'Todoist project deleted, but saving timeline cleanup failed. Retry Delete project to finish removing its saved schedule.' }); }
    res.json({ deleted: true, plan });
  })));
  router.post('/projects', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    if (req.body.revision !== data.plan.revision) return res.status(409).json({ error: 'Plan changed. Refresh before adding a project.' });
    const project = data.availableProjects.find(p => p.id === req.body.projectId);
    if (!project) return res.status(403).json({ error: 'Project is not available in the connected Todoist account.' });
    const target = req.body.target;
    if (typeof target !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(target) || Number.isNaN(Date.parse(target)) || new Date(target).toISOString().slice(0, 10) !== target) return res.status(400).json({ error: 'Choose a valid project target date.' });
    const existing = data.plan.projects.find(p => p.id === project.id);
    if (existing) existing.selected = true;
    else data.plan.projects.push({ ...project, target, fallback: null, priority: false, selected: true });
    data.plan.revision++;
    delete data.plan.preview;
    await savePlan(req, data.plan);
    res.json(await snapshot(req));
  })));
  router.put('/plan', handle((req, res) => exclusive(async () => {
    const plan = await getPlan(req);
    if (req.body.revision !== plan.revision) return res.status(409).json({ error: 'Plan changed. Refresh before saving.' });
    const { blocks, windows, computerOnlyDates, projects } = req.body;
    if (!Array.isArray(blocks) || blocks.length > 1000 || !Array.isArray(windows) || windows.length !== 3 || !Array.isArray(computerOnlyDates) || computerOnlyDates.some(d => typeof d !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(d)) || !Array.isArray(projects) || projects.length !== plan.projects.length) return res.status(400).json({ error: 'Invalid plan.' });
    if (windows.some(w => typeof w.name !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) || w.end <= w.start || typeof w.computerOnly !== 'boolean')) return res.status(400).json({ error: 'Invalid availability windows.' });
    if (projects.some((p, i) => p.id !== plan.projects[i].id || typeof p.selected !== 'boolean' || !/^\d{4}-\d\d-\d\d$/.test(p.target))) return res.status(400).json({ error: 'Invalid project targets/selection.' });
    if (blocks.some(b => !b || typeof b.id !== 'string' || typeof b.date !== 'string' || typeof b.start !== 'string' || typeof b.end !== 'string' || typeof b.kind !== 'string' || typeof b.note !== 'string')) return res.status(400).json({ error: 'Invalid work block.' });
    const data = await snapshot(req);
    const allowed = new Set([...data.tasks, ...data.todayTasks].filter(t => !t.missing).map(t => t.id));
    const prior = new Map(plan.blocks.map(b => [b.id, b]));
    for (const b of blocks) {
      const changed = JSON.stringify(b) !== JSON.stringify(prior.get(b.id));
      if (changed && b.taskId && !allowed.has(b.taskId)) return res.status(403).json({ error: 'Block task is not accessible in this timeline.' });
      if (changed && zonedISO(b.date, b.start, plan.timezone) < now().toISOString()) return res.status(409).json({ error: `Cannot schedule new work in the past: ${b.date} ${b.start}.` });
    }
    const next = { ...plan, blocks, windows, computerOnlyDates, projects: projects.map((p, i) => ({ ...plan.projects[i], target: p.target, selected: p.selected })), revision: plan.revision + 1 };
    delete next.preview;
    const errors = conflicts(next, { schedule: false });
    if (errors.length) return res.status(409).json({ error: errors.join('\n') });
    await savePlan(req, next);
    res.json(next);
  })));
  router.post('/tasks/:id/start', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    const task = [...data.tasks, ...data.todayTasks].find(t => t.id === req.params.id);
    if (!task || task.missing || task.completed) return res.status(404).json({ error: 'Active task unavailable.' });
    const plan = data.plan;
    plan.started[task.id] = !plan.started[task.id];
    plan.revision++;
    delete plan.preview;
    await savePlan(req, plan);
    res.json(plan);
  })));
  router.post('/tasks/:id/complete', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    const task = [...data.tasks, ...data.todayTasks].find(t => t.id === req.params.id);
    if (!task || task.missing) return res.status(404).json({ error: 'Task unavailable.' });
    if (task.completed) return res.json({ completed: true });
    const children = data.tasks.filter(t => t.parentId === task.id && !t.completed);
    if (children.length) return res.status(409).json({ error: 'Complete the remaining subtasks first.' });
    await deps.command(task.id, 'complete');
    // Acknowledgement is per occurrence, separate from the next recurring due date.
    if (task.recurring && taskDate(task, data.plan.timezone) === data.today) {
      data.plan.occurrences[`${data.today}:${task.id}`] = { ...task, completed: true };
      data.plan.revision++;
      delete data.plan.preview;
      try { await savePlan(req, data.plan); } catch { return res.status(503).json({ error: 'Todoist completed this occurrence, but saving its local acknowledgement failed. Refresh before retrying.' }); }
    }
    res.json({ completed: true });
  })));
  router.post('/tasks/:id/reopen', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    const task = [...data.tasks, ...data.todayTasks].find(t => t.id === req.params.id);
    if (!task || task.missing || !task.completed) return res.status(404).json({ error: 'Completed task unavailable.' });
    if (task.recurring) return res.status(409).json({ error: 'Reopen recurring occurrences in Todoist, then Refresh, to preserve the recurrence schedule.' });
    await deps.command(task.id, 'reopen');
    res.json({ reopened: true });
  })));
  router.post('/preview', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    const errors = conflicts(data.plan);
    if (errors.length) return res.status(409).json({ error: errors.join('\n') });
    const changes = data.tasks.filter(t => !t.completed && !t.missing && !t.recurring).flatMap(task => {
      const final = data.plan.blocks.filter(b => b.taskId === task.id).sort((a, b) => `${a.date}T${a.end}`.localeCompare(`${b.date}T${b.end}`)).at(-1);
      const currentDue = task.due?.datetime || task.due?.date;
      if (final && currentDue?.includes('T')) {
        const currentInstant = /(?:Z|[+-]\d\d:\d\d)$/.test(currentDue) ? currentDue : zonedISO(currentDue.slice(0, 10), currentDue.slice(11, 16), task.due?.timezone || data.plan.timezone);
        if (Date.parse(currentInstant) === Date.parse(zonedISO(final.date, final.end, data.plan.timezone))) return [];
      }
      return final ? [{ taskId: task.id, title: task.title, oldDue: dueKey(task.due), newDate: final.date, newTime: final.end }] : [];
    });
    data.plan.preview = { id: crypto.randomUUID(), revision: data.plan.revision, changes };
    await savePlan(req, data.plan);
    res.json(data.plan.preview);
  })));
  router.post('/apply', handle((req, res) => exclusive(async () => {
    const data = await connectedSnapshot(req);
    const preview = data.plan.preview;
    if (!preview || req.body.previewId !== preview.id || preview.revision !== data.plan.revision) return res.status(409).json({ error: 'Preview expired. Review a fresh preview.' });
    const errors = conflicts(data.plan);
    if (errors.length) return res.status(409).json({ error: errors.join('\n') });
    for (const change of preview.changes.filter(c => c.status !== 'Applied')) {
      const task = data.tasks.find(t => t.id === change.taskId);
      if (!task || task.missing || task.completed || task.recurring || dueKey(task.due) !== change.oldDue) { change.status = 'Conflict: task or Todoist due date changed. Review a new preview.'; continue; }
      if (zonedISO(change.newDate, change.newTime, data.plan.timezone) < now().toISOString()) { change.status = 'Conflict: planned time has passed. Edit the draft and review a new preview.'; continue; }
      try {
        // Always retain deadlines and durations; due is the final block end.
        await deps.command(task.id, 'schedule', { due_datetime: zonedISO(change.newDate, change.newTime, data.plan.timezone) });
        change.status = 'Applied';
      } catch (error: any) { change.status = `Failed: ${error.message}`; }
      // Persist each result so an interrupted batch can retry failures only.
      await savePlan(req, data.plan);
    }
    await savePlan(req, data.plan);
    res.json(preview);
  })));
  return router;
}
